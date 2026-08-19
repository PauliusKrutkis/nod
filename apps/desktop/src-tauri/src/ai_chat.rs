//! Multi-turn AI chat over a pull request — the second AI surface
//! (docs/AI.md § Second surface). One `ai_chat` call is one turn: the
//! webview sends the settled conversation back each time (tool traffic is
//! never replayed), Rust assembles the request and streams the answer back
//! over three events keyed `{chatId, turnId}` — `ai-chat-delta` for content,
//! `ai-chat-tool` for tool activity, and (later) `ai-chat-proposal` for
//! suggested comments. The ask machinery in `ai.rs` is reused whole: the
//! same tool loop over the repo snapshot, the same round-0 degradation to
//! tools-off (narrowed here to the 400/422 that mean "this request may not
//! carry tools" — a 429 retried without them wins the race and answers
//! ungrounded), the same round guard. A refused thinking level is dropped
//! ahead of either, because a gateway that will not route the request says
//! so with the same 429 it uses for a full pool. `ai_chat_cancel` flags a chat id in
//! managed state; the stream checks the flag between chunks and rounds and
//! returns the benign `cancelled` error, which is a stop button, not a
//! failure. History is trimmed oldest-first past a character budget so a
//! long conversation never grows the request without bound — the system
//! prompt and the current turn are never trimmed.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::{self, AskContext};
use crate::snapshot::search as snapshot_search;
use crate::snapshot::store::{self as snapshot_store, SnapshotKey};

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatRegion {
    pub file_path: String,
    pub line_range: String,
    pub code: String,
}

/// The diff positions a comment may anchor to, one entry per (path, side),
/// computed by the webview from the patch with the same rules that gate the
/// composer. Ranges are inclusive, sorted, disjoint — a multi-line proposal
/// must sit inside one of them, which is also what the forges accept.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommentableSide {
    pub path: String,
    pub side: String,
    pub ranges: Vec<(u32, u32)>,
}

/// One piece of the message as written: prose, or code the reviewer attached
/// at that point in the sentence. Order is the whole point — two snippets in
/// one message are only tellable apart by where they sit in the text.
#[derive(Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatPart {
    #[serde(rename_all = "camelCase")]
    Text { text: String },
    #[serde(rename_all = "camelCase")]
    Code { region: ChatRegion },
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatDiffFile {
    pub path: String,
    pub patch: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatProposal {
    pub path: String,
    pub side: String,
    pub line: u32,
    #[serde(default)]
    pub start_line: Option<u32>,
    pub body: String,
}

/// Sent once, the first time a model's route refuses a thinking level.
///
/// Whether a model accepts one cannot be known before asking: the provider's
/// model list carries no capability field, and the platform it runs on does
/// not predict it either — probed 2026-08-19, Claude Sonnet 5 refuses while
/// Gemini 3 Flash, on the same Vertex platform, accepts. So the first refusal
/// is the answer, and the webview keeps it against the model id.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatEffortUnsupported {
    chat_id: String,
    model: String,
}

/// Chat ids whose in-flight turn should stop. A cancel outlives nothing: the
/// flag is cleared when the turn notices it, and a new turn clears any stale
/// flag on entry, so stopping an idle chat is a no-op.
#[derive(Default)]
pub struct ChatCancels(Mutex<HashSet<String>>);

impl ChatCancels {
    fn request(&self, chat_id: &str) {
        if let Ok(mut set) = self.0.lock() {
            set.insert(chat_id.to_string());
        }
    }

    fn requested(&self, chat_id: &str) -> bool {
        self.0
            .lock()
            .map(|set| set.contains(chat_id))
            .unwrap_or(false)
    }

    fn clear(&self, chat_id: &str) {
        if let Ok(mut set) = self.0.lock() {
            set.remove(chat_id);
        }
    }
}

/// Every tool round is a full round-trip through the provider — resend the
/// conversation, wait for thinking, stream the reply — so seven files read
/// one round at a time is seven times slower than seven read in one. The
/// loop already executes every call a round carries; this sentence is what
/// makes the model use that.
const CHAT_SYSTEM_BATCH: &str = "Tool calls in one reply run together, and \
each reply is a slow round-trip: when you know you need several files or \
searches, request them ALL in one reply rather than one at a time.";

const CHAT_SYSTEM_BASE: &str =
    "You are the review chat inside Nod, a pull-request review app. The reviewer \
is reading the pull request beside this conversation. Answer questions about the \
pull request and its code. Ground every claim in the provided code; when you \
reference code, cite it as path:line. Be concise. \
If the provided context is not enough to answer, say exactly what is missing.";

const CHAT_SYSTEM_SNAPSHOT: &str =
    "You have tools over a local snapshot of the repository at the PR's head \
commit: list_files, read_file (numbered lines), and grep_repo (literal, \
case-sensitive). Use them to ground answers in real code instead of guessing — \
look up definitions, callers, and context beyond the diff.";

const CHAT_SYSTEM_SKILLS: &str =
    "Review skills are available: list_skills names them and read_skill fetches \
one; follow a skill's instructions when the reviewer invokes it or asks for the \
kind of review it covers.";

const CHAT_SYSTEM_DIFF: &str =
    "read_diff returns the pull request's unified diff — the whole thing, or one \
file's with a path. The diff is what is being reviewed; the snapshot tools read \
whole files at the head commit.";

const CHAT_SYSTEM_PROPOSALS: &str =
    "You can stage suggested review comments with propose_comment. Only do so \
when the reviewer asked for review feedback (a review pass, a critique, 'leave \
comments'); never for an ordinary question. When a review skill or pass \
produces findings, STAGE each one with propose_comment rather than asking \
which to stage: staging is not posting — every suggestion appears in the diff \
as a pending comment the reviewer accepts or discards, and that IS the \
confirmation step, even when the skill's own instructions say to confirm \
before acting. Stage them BEFORE you write the report, not after: a written \
report can use up the reply budget before a single comment is staged, and a \
finding you described but never staged is one the reviewer has to copy across \
by hand. When a skill's output format asks for a long write-up, stage every \
finding first, then keep the writing short and let the staged comments carry \
the detail. A finding about a file the diff does not touch cannot be staged, \
so write those in the answer and say why. side is LEFT for deleted lines and \
RIGHT for added or unchanged lines, and the line numbers must fall inside the \
diff.";

fn chat_system_prompt(snapshot_ready: bool, skills: bool, proposals: bool, diffs: bool) -> String {
    let mut parts = vec![CHAT_SYSTEM_BASE];
    if snapshot_ready || diffs {
        parts.push(CHAT_SYSTEM_BATCH);
    }
    if snapshot_ready {
        parts.push(CHAT_SYSTEM_SNAPSHOT);
    }
    if skills {
        parts.push(CHAT_SYSTEM_SKILLS);
    }
    if diffs {
        parts.push(CHAT_SYSTEM_DIFF);
    }
    if proposals {
        parts.push(CHAT_SYSTEM_PROPOSALS);
    }
    parts.join(" ")
}

const CHAT_INPUT_CHAR_BUDGET: usize = 120_000;

/// How many tool rounds a chat turn may take before it has to write.
///
/// The number matters less than what happens at it. Agent loops in the wild
/// either run unbounded until the model stops asking (Cursor, Claude Code —
/// with a "continue?" around 25 calls) or cap and fail (the OpenAI Agents
/// SDK's 10, LangChain's 15). Failing at the cap is the worst of the three:
/// the reviewer waited a minute for four words of error. So this is set
/// generously — a review pass reads a file per round and a real pull request
/// has more than sixteen — and reaching it is not an error but a deadline:
/// the tools come off, the model is told it is out of budget, and it answers
/// with what it has and says what it did not reach.
///
/// The real ceiling is the input budget above, which trims oldest-first, and
/// the model's own context.
const CHAT_TOOL_ROUNDS: usize = 32;

/// Prior turns as wire messages, newest kept first when the budget bites.
/// Only user/assistant roles pass through — the webview can never smuggle a
/// system message into the conversation.
fn history_messages(history: &[ChatTurn], budget: usize) -> Vec<Value> {
    let mut kept: Vec<&ChatTurn> = Vec::new();
    let mut total = 0usize;
    for turn in history.iter().rev() {
        if !(turn.role == "user" || turn.role == "assistant") {
            continue;
        }
        total += turn.content.len();
        if total > budget {
            break;
        }
        kept.push(turn);
    }
    kept.reverse();
    kept.iter()
        .map(|turn| serde_json::json!({ "role": turn.role, "content": turn.content }))
        .collect()
}

/// The user message for this turn: PR context sections on the first turn
/// only (later turns already carry them in history), then the invoked
/// skill's instructions, then one fenced block per attached region, then
/// the message itself. The skill rides the user turn rather than a second
/// system message — safer across OpenAI-compatible gateways.
fn region_block(region: &ChatRegion) -> String {
    let heading = if region.file_path.is_empty() {
        "Pasted code:".to_string()
    } else if region.line_range.is_empty() {
        format!("Code from {}:", region.file_path)
    } else {
        format!(
            "Code from {} (lines {}):",
            region.file_path, region.line_range
        )
    };
    format!("{heading}\n```\n{}\n```", region.code)
}

/// The message as the reviewer wrote it, code inline where they put it.
/// Falls back to the older shape (all regions, then the text) for turns that
/// predate the inline composer.
fn build_message_body(message: &str, parts: &[ChatPart], regions: &[ChatRegion]) -> String {
    if parts.is_empty() {
        let mut out: Vec<String> = regions.iter().map(region_block).collect();
        out.push(message.to_string());
        return out.join("\n\n");
    }
    let mut out = String::new();
    for part in parts {
        match part {
            ChatPart::Text { text } => out.push_str(text),
            ChatPart::Code { region } => {
                if !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push_str(&region_block(region));
                out.push('\n');
            }
        }
    }
    out.trim().to_string()
}

fn build_chat_turn(
    message: &str,
    parts: &[ChatPart],
    regions: &[ChatRegion],
    context: &AskContext,
    first_turn: bool,
    skills: &[String],
) -> String {
    let mut sections: Vec<String> = Vec::new();
    if first_turn {
        sections.push(format!("Pull request: {}", context.pr_title));
        if !context.pr_body.trim().is_empty() {
            sections.push(format!("PR description:\n{}", context.pr_body.trim()));
        }
        if let Some(summary) = context.diff_summary.as_deref() {
            sections.push(format!("Changed files:\n{summary}"));
        }
    }
    // Several skills can ride one message — a validity pass and a security
    // pass over the same diff is a reasonable ask — so they are numbered
    // rather than concatenated into one wall of instructions.
    for (i, body) in skills.iter().enumerate() {
        let heading = if skills.len() == 1 {
            "Follow these instructions for this task:".to_string()
        } else {
            format!("Instructions {} of {}:", i + 1, skills.len())
        };
        sections.push(format!("{heading}\n\n{body}"));
    }
    sections.push(build_message_body(message, parts, regions));
    sections.join("\n\n")
}

/// Where a repository keeps its skills. `.claude/skills/` is the agent-skills
/// default and wins a name clash; the rest are the directories the other
/// agents and the `npx skills` installer use, and `skills/` is what repos
/// that predate the convention (this one included) actually carry. Looking
/// in only one of them means a reviewer who can see the file in their own
/// tree cannot invoke it.
const SKILL_ROOTS: [&str; 5] = [
    ".claude/skills/",
    ".agents/skills/",
    ".cursor/skills/",
    ".codex/skills/",
    "skills/",
];

/// Skills Nod ships with. `find-skill` is the one that makes the others
/// reachable: with no skills at all, `/` would otherwise be an empty menu
/// and nothing would tell you what a skill is or how to get one.
const BUILTIN_SKILLS: &[(&str, &str, &str)] = &[(
    "find-skill",
    "Find a skill for what you are about to do, or write one",
    "The reviewer wants a skill for a task. Work in this order.\n\n1. Call list_skills. If one already covers the task, say which, quote its description, and tell them to invoke it with a leading slash — then stop.\n2. If none fits, and you do not know what they want a skill for, ask. One question, then wait.\n3. Call search_skills with what they told you. It searches the public catalog, which is far wider than what is installed here. Show the best few hits as a short list: name, where it comes from, how many installs.\n4. When they pick one, call fetch_skill and show the instructions — the whole thing if it is short, the substance of it if it is long. A skill is instructions you will follow over their code, so they read it before it lands, never after.\n5. Save it with write_skill only once they have said yes, keeping the author's text.\n\nA skill this repository carries works here already — say so and stop, unless they want it to follow them into other repositories, which is read_skill then write_skill with the author's text. If the catalog has nothing that fits, offer to write one instead: draft a short kebab-case name, a one-line description, and instructions grounded in this repository's conventions, show the draft, and save it the same way. Never write a skill without showing it first, and never invent one that already exists under another name."
)];

fn builtin_skills() -> Vec<SkillInfo> {
    BUILTIN_SKILLS
        .iter()
        .map(|(name, description, _)| SkillInfo {
            description: (*description).to_string(),
            name: (*name).to_string(),
            source: "built-in".to_string(),
        })
        .collect()
}

fn builtin_skill_body(name: &str) -> Option<String> {
    BUILTIN_SKILLS
        .iter()
        .find(|(skill, _, _)| *skill == name)
        .map(|(_, _, body)| (*body).to_string())
}
const MAX_SKILL_BODY_CHARS: usize = 32_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
}

/// `.claude/skills/<name>/SKILL.md` → the skill's name; anything else — a
/// nested path, a stray file beside the manifest — is not a skill.
/// A skill's name is the directory holding its `SKILL.md`, however deep it
/// sits — collections group skills into folders (`skills/engineering/
/// code-review/SKILL.md`) and the group is not part of the name.
fn skill_name_from_path(path: &str) -> Option<&str> {
    let rest = SKILL_ROOTS
        .iter()
        .find_map(|prefix| path.strip_prefix(prefix))?;
    let (dirs, file) = rest.rsplit_once('/')?;
    if file != "SKILL.md" {
        return None;
    }
    let name = dirs.rsplit('/').next().unwrap_or(dirs);
    (!name.is_empty()).then_some(name)
}

/// Every `SKILL.md` in the snapshot, as (name, path). `.claude/skills` is
/// walked first so its entry is the one that survives a name clash.
fn skill_paths(root: &std::path::Path, key: &SnapshotKey) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for prefix in SKILL_ROOTS {
        let Some(listing) = snapshot_search::list_files(root, key, Some(prefix)) else {
            continue;
        };
        for path in listing.files {
            let Some(name) = skill_name_from_path(&path) else {
                continue;
            };
            if out.iter().any(|(seen, _)| seen == name) {
                continue;
            }
            out.push((name.to_string(), path));
        }
    }
    out
}

/// The `description:` scalar from a leading `---` frontmatter block, by hand
/// — the agent-skills format needs two lines of YAML, not a YAML dependency.
fn frontmatter_description(body: &str) -> String {
    let mut lines = body.lines();
    if lines.next().map(str::trim) != Some("---") {
        return String::new();
    }
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("description:") {
            return value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
        }
    }
    String::new()
}

/// Everything after the frontmatter — the instructions a skill injects. A
/// file with no frontmatter is all instructions.
fn skill_instructions(body: &str) -> &str {
    let Some(rest) = body.strip_prefix("---") else {
        return body.trim();
    };
    match rest.find("\n---") {
        Some(at) => {
            let after_fence = &rest[at + 4..];
            match after_fence.find('\n') {
                Some(nl) => after_fence[nl + 1..].trim(),
                None => "",
            }
        }
        None => body.trim(),
    }
}

fn safe_skill_name(name: &str) -> bool {
    !(name.is_empty()
        || name.starts_with('.')
        || name.contains('/')
        || name.contains('\\')
        || name.contains(".."))
}

fn skill_text(bytes: &[u8]) -> String {
    let mut text = String::from_utf8_lossy(bytes).replace("\r\n", "\n");
    if text.chars().count() > MAX_SKILL_BODY_CHARS {
        let cut = text
            .char_indices()
            .nth(MAX_SKILL_BODY_CHARS)
            .map(|(i, _)| i)
            .unwrap_or(text.len());
        text.truncate(cut);
        text.push_str("\n[truncated — the skill file continues]");
    }
    text
}

fn read_skill_body(root: &std::path::Path, key: &SnapshotKey, name: &str) -> Option<String> {
    if !safe_skill_name(name) {
        return None;
    }
    // The conventional paths first — one read each, and they cover every
    // skill that isn't filed inside a group — then the listing for the rest.
    let direct = SKILL_ROOTS
        .iter()
        .map(|prefix| format!("{prefix}{name}/SKILL.md"))
        .find_map(|path| snapshot_store::read_file(root, key, &path));
    let bytes = match direct {
        Some(bytes) => bytes,
        None => {
            let path = skill_paths(root, key)
                .into_iter()
                .find(|(found, _)| found == name)
                .map(|(_, path)| path)?;
            snapshot_store::read_file(root, key, &path)?
        }
    };
    Some(skill_text(&bytes))
}

/// Where a reviewer's own skills live, in the order they are searched.
///
/// `~/.claude/skills` first: that is the user-level location the agent-skills
/// ecosystem shares — Claude Code writes there, `npx skills -g` installs
/// there — and a reviewer who has already written a review pass expects Nod
/// to know about it rather than to send them shopping for a copy. The other
/// agents' folders follow, then Nod's own config directory, so skills
/// written before this still resolve.
fn personal_skills_dirs(app: &AppHandle) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(home) = app.path().home_dir() {
        for agent in HOME_SKILL_DIRS {
            dirs.push(home.join(agent).join("skills"));
        }
    }
    if let Ok(config) = crate::storage::config_dir(app) {
        dirs.push(config.join("skills"));
    }
    dirs
}

/// The user-level skill folders the agents on a machine keep, searched in
/// this order. They are genuinely different sets — the same reviewer can
/// have a review pass in one and a Jira helper in another — so Nod reads all
/// of them rather than picking a favourite.
const HOME_SKILL_DIRS: [&str; 4] = [".claude", ".agents", ".cursor", ".codex"];

fn read_personal_skill(dirs: &[std::path::PathBuf], name: &str) -> Option<String> {
    if !safe_skill_name(name) {
        return None;
    }
    personal_skill_paths(dirs)
        .into_iter()
        .find(|(found, _)| found == name)
        .and_then(|(_, path)| std::fs::read(path).ok())
        .map(|bytes| skill_text(&bytes))
}

/// Every `SKILL.md` under the personal directories, as (name, path). One
/// level of grouping is walked as well as the flat layout, because
/// collections install as `skills/<group>/<name>/SKILL.md`.
fn personal_skill_paths(dirs: &[std::path::PathBuf]) -> Vec<(String, std::path::PathBuf)> {
    let mut out: Vec<(String, std::path::PathBuf)> = Vec::new();
    let mut push = |name: String, path: std::path::PathBuf| {
        if path.is_file() && !out.iter().any(|(seen, _)| *seen == name) {
            out.push((name, path));
        }
    };
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            if !safe_skill_name(&name) {
                continue;
            }
            let folder = entry.path();
            push(name, folder.join("SKILL.md"));
            let Ok(nested) = std::fs::read_dir(&folder) else {
                continue;
            };
            for child in nested.flatten() {
                if let Ok(inner) = child.file_name().into_string() {
                    if safe_skill_name(&inner) {
                        push(inner, child.path().join("SKILL.md"));
                    }
                }
            }
        }
    }
    out
}

/// Writes a skill the model drafted. Refuses to overwrite: replacing a skill
/// the reviewer wrote, without being asked to, is not a thing a tool call
/// should be able to do.
fn write_personal_skill(
    dirs: &[std::path::PathBuf],
    name: &str,
    description: &str,
    instructions: &str,
) -> Result<std::path::PathBuf, String> {
    // The first directory is the shared user-level one, so a skill written
    // here is a skill every agent-skills tool on this machine can see.
    let dir = dirs
        .first()
        .ok_or_else(|| "no personal skills folder is available".to_string())?;
    if !safe_skill_name(name) {
        return Err(format!("'{name}' is not a usable skill name"));
    }
    let skill = dir.join(name);
    if skill.join("SKILL.md").exists() {
        return Err(format!("'{name}' already exists — pick another name"));
    }
    std::fs::create_dir_all(&skill).map_err(|e| format!("could not create the folder: {e}"))?;
    let body = format!(
        "---\nname: {name}\ndescription: {}\n---\n\n{}\n",
        description.replace('\n', " "),
        instructions.trim()
    );
    std::fs::write(skill.join("SKILL.md"), body)
        .map_err(|e| format!("could not write the skill: {e}"))?;
    Ok(skill)
}

fn discover_personal_skills(dirs: &[std::path::PathBuf]) -> Vec<SkillInfo> {
    let mut out: Vec<SkillInfo> = personal_skill_paths(dirs)
        .into_iter()
        .filter_map(|(name, path)| {
            let bytes = std::fs::read(path).ok()?;
            Some(SkillInfo {
                description: frontmatter_description(&skill_text(&bytes)),
                name,
                source: "personal".to_string(),
            })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Repo and personal skills merged, the repo winning a name clash — a repo
/// that carries its own conventions outranks the general-purpose copy.
fn merge_skills(repo: Vec<SkillInfo>, personal: Vec<SkillInfo>) -> Vec<SkillInfo> {
    let mut out = repo;
    for skill in personal {
        if !out.iter().any(|s| s.name == skill.name) {
            out.push(skill);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn resolve_skill_body(
    snapshot: Option<&(std::path::PathBuf, SnapshotKey)>,
    personal: &[std::path::PathBuf],
    name: &str,
) -> Option<String> {
    snapshot
        .and_then(|(root, key)| read_skill_body(root, key, name))
        .or_else(|| read_personal_skill(personal, name))
        .or_else(|| builtin_skill_body(name))
}

fn discover_skills(root: &std::path::Path, key: &SnapshotKey) -> Vec<SkillInfo> {
    let mut out: Vec<SkillInfo> = skill_paths(root, key)
        .into_iter()
        .map(|(name, _)| SkillInfo {
            description: read_skill_body(root, key, &name)
                .map(|body| frontmatter_description(&body))
                .unwrap_or_default(),
            name,
            source: "repo".to_string(),
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// The public skills catalog (skills.sh), the same index `npx skills find`
/// searches. Nod reads it and nothing else: no install step, no code fetched
/// and run. A found skill is fetched as text, shown in the chat, and only
/// written to disk when the reviewer says so — the supply-chain decision
/// stays theirs, made against the actual instructions rather than a name.
const SKILLS_CATALOG: &str = "https://skills.sh/api/search";
const MAX_CATALOG_HITS: usize = 8;

fn url_query(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// "owner/repo", and nothing that could steer a URL somewhere else.
fn safe_source(source: &str) -> bool {
    let mut parts = source.split('/');
    let (Some(owner), Some(repo), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    [owner, repo].iter().all(|part| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            && *part != "."
            && *part != ".."
    })
}

/// Same 120s ceiling as ask_client: these run inside the tool loop, where
/// the cancel flag is only checked BETWEEN calls — an unbounded request on a
/// hung host would wedge the turn with a Stop that cannot land.
fn catalog_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("could not build http client: {e}"))
}

async fn search_public_skills(query: &str) -> String {
    if query.trim().is_empty() {
        return "error: search_skills needs something to search for".to_string();
    }
    let Ok(client) = catalog_client() else {
        return "error: could not reach the catalog".to_string();
    };
    let url = format!("{SKILLS_CATALOG}?q={}", url_query(query.trim()));
    let response = match client
        .get(url)
        .header(reqwest::header::USER_AGENT, "nod")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => return format!("error: the catalog answered {}", r.status().as_u16()),
        Err(e) => return format!("error: could not reach the catalog ({e})"),
    };
    let Ok(body) = response.json::<Value>().await else {
        return "error: the catalog answered with something unreadable".to_string();
    };
    let mut lines = Vec::new();
    let mut seen = HashSet::new();
    for hit in body
        .get("skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let name = hit.get("name").and_then(Value::as_str).unwrap_or_default();
        let source = hit
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if name.is_empty()
            || !safe_source(source)
            || !seen.insert((name.to_string(), source.to_string()))
        {
            continue;
        }
        let installs = hit.get("installs").and_then(Value::as_u64).unwrap_or(0);
        lines.push(format!("{name} — {source} ({installs} installs)"));
        if lines.len() == MAX_CATALOG_HITS {
            break;
        }
    }
    if lines.is_empty() {
        return "(the catalog had nothing for that)".to_string();
    }
    lines.join("\n")
}

/// One catalog skill's instructions, verbatim. The repository's file tree
/// names the path — skills sit at any depth — and the raw file is read
/// unauthenticated, so no account credential reaches a third-party host.
async fn fetch_public_skill(source: &str, name: &str) -> String {
    if !safe_source(source) || !safe_skill_name(name) {
        return "error: that source and name pair is not one I can fetch".to_string();
    }
    let Ok(client) = catalog_client() else {
        return "error: could not reach GitHub".to_string();
    };
    let tree_url = format!("https://api.github.com/repos/{source}/git/trees/HEAD?recursive=1");
    let tree = match client
        .get(tree_url)
        .header(reqwest::header::USER_AGENT, "nod")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r.json::<Value>().await.unwrap_or(Value::Null),
        Ok(r) => return format!("error: {source} answered {}", r.status().as_u16()),
        Err(e) => return format!("error: could not read {source} ({e})"),
    };
    let wanted = format!("{name}/SKILL.md");
    let Some(path) = tree
        .get("tree")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("path").and_then(Value::as_str))
        .find(|path| *path == wanted || path.ends_with(&format!("/{wanted}")))
    else {
        return format!("error: {source} has no skill called {name}");
    };
    let raw = format!("https://raw.githubusercontent.com/{source}/HEAD/{path}");
    match client
        .get(raw)
        .header(reqwest::header::USER_AGENT, "nod")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.text().await {
            Ok(body) => body.chars().take(MAX_SKILL_BODY_CHARS).collect(),
            Err(e) => format!("error: could not read the skill ({e})"),
        },
        Ok(r) => format!("error: the skill file answered {}", r.status().as_u16()),
        Err(e) => format!("error: could not fetch the skill ({e})"),
    }
}

fn execute_skill_tool(
    snapshot: Option<&(std::path::PathBuf, SnapshotKey)>,
    personal: &[std::path::PathBuf],
    name: &str,
    arguments: &str,
) -> String {
    match name {
        "list_skills" => {
            let repo = snapshot
                .map(|(root, key)| discover_skills(root, key))
                .unwrap_or_default();
            let personal_list = discover_personal_skills(personal);
            let skills = merge_skills(merge_skills(repo, personal_list), builtin_skills());
            if skills.is_empty() {
                "(no skills available)".to_string()
            } else {
                skills
                    .iter()
                    .map(|s| {
                        if s.description.is_empty() {
                            s.name.clone()
                        } else {
                            format!("{} — {}", s.name, s.description)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
        "write_skill" => {
            let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
            let (Some(name), Some(description), Some(instructions)) = (
                args.get("name").and_then(Value::as_str),
                args.get("description").and_then(Value::as_str),
                args.get("instructions").and_then(Value::as_str),
            ) else {
                return "error: write_skill needs name, description and instructions".to_string();
            };
            match write_personal_skill(personal, name, description, instructions) {
                Ok(path) => format!(
                    "saved to {}: /{name} is available from the next message",
                    path.display()
                ),
                Err(e) => format!("error: {e}"),
            }
        }
        _ => {
            let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
            match args.get("name").and_then(Value::as_str) {
                Some(skill) => resolve_skill_body(snapshot, personal, skill)
                    .map(|body| skill_instructions(&body).to_string())
                    .unwrap_or_else(|| {
                        "error: no such skill — check the name with list_skills".to_string()
                    }),
                None => "error: read_skill requires a string 'name'".to_string(),
            }
        }
    }
}

fn skills_tools() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_skills",
                "description": "List the repository's review skills (.claude/skills) as 'name — description' lines.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_skill",
                "description": "Read one skill's instructions by name.",
                "parameters": {
                    "type": "object",
                    "properties": { "name": { "type": "string" } },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "search_skills",
                "description": "Search the public skills catalog (skills.sh) for skills other people have published. Returns 'name — owner/repo (installs)' lines.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "what the reviewer wants a skill for, in a few words" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fetch_skill",
                "description": "Read a catalogued skill's instructions. Show them to the reviewer before saving anything.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": { "type": "string", "description": "the owner/repo from search_skills" },
                        "name": { "type": "string", "description": "the skill name from search_skills" }
                    },
                    "required": ["source", "name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_skill",
                "description": "Save a new personal skill. Show the reviewer the draft before calling this.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "kebab-case, becomes the folder name" },
                        "description": { "type": "string", "description": "one line, shown in the picker" },
                        "instructions": { "type": "string", "description": "what the model should do when the skill is invoked" }
                    },
                    "required": ["name", "description", "instructions"]
                }
            }
        }),
    ]
}

#[tauri::command]
pub async fn list_chat_skills(
    app: AppHandle,
    owner: String,
    repo: String,
    head_sha: String,
) -> Result<Vec<SkillInfo>, String> {
    let context = AskContext {
        head_sha: Some(head_sha),
        owner: Some(owner),
        repo: Some(repo),
        ..AskContext::default()
    };
    let personal = personal_skills_dirs(&app);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    tauri::async_runtime::spawn_blocking(move || {
        let repo_skills = snapshot
            .as_ref()
            .map(|(root, key)| discover_skills(root, key))
            .unwrap_or_default();
        let personal_skills = discover_personal_skills(&personal);
        merge_skills(merge_skills(repo_skills, personal_skills), builtin_skills())
    })
    .await
    .map_err(|e| format!("skill discovery failed: {e}"))
}

fn propose_comment_tool() -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "propose_comment",
            "description": "Stage a suggested review comment on a diff line. The reviewer accepts, edits or discards it — it is never posted directly. Only call this when the reviewer asked for review feedback.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path exactly as it appears in the diff." },
                    "side": { "type": "string", "enum": ["LEFT", "RIGHT"], "description": "LEFT for deleted lines, RIGHT for added or unchanged lines." },
                    "line": { "type": "integer", "description": "The line the comment anchors to (the range end for multi-line)." },
                    "start_line": { "type": "integer", "description": "First line of a multi-line comment; must be ≤ line and in the same contiguous diff range." },
                    "body": { "type": "string", "description": "The comment, as markdown. A ```suggestion fence proposes replacement code." }
                },
                "required": ["path", "side", "line", "body"]
            }
        }
    })
}

fn chat_tools(snapshot_ready: bool, skills: bool, proposals: bool, diffs: bool) -> Value {
    let mut tools = if snapshot_ready {
        ai::ask_tools().as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    if skills {
        tools.extend(skills_tools());
    }
    if diffs {
        tools.push(read_diff_tool());
    }
    if proposals {
        tools.push(propose_comment_tool());
    }
    Value::Array(tools)
}

fn read_diff_tool() -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "read_diff",
            "description": "Read the pull request's unified diff. Without a path, the whole diff (capped); with a path, that file's diff.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "One file's path exactly as it appears in the diff." }
                }
            }
        }
    })
}

const MAX_DIFF_REPLY_CHARS: usize = 60_000;

/// Serves read_diff from the patches the webview attached to the request —
/// no network, no git. The whole-diff form is capped and names the files it
/// left out so the model can fetch them one by one.
fn execute_read_diff(diffs: &[ChatDiffFile], arguments: &str) -> String {
    let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
    if let Some(path) = args.get("path").and_then(Value::as_str) {
        return diffs
            .iter()
            .find(|d| d.path == path)
            .map(|d| format!("=== {} ===\n{}", d.path, d.patch))
            .unwrap_or_else(|| {
                let names: Vec<&str> = diffs.iter().map(|d| d.path.as_str()).collect();
                format!(
                    "error: no diff for '{path}' — files in this diff:\n{}",
                    names.join("\n")
                )
            });
    }
    let mut out = String::new();
    let mut left_out: Vec<&str> = Vec::new();
    for diff in diffs {
        let entry = format!("=== {} ===\n{}\n\n", diff.path, diff.patch);
        if out.len() + entry.len() > MAX_DIFF_REPLY_CHARS {
            left_out.push(&diff.path);
        } else {
            out.push_str(&entry);
        }
    }
    if !left_out.is_empty() {
        out.push_str(&format!(
            "[truncated — request these files by path: {}]",
            left_out.join(", ")
        ));
    }
    if out.is_empty() {
        "(the diff is empty)".to_string()
    } else {
        out
    }
}

fn format_ranges(ranges: &[(u32, u32)]) -> String {
    ranges
        .iter()
        .map(|(a, b)| {
            if a == b {
                a.to_string()
            } else {
                format!("{a}–{b}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Reads a propose_comment call's arguments into a proposal, rejecting what
/// serde alone would let through: a side beyond LEFT/RIGHT and an empty body.
fn parse_proposal(arguments: &str) -> Result<ChatProposal, String> {
    let proposal: ChatProposal = serde_json::from_str(arguments)
        .map_err(|e| format!("error: propose_comment arguments did not parse: {e}"))?;
    if !(proposal.side == "LEFT" || proposal.side == "RIGHT") {
        return Err("error: side must be LEFT or RIGHT".to_string());
    }
    if proposal.body.trim().is_empty() {
        return Err("error: body must not be empty".to_string());
    }
    Ok(proposal)
}

/// The validity oracle, mirroring the webview's composer rules: the whole
/// span must sit inside one contiguous commentable range on one side. A miss
/// answers with the ranges that would work, so the model can correct itself
/// within the same turn.
fn validate_proposal(
    commentable: &[CommentableSide],
    proposal: &ChatProposal,
) -> Result<(), String> {
    let start = proposal.start_line.unwrap_or(proposal.line);
    if start > proposal.line {
        return Err(format!(
            "error: start_line {start} is past line {} — start_line must be ≤ line",
            proposal.line
        ));
    }
    let Some(entry) = commentable
        .iter()
        .find(|c| c.path == proposal.path && c.side == proposal.side)
    else {
        let other = commentable.iter().find(|c| c.path == proposal.path);
        return Err(match other {
            Some(o) => format!(
                "error: {} has no commentable {} lines in this diff — commentable {} ranges: {}",
                proposal.path,
                proposal.side,
                o.side,
                format_ranges(&o.ranges)
            ),
            None => format!("error: {} is not part of this diff", proposal.path),
        });
    };
    let fits = entry
        .ranges
        .iter()
        .any(|(a, b)| *a <= start && proposal.line <= *b);
    if fits {
        Ok(())
    } else {
        Err(format!(
            "error: {} lines {}–{} ({}) are not commentable in this diff — commentable {} ranges: {}",
            proposal.path,
            start,
            proposal.line,
            proposal.side,
            proposal.side,
            format_ranges(&entry.ranges)
        ))
    }
}

/// One human-readable line per tool call, shown in the transcript while the
/// round runs ("Searching for …"). Unknown tools and bad arguments still get
/// a line — the activity is visible even when the call is doomed.
fn tool_note(name: &str, arguments: &str) -> String {
    let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
    let path_contains = args.get("path_contains").and_then(Value::as_str);
    match name {
        "propose_comment" => match (
            args.get("path").and_then(Value::as_str),
            args.get("line").and_then(Value::as_u64),
        ) {
            (Some(path), Some(line)) => format!("Suggesting a comment on {path}:{line}"),
            _ => "Suggesting a comment".to_string(),
        },
        "list_files" => match path_contains {
            Some(filter) => format!("Listing files matching \"{filter}\""),
            None => "Listing files".to_string(),
        },
        "grep_repo" => match args.get("pattern").and_then(Value::as_str) {
            Some(pattern) => format!("Searching for \"{pattern}\""),
            None => "Searching the repository".to_string(),
        },
        "read_diff" => match args.get("path").and_then(Value::as_str) {
            Some(path) => format!("Reading the diff for {path}"),
            None => "Reading the diff".to_string(),
        },
        "list_skills" => "Listing skills".to_string(),
        "search_skills" => match args.get("query").and_then(Value::as_str) {
            Some(query) => format!("Searching skills for \"{query}\""),
            None => "Searching the skills catalog".to_string(),
        },
        "fetch_skill" => match args.get("name").and_then(Value::as_str) {
            Some(name) => format!("Reading the {name} skill"),
            None => "Reading a catalogued skill".to_string(),
        },
        "write_skill" => match args.get("name").and_then(Value::as_str) {
            Some(name) => format!("Writing the {name} skill"),
            None => "Writing a skill".to_string(),
        },
        "read_skill" => match args.get("name").and_then(Value::as_str) {
            Some(skill) => format!("Reading skill {skill}"),
            None => "Reading a skill".to_string(),
        },
        "read_file" => match args.get("path").and_then(Value::as_str) {
            Some(path) => match (
                args.get("start_line").and_then(Value::as_u64),
                args.get("end_line").and_then(Value::as_u64),
            ) {
                (Some(start), Some(end)) => format!("Reading {path} (lines {start}–{end})"),
                _ => format!("Reading {path}"),
            },
            None => "Reading a file".to_string(),
        },
        _ => format!("Running {name}"),
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatDelta {
    chat_id: String,
    turn_id: String,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatReasoning {
    chat_id: String,
    turn_id: String,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatToolNote {
    chat_id: String,
    turn_id: String,
    tool: String,
    detail: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatProposalEvent {
    chat_id: String,
    turn_id: String,
    proposal: ChatProposal,
}

/// What to say when the model returns no text. "Empty answer" is true but
/// useless; running out of room mid-thought is a different problem with a
/// different fix, and the provider says which it was.
fn empty_answer(message: &Value) -> String {
    let reason = message
        .get("finish_reason")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if reason == "length" {
        return "The model used its whole budget before it answered. Long \
             skills and thinking models do this. Ask again more narrowly, or \
             pick a model that thinks less."
            .to_string();
    }
    if reason.is_empty() || reason == "stop" {
        return "The provider returned an empty answer.".to_string();
    }
    format!("The model stopped without answering (the provider said: {reason}).")
}

/// Whether a failure reads like the route refusing the request's shape
/// rather than refusing the reviewer.
///
/// Nexos answers a request carrying a parameter its chosen provider does not
/// take with `429 {"code":102200,"message":"All providers are rate limited"}`
/// — the same status and wording it uses when the pool really is exhausted.
/// Probed 2026-08-18: Claude Sonnet 5 routes to vertex-ai, which refuses
/// `reasoning_effort` on every request, in 100ms, at any level; Sonnet 4.5
/// routes to anthropic and takes it. An invented `banana_split` parameter
/// draws the identical 429, which is what proves it is the request shape and
/// not the account.
fn route_refused(error: &str) -> bool {
    let status = error
        .strip_prefix("AI provider error (")
        .and_then(|rest| rest.split(')').next())
        .and_then(|code| code.parse::<u16>().ok());
    matches!(status, Some(400 | 422 | 429))
}

/// Whether a failed first round is worth retrying with the tools taken off.
/// The ladder exists for providers that reject a request carrying `tools` at
/// all, which they answer with 400 or 422. A rate limit, an expired key or a
/// forbidden model is not that: the retry cannot fix it, so it spends a
/// second call on the same refusal — and against a rate-limited gateway that
/// second call is the one that might win, answering with no repo access, no
/// skills and nothing staged, without ever saying so.
fn retry_without_tools(error: &str) -> bool {
    let status = error
        .strip_prefix("AI provider error (")
        .and_then(|rest| rest.split(')').next())
        .and_then(|code| code.parse::<u16>().ok());
    matches!(status, Some(400 | 422))
}

/// An answer that came back only after the tools were dropped says so. It
/// reads like any other answer otherwise, and "no files were read" is the
/// difference between a grounded review and a guess.
fn note_if_toolless(dropped: bool, answer: String) -> String {
    if !dropped {
        return answer;
    }
    format!(
        "{answer}\n\n---\n\n**This answer was written without repo access.** The \
provider rejected the request while it carried tools, so it ran again without \
them: no files were read, no skill ran, and nothing could be staged as a \
comment. Treat it as ungrounded, and try again if the provider was only \
having a bad minute."
    )
}

/// A reply cut off by the output budget still has text worth showing, so it
/// is shown — with a line saying it was cut. Without one a review that
/// stopped mid-sentence reads as a finished review, and the findings the
/// model never got to look like findings it did not have.
fn note_if_truncated(message: &Value, answer: String) -> String {
    let truncated = message
        .get("finish_reason")
        .and_then(Value::as_str)
        .is_some_and(|reason| reason == "length");
    if !truncated {
        return answer;
    }
    format!(
        "{answer}\n\n---\n\n**This answer stopped at the model's output budget.** \
Whatever it had not written yet is missing, including comments it had not \
staged. Thinking models spend the same budget on thought, so a long skill can \
run out before the first comment is staged. Ask for the rest, narrow the \
request, or run the skill over fewer files."
    )
}

/// Validates and, when valid, emits the proposal to the webview to stage.
/// Either way the return is the tool result the model reads.
fn run_propose_comment(
    app: &AppHandle,
    commentable: &[CommentableSide],
    chat_id: &str,
    turn_id: &str,
    arguments: &str,
) -> String {
    let proposal = match parse_proposal(arguments) {
        Ok(p) => p,
        Err(e) => return e,
    };
    if let Err(e) = validate_proposal(commentable, &proposal) {
        return e;
    }
    let label = format!("staged: {}:{}", proposal.path, proposal.line);
    let _ = app.emit(
        "ai-chat-proposal",
        ChatProposalEvent {
            chat_id: chat_id.to_string(),
            turn_id: turn_id.to_string(),
            proposal,
        },
    );
    label
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, ChatCancels>,
    chat_id: String,
    turn_id: String,
    message: String,
    regions: Vec<ChatRegion>,
    parts: Vec<ChatPart>,
    history: Vec<ChatTurn>,
    context: AskContext,
    commentable: Vec<CommentableSide>,
    diffs: Vec<ChatDiffFile>,
    skills: Vec<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<String, String> {
    let config = ai::load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = model
        .filter(|m| !m.trim().is_empty())
        .or(config.model)
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    state.clear(&chat_id);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    let personal_skills = personal_skills_dirs(&app);
    let mut skill_bodies: Vec<String> = Vec::new();
    for name in &skills {
        match resolve_skill_body(snapshot.as_ref(), &personal_skills, name) {
            Some(body) => skill_bodies.push(skill_instructions(&body).to_string()),
            None => return Err(format!("Skill '{name}' was not found.")),
        }
    }
    // Built-ins mean the skill tools are always worth offering: /find-skill
    // exists before the reviewer has written anything.
    let skills_available = true;
    let proposals = !commentable.is_empty();
    let has_diffs = !diffs.is_empty();
    let system = chat_system_prompt(snapshot.is_some(), skills_available, proposals, has_diffs);
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    messages.extend(history_messages(&history, CHAT_INPUT_CHAR_BUDGET));
    let mut turn_content = build_chat_turn(
        &message,
        &parts,
        &regions,
        &context,
        history.is_empty(),
        &skill_bodies,
    );
    // A review skill's first act is always "read the diff", one round-trip
    // per file. The diff is sitting right here — hand it over with the turn
    // and those rounds never happen.
    if !(skill_bodies.is_empty() || diffs.is_empty()) {
        turn_content.push_str(&format!(
            "\n\nThe pull request's full diff, so you do not need read_diff:\n\n{}",
            execute_read_diff(&diffs, "{}")
        ));
    }
    messages.push(serde_json::json!({
        "role": "user",
        "content": turn_content,
    }));
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let mut tools_enabled = snapshot.is_some() || proposals || has_diffs;
    let mut tools_dropped = false;
    // The reviewer's thinking level. Dropped at most once per turn: a second
    // failure is the provider's, not ours.
    let mut effort_sent = effort.clone();
    let mut rounds = 0;
    // Set once, after a round that produced neither text nor a tool call.
    let mut forced_text = false;
    // Whether any earlier round streamed prose, and whether this one has:
    // rounds are separate paragraphs to the model, and gluing their pieces
    // together printed "…defers to.Let me read…" in the transcript.
    let streamed_before = std::sync::atomic::AtomicBool::new(false);
    let round_streamed = std::sync::atomic::AtomicBool::new(false);
    // Set once, when the tool budget runs out.
    let mut out_of_budget = false;
    loop {
        if state.requested(&chat_id) {
            state.clear(&chat_id);
            return Err(ai::CANCELLED.to_string());
        }
        if rounds == CHAT_TOOL_ROUNDS && !out_of_budget {
            out_of_budget = true;
            messages.push(serde_json::json!({
                "role": "user",
                "content": "You have used the tool budget for this turn. Answer now \
            from what you have already read, and say plainly what you did not get to."
            }));
        }
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            // A review pass is a long answer, and a thinking model spends
            // this budget on reasoning before a word of it reaches the
            // reviewer — 2000 (the ask-note budget) ran out mid-thought and
            // returned nothing at all.
            "max_completion_tokens": 8000,
            "stream": true,
        });
        // Only when the reviewer asked for one: a gateway configured for deep
        // reasoning applies it to every round, including the ones that just
        // read two files, and sending nothing leaves that choice where it
        // already lives.
        if let Some(level) = effort_sent.as_deref().filter(|e| !e.trim().is_empty()) {
            body["reasoning_effort"] = serde_json::json!(level);
        }
        if tools_enabled {
            body["tools"] = chat_tools(snapshot.is_some(), skills_available, proposals, has_diffs);
            if forced_text || rounds >= CHAT_TOOL_ROUNDS {
                body["tool_choice"] = serde_json::json!("none");
            }
        }
        round_streamed.store(false, std::sync::atomic::Ordering::Relaxed);
        let round_started = std::time::Instant::now();
        let emit_delta = |piece: &ai::StreamPiece| {
            use std::sync::atomic::Ordering::Relaxed;
            if let Some(text) = &piece.content {
                if !round_streamed.swap(true, Relaxed) && streamed_before.load(Relaxed) {
                    let _ = app.emit(
                        "ai-chat-delta",
                        ChatDelta {
                            chat_id: chat_id.clone(),
                            turn_id: turn_id.clone(),
                            text: "\n\n".to_string(),
                        },
                    );
                }
                let _ = app.emit(
                    "ai-chat-delta",
                    ChatDelta {
                        chat_id: chat_id.clone(),
                        turn_id: turn_id.clone(),
                        text: text.clone(),
                    },
                );
            }
            if let Some(text) = &piece.reasoning {
                let _ = app.emit(
                    "ai-chat-reasoning",
                    ChatReasoning {
                        chat_id: chat_id.clone(),
                        turn_id: turn_id.clone(),
                        text: text.clone(),
                    },
                );
            }
        };
        let should_stop = || state.requested(&chat_id);
        let message_value = match ai::stream_chat(
            &client,
            &url,
            &config.api_key,
            &body,
            emit_delta,
            should_stop,
        )
        .await
        {
            Ok(message) => message,
            Err(error) if error == ai::CANCELLED => {
                state.clear(&chat_id);
                return Err(error);
            }
            // Tried before the tools ladder: a refused thinking level fails
            // every round, not just the first, and dropping the parameter the
            // route actually named beats dropping the repo access it did not.
            Err(error) if effort_sent.is_some() && route_refused(&error) => {
                effort_sent = None;
                // The webview remembers this against the model and stops
                // offering a thinking level for it, so the wasted first
                // attempt happens once per model rather than once per turn.
                let _ = app.emit(
                    "ai-chat-effort-unsupported",
                    ChatEffortUnsupported {
                        chat_id: chat_id.clone(),
                        model: model.clone(),
                    },
                );
                continue;
            }
            Err(error) if tools_enabled && rounds == 0 && retry_without_tools(&error) => {
                tools_enabled = false;
                tools_dropped = true;
                continue;
            }
            Err(error) => return Err(error),
        };
        let calls: Vec<Value> = message_value
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        // The terminal is where "why did that take nine minutes" gets
        // answered: one line per round with where the time went and how big
        // the resent conversation has grown.
        crate::http::log(&format!(
            "chat round {rounds}: {:.1}s stream, {} tool call(s) [{}], {} msgs / ~{}k chars in flight",
            round_started.elapsed().as_secs_f32(),
            calls.len(),
            calls
                .iter()
                .filter_map(|c| c.pointer("/function/name").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(", "),
            messages.len(),
            messages.iter().map(|m| m.to_string().len()).sum::<usize>() / 1000,
        ));
        if calls.is_empty() || !tools_enabled {
            if let Some(answer) = ai::message_answer(&message_value) {
                return Ok(note_if_toolless(
                    tools_dropped,
                    note_if_truncated(&message_value, answer),
                ));
            }
            // A round that ends with neither text nor a tool call is a model
            // that has finished reading and not started writing — a thinking
            // model spending a round on thought, or one that ran out of tool
            // budget mid-plan. Ask it for the answer once, with the tools
            // taken away, before calling the turn empty.
            if tools_enabled && !forced_text {
                forced_text = true;
                messages.push(serde_json::json!({
                    "role": "user",
                    "content": "Answer now, in text, from what you have already read."
                }));
                continue;
            }
            return Err(empty_answer(&message_value));
        }
        if rounds > CHAT_TOOL_ROUNDS {
            return Err("The model kept requesting tools past the limit.".to_string());
        }
        for call in &calls {
            let name = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}");
            let _ = app.emit(
                "ai-chat-tool",
                ChatToolNote {
                    chat_id: chat_id.clone(),
                    turn_id: turn_id.clone(),
                    tool: name.to_string(),
                    detail: tool_note(name, arguments),
                },
            );
        }
        // `finish_reason` rode the message out of the stream so empty_answer
        // could read it; it is OUR bookkeeping, not part of the OpenAI
        // message shape, and a gateway that validates assistant messages
        // would 400 on it — strip it before the message is replayed.
        let mut replayed = message_value.clone();
        if let Some(map) = replayed.as_object_mut() {
            map.remove("finish_reason");
        }
        messages.push(replayed);
        let tools_started = std::time::Instant::now();
        for call in calls {
            // A stop between tool calls stops here too: the reviewer pressed
            // it before the model asked for this, so nothing more is run and
            // no proposal from this round reaches the diff.
            if state.requested(&chat_id) {
                state.clear(&chat_id);
                return Err(ai::CANCELLED.to_string());
            }
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let name = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}")
                .to_string();
            let content = if name == "propose_comment" {
                if proposals {
                    run_propose_comment(&app, &commentable, &chat_id, &turn_id, &arguments)
                } else {
                    "error: propose_comment is not available".to_string()
                }
            } else if name == "read_diff" {
                execute_read_diff(&diffs, &arguments)
            } else if name == "search_skills" {
                let args: Value = serde_json::from_str(&arguments).unwrap_or(Value::Null);
                search_public_skills(args.get("query").and_then(Value::as_str).unwrap_or("")).await
            } else if name == "fetch_skill" {
                let args: Value = serde_json::from_str(&arguments).unwrap_or(Value::Null);
                fetch_public_skill(
                    args.get("source").and_then(Value::as_str).unwrap_or(""),
                    args.get("name").and_then(Value::as_str).unwrap_or(""),
                )
                .await
            } else if name == "list_skills" || name == "read_skill" || name == "write_skill" {
                let snapshot_for_skills = snapshot.clone();
                let personal_for_skills = personal_skills.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    execute_skill_tool(
                        snapshot_for_skills.as_ref(),
                        &personal_for_skills,
                        &name,
                        &arguments,
                    )
                })
                .await
                .map_err(|e| format!("tool execution failed: {e}"))?
            } else if let Some((root, key)) = snapshot.clone() {
                tauri::async_runtime::spawn_blocking(move || {
                    ai::execute_tool(&root, &key, &name, &arguments)
                })
                .await
                .map_err(|e| format!("tool execution failed: {e}"))?
            } else {
                "error: repository snapshot is not available".to_string()
            };
            messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": id,
                "content": content,
            }));
        }
        if round_streamed.load(std::sync::atomic::Ordering::Relaxed) {
            streamed_before.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        crate::http::log(&format!(
            "chat round {rounds}: tools ran in {:.2}s",
            tools_started.elapsed().as_secs_f32()
        ));
        rounds += 1;
    }
}

#[tauri::command]
pub async fn ai_chat_cancel(state: State<'_, ChatCancels>, chat_id: String) -> Result<(), String> {
    state.request(&chat_id);
    Ok(())
}

const TITLE_SYSTEM: &str = "Name this pull-request review conversation in three \
to six words, as a noun phrase a reviewer would recognise in a list. No \
quotes, no trailing period, no prefix like \"Chat about\". Reply with the \
title and nothing else.";

/// How much of the exchange the namer reads. A title comes from the subject,
/// which is established early; sending the whole thread would cost tokens to
/// re-read a report the reviewer has already had.
const TITLE_INPUT_CHARS: usize = 1500;

/// The name at the top of a thread, written by the model.
///
/// The first version of this derived a title from the reviewer's own first
/// line, on the reasoning that a label is not worth a model call. Dogfooding
/// disagreed: a send that is only a skill, or only attached code, has no first
/// line to take, and those are exactly the sends worth finding again later.
/// This runs once per thread, off the first exchange, with no tools and a
/// budget that cannot fund anything but a title. Failure is not an error —
/// the caller keeps the derived name.
#[tauri::command]
pub async fn ai_chat_title(
    app: AppHandle,
    question: String,
    answer: String,
    model: Option<String>,
) -> Result<String, String> {
    let config = ai::load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = model
        .filter(|m| !m.trim().is_empty())
        .or(config.model)
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    let exchange: String = format!("Reviewer:\n{question}\n\nAssistant:\n{answer}")
        .chars()
        .take(TITLE_INPUT_CHARS)
        .collect();
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": TITLE_SYSTEM },
            { "role": "user", "content": exchange },
        ],
        "max_completion_tokens": 24,
    });
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let value = ai::post_chat(&client, &url, &config.api_key, &body).await?;
    let title = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(|t| t.trim_matches('"').trim())
        .unwrap_or_default()
        .to_string();
    if title.is_empty() {
        return Err("the model returned no title".to_string());
    }
    Ok(clip_title(&title))
}

/// One line, short enough for the thread list. A model that ignores the word
/// budget should cost the reader a truncated title, not a wrapped sidebar.
fn clip_title(raw: &str) -> String {
    let line = raw.lines().next().unwrap_or(raw).trim();
    let mut out = String::new();
    for (count, ch) in line.chars().enumerate() {
        if count >= 48 {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
#[path = "ai_chat_tests.rs"]
mod tests;

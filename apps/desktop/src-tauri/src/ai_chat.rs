//! Multi-turn AI chat over a pull request — the second AI surface
//! (docs/AI.md § Second surface). One `ai_chat` call is one turn: the
//! webview sends the settled conversation back each time (tool traffic is
//! never replayed), Rust assembles the request and streams the answer back
//! over three events keyed `{chatId, turnId}` — `ai-chat-delta` for content,
//! `ai-chat-tool` for tool activity, and (later) `ai-chat-proposal` for
//! suggested comments. The ask machinery in `ai.rs` is reused whole: the
//! same tool loop over the repo snapshot, the same 4xx-round-0 degradation
//! to tools-off, the same round guard. `ai_chat_cancel` flags a chat id in
//! managed state; the stream checks the flag between chunks and rounds and
//! returns the benign `cancelled` error, which is a stop button, not a
//! failure. History is trimmed oldest-first past a character budget so a
//! long conversation never grows the request without bound — the system
//! prompt and the current turn are never trimmed.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

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
comments'); never for an ordinary question. Suggestions appear in the diff for \
the reviewer to accept or discard — they are never posted directly. side is \
LEFT for deleted lines and RIGHT for added or unchanged lines, and the line \
numbers must fall inside the diff.";

fn chat_system_prompt(snapshot_ready: bool, skills: bool, proposals: bool, diffs: bool) -> String {
    let mut parts = vec![CHAT_SYSTEM_BASE];
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
fn build_chat_turn(
    message: &str,
    regions: &[ChatRegion],
    context: &AskContext,
    first_turn: bool,
    skill: Option<&str>,
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
    if let Some(body) = skill {
        sections.push(format!(
            "Follow these instructions for this task:\n\n{body}"
        ));
    }
    for region in regions {
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
        sections.push(format!("{heading}\n```\n{}\n```", region.code));
    }
    sections.push(message.to_string());
    sections.join("\n\n")
}

const SKILLS_PREFIX: &str = ".claude/skills/";
const MAX_SKILL_BODY_CHARS: usize = 32_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
}

/// `.claude/skills/<name>/SKILL.md` → the skill's name; anything else — a
/// nested path, a stray file beside the manifest — is not a skill.
fn skill_name_from_path(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(SKILLS_PREFIX)?;
    let (name, file) = rest.split_once('/')?;
    (file == "SKILL.md" && !name.is_empty()).then_some(name)
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
    let bytes = snapshot_store::read_file(root, key, &format!("{SKILLS_PREFIX}{name}/SKILL.md"))?;
    Some(skill_text(&bytes))
}

/// Personal skills live beside the app config — `<config>/skills/<name>/SKILL.md`
/// — so a reviewer's own review passes work in every repo, not just ones that
/// carry `.claude/skills`.
fn personal_skills_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::storage::config_dir(app)
        .ok()
        .map(|d| d.join("skills"))
}

fn read_personal_skill(dir: &std::path::Path, name: &str) -> Option<String> {
    if !safe_skill_name(name) {
        return None;
    }
    let bytes = std::fs::read(dir.join(name).join("SKILL.md")).ok()?;
    Some(skill_text(&bytes))
}

fn discover_personal_skills(dir: &std::path::Path) -> Vec<SkillInfo> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<SkillInfo> = Vec::new();
    for entry in entries.flatten() {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        let Some(body) = read_personal_skill(dir, &name) else {
            continue;
        };
        out.push(SkillInfo {
            description: frontmatter_description(&body),
            name,
        });
    }
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
    personal: Option<&std::path::Path>,
    name: &str,
) -> Option<String> {
    snapshot
        .and_then(|(root, key)| read_skill_body(root, key, name))
        .or_else(|| personal.and_then(|dir| read_personal_skill(dir, name)))
}

fn discover_skills(root: &std::path::Path, key: &SnapshotKey) -> Vec<SkillInfo> {
    let Some(listing) = snapshot_search::list_files(root, key, Some(SKILLS_PREFIX)) else {
        return Vec::new();
    };
    let mut out: Vec<SkillInfo> = Vec::new();
    for path in &listing.files {
        let Some(name) = skill_name_from_path(path) else {
            continue;
        };
        let description = read_skill_body(root, key, name)
            .map(|body| frontmatter_description(&body))
            .unwrap_or_default();
        out.push(SkillInfo {
            description,
            name: name.to_string(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn execute_skill_tool(
    snapshot: Option<&(std::path::PathBuf, SnapshotKey)>,
    personal: Option<&std::path::Path>,
    name: &str,
    arguments: &str,
) -> String {
    match name {
        "list_skills" => {
            let repo = snapshot
                .map(|(root, key)| discover_skills(root, key))
                .unwrap_or_default();
            let personal_list = personal.map(discover_personal_skills).unwrap_or_default();
            let skills = merge_skills(repo, personal_list);
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
    ]
}

const STARTER_SKILL: &str = "---\nname: my-review-pass\ndescription: What this skill reviews for\n---\n\nWrite the instructions the model should follow when this skill is invoked.\nFor example: check error paths have tests, flag any TODO left in the diff,\nand suggest comments only where the code would actually break.\n";

/// The personal skills folder, created on demand with one starter file so
/// the reviewer opens something with an example in it rather than an empty
/// directory. Returns the path for the host to reveal.
#[tauri::command]
pub async fn open_skills_dir(app: AppHandle) -> Result<String, String> {
    let dir = personal_skills_dir(&app)
        .ok_or_else(|| "could not resolve the config directory".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| format!("could not create {dir:?}: {e}"))?;
        let starter = dir.join("my-review-pass");
        if !starter.exists() {
            std::fs::create_dir_all(&starter)
                .map_err(|e| format!("could not create {starter:?}: {e}"))?;
            std::fs::write(starter.join("SKILL.md"), STARTER_SKILL)
                .map_err(|e| format!("could not write the starter skill: {e}"))?;
        }
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("skills folder failed: {e}"))?
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
    let personal = personal_skills_dir(&app);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    tauri::async_runtime::spawn_blocking(move || {
        let repo_skills = snapshot
            .as_ref()
            .map(|(root, key)| discover_skills(root, key))
            .unwrap_or_default();
        let personal_skills = personal
            .as_deref()
            .map(discover_personal_skills)
            .unwrap_or_default();
        merge_skills(repo_skills, personal_skills)
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
    history: Vec<ChatTurn>,
    context: AskContext,
    commentable: Vec<CommentableSide>,
    diffs: Vec<ChatDiffFile>,
    skill: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let config = ai::load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = model
        .filter(|m| !m.trim().is_empty())
        .or(config.model)
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    state.clear(&chat_id);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    let personal_skills = personal_skills_dir(&app);
    let skill_body = match &skill {
        Some(name) => match resolve_skill_body(snapshot.as_ref(), personal_skills.as_deref(), name)
        {
            Some(body) => Some(skill_instructions(&body).to_string()),
            None => return Err(format!("Skill '{name}' was not found.")),
        },
        None => None,
    };
    let skills_available =
        snapshot.is_some() || personal_skills.as_deref().is_some_and(|d| d.is_dir());
    let proposals = !commentable.is_empty();
    let has_diffs = !diffs.is_empty();
    let system = chat_system_prompt(snapshot.is_some(), skills_available, proposals, has_diffs);
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    messages.extend(history_messages(&history, CHAT_INPUT_CHAR_BUDGET));
    messages.push(serde_json::json!({
        "role": "user",
        "content": build_chat_turn(
            &message,
            &regions,
            &context,
            history.is_empty(),
            skill_body.as_deref(),
        ),
    }));
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let mut tools_enabled = snapshot.is_some() || proposals || has_diffs;
    let mut rounds = 0;
    loop {
        if state.requested(&chat_id) {
            state.clear(&chat_id);
            return Err(ai::CANCELLED.to_string());
        }
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "max_completion_tokens": 2000,
            "stream": true,
        });
        if tools_enabled {
            body["tools"] = chat_tools(snapshot.is_some(), skills_available, proposals, has_diffs);
            if rounds >= ai::MAX_TOOL_ROUNDS {
                body["tool_choice"] = serde_json::json!("none");
            }
        }
        let emit_delta = |piece: &ai::StreamPiece| {
            if let Some(text) = &piece.content {
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
            Err(error)
                if tools_enabled && rounds == 0 && error.starts_with("AI provider error (4") =>
            {
                tools_enabled = false;
                continue;
            }
            Err(error) => return Err(error),
        };
        let calls: Vec<Value> = message_value
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if calls.is_empty() || !tools_enabled {
            return ai::message_answer(&message_value)
                .ok_or_else(|| "The provider returned an empty answer.".to_string());
        }
        if rounds > ai::MAX_TOOL_ROUNDS {
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
        messages.push(message_value);
        for call in calls {
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
            } else if name == "list_skills" || name == "read_skill" {
                let snapshot_for_skills = snapshot.clone();
                let personal_for_skills = personal_skills.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    execute_skill_tool(
                        snapshot_for_skills.as_ref(),
                        personal_for_skills.as_deref(),
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
        rounds += 1;
    }
}

#[tauri::command]
pub async fn ai_chat_cancel(state: State<'_, ChatCancels>, chat_id: String) -> Result<(), String> {
    state.request(&chat_id);
    Ok(())
}

#[cfg(test)]
#[path = "ai_chat_tests.rs"]
mod tests;

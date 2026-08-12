---
name: release
description: Cut a new Nod (Tauri desktop app) release — bump the version, draft user-facing release notes from everything that shipped since the last tag, tag and push to trigger the signed multi-platform build, then post the curated notes onto the GitHub release so the in-app "What's new" card and release history show real changelog copy instead of the generic placeholder. Use when the user asks to cut/ship/publish a release, bump the app version, or write release notes.
---

# release

Automates the full desktop release: version bump → drafted changelog → tag/push →
signed build → curated release notes on GitHub, which is what the in-app
"What's new" card (`apps/desktop/src/components/whats-new.tsx`) and release history
(`apps/desktop/src/components/release-history.tsx`) read from.

## The gap this closes

`.github/workflows/release.yml` always publishes the GitHub release with a
**static** body: `"See the assets below to install this version. The app
auto-updates from here on."` It has no changelog content. Every past release
(`gh release view v0.2.0/v0.1.3/v0.1.0 --json body`) has real bullet-point
notes anyway — those were added by hand afterwards with `gh release edit`.
This skill does that edit as part of the same flow instead of leaving it as a
manual follow-up.

`apps/desktop/src-tauri/src/update.rs::list_releases` fetches public releases and passes
`body` straight through as `notes`. `apps/desktop/e2e/whats-new.spec.ts` encodes the exact
contract this feeds: a release needs `tag` (`vX.Y.Z`), `publishedAt`, and
non-empty `notes` for the card and history view to show anything.

## Version source of truth

The shipped version comes from `apps/desktop/src-tauri/tauri.conf.json`'s `"version"`
field — Tauri uses it in the built binary, and `get_app_version` in
`apps/desktop/src-tauri/src/update.rs` surfaces it via `app.package_info().version`. This
is what the What's-new gate and release-history "current" dot compare
against.

`package.json`, `apps/desktop/package.json` and `apps/desktop/src-tauri/Cargo.toml`
also carry a `version` field. Releases before v0.6.0 only bumped
`tauri.conf.json`, so those three drifted; v0.6.0 converged all four and
`Cargo.lock`. They are in lockstep as of v0.6.0, so a run that finds them
disagreeing should treat that as a signal something went wrong, not as the
expected state.

## Procedure

### 0. Pre-flight

- `git status` — the tree must be clean before you commit a version bump. If
  it shows anything unexpected (unmerged paths, unrelated staged changes),
  **stop and surface it to the user** rather than committing around it or
  resolving it yourself — it's not part of this task.
- `git fetch --tags` and `git tag --sort=-creatordate | head -1` (or
  `gh release list --limit 1`) to find the last released version.
- Confirm you're releasing from the branch the user intends (usually `main`,
  fully pushed/up to date with origin).

### 1. Pick the next version

Ask the user for patch/minor/major if it's not obvious, or infer from what
shipped (see step 2): a release with only fixes → patch; any new
user-visible feature → minor. This repo is pre-1.0, so breaking changes still
bump minor, not major, unless the user says otherwise. Compute
`vX.Y.Z` from the last tag.

### 2. Draft the release notes

Gather what shipped since the last tag:

```sh
git log <lastTag>..HEAD --no-merges --oneline
gh pr list --state merged --search "merged:>=<lastReleaseDate>" --json number,title,body
```

Write 3-8 bullets: short noun phrases for features, `Fixed: ...` for bug
fixes, newest/most-user-visible first. Follow [Voice](#voice) to the letter,
and read it before writing the first bullet, not after. Only include things a
user would notice — skip refactors, test/CI/docs-only changes, internal
chores. End with the standard closing line:

```
See the assets below to install this version. The app auto-updates from here on.
```

**Show the drafted notes to the user before doing anything irreversible.**
This copy ships publicly and is what every user sees in-app on their next
update — it's worth a quick edit pass, not a rubber stamp.

### 3. Bump the version

Update all four files to the agreed `X.Y.Z` (no `v` prefix in these files,
tags get the `v`):

- `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
- `package.json` and `apps/desktop/package.json` → `"version"` (root mirrors the app version)
- `apps/desktop/src-tauri/Cargo.toml` → `[package] version`

Then refresh the lockfile's entry for the local package (offline — it's a
path package, nothing to fetch):

```sh
cd apps/desktop/src-tauri && cargo update -p nod --offline
```

### 4. Run the gate

Same bar as any other change to this repo:

```sh
pnpm check && pnpm typecheck && pnpm test && pnpm knip
cd apps/desktop/src-tauri && cargo check
```

A version bump shouldn't break any of these, but confirm before tagging —
once the tag is pushed, the build is public and the tag should never be
force-moved (see Judgment calls).

### 5. Commit

```sh
git add apps/desktop/src-tauri/tauri.conf.json package.json apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "release: vX.Y.Z"
```

Matches the existing commit convention (`git log --oneline | grep '^release:'`).

### 6. Confirm, then tag and push

**Pushing a tag is the irreversible, public step** — it kicks off signed
builds for 4 targets, creates a public GitHub release, and (if
`TAP_DEPLOY_KEY` is set) pushes a commit to the public `homebrew-tap` repo.
Confirm explicitly with the user before this step, showing exactly what will
run:

```sh
git push origin <branch>
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 7. Watch the build

The release workflow takes ~9-10 minutes historically. Watch it rather than
polling blind:

```sh
gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId'
gh run watch <id>
```

Report per-platform matrix failures if any job fails — do not proceed to
step 8 until the release exists (`gh release view vX.Y.Z` succeeds).

### 8. Post the curated notes

The workflow just created the release with the generic placeholder body.
Overwrite it with the drafted notes from step 2:

```sh
gh release edit vX.Y.Z --notes "$(cat <<'EOF'
<drafted bullets>

See the assets below to install this version. The app auto-updates from here on.
EOF
)"
```

### 9. Refresh the downloads page

The `/downloads` page reads the release list at build time, so the Cloudflare
deploy hook must be POSTed after step 8, or the page keeps serving stale
content (full rationale: docs/RELEASING.md →
[Downloads page](../../../docs/RELEASING.md#downloads-page)).

`release.yml` now has a `refresh-site` job that POSTs the hook itself, but it
runs on `needs: build`, which is **before** step 8 posts the notes. The site
therefore rebuilds against the placeholder body and `/downloads` renders an
empty notes list for the new version. Until that job is gated on the notes
existing, re-run it after step 8 (it holds the secret and does nothing else):

```sh
gh run rerun <runId> --job $(gh run view <runId> --json jobs \
  -q '.jobs[] | select(.name=="refresh-site") | .databaseId')
```

If you have the hook in your own environment, this works too:

```sh
if [ -n "$CF_PAGES_DEPLOY_HOOK" ]; then
  curl -fsS -X POST "$CF_PAGES_DEPLOY_HOOK" -o /dev/null \
    -w 'deploy hook: HTTP %{http_code}\n'
else
  echo "CF_PAGES_DEPLOY_HOOK not set — skipping; page self-corrects on the next push to main"
fi
```

The guard is the normal path until the hook is created, not an edge case —
without it an unset variable sends curl an empty URL and fails in a way that
reads like a broken hook. The hook URL is itself the credential: read it from
the environment (it lives in the password manager — see the link above),
never paste it into a commit or a release note.

### 10. Verify

```sh
gh release view vX.Y.Z --json body,assets,publishedAt
```

- `body` has the curated notes, not the placeholder.
- `assets` includes installers for macOS (both archs), Windows, Linux, plus
  `latest.json` (the updater manifest — its absence means the in-app
  auto-updater won't see this release).
- If `TAP_DEPLOY_KEY` is configured, spot-check the `update-tap` job in the
  same workflow run succeeded (it no-ops quietly if the secret is unset).

At this point the release is fully live: existing installs will see it via
`check_for_update`, and on next launch `WhatsNew` will show these exact notes
because `releasesSince` reads this release's `body`.

## Voice

Release notes are the most-read copy the project ships: the What's-new card
puts them in front of every user on their next update. They must not read as
generated. Do not calibrate by imitating whichever release you happen to
read; the rules below are the calibration, and every release from v0.1.0 to
v0.6.0 was rewritten on 2026-08-12 to obey them.

**Never use an em dash or an en dash.** Use a comma, a colon, a full stop, or
rewrite the sentence. This is the same rule the site copy follows.

**No bold lead-ins.** `- **Nod is for sale.** A license is $59...` is the
house style of AI-written changelogs, not of this project. Plain bullets.

**State the change; do not sell it.** The justification is what reads as
slop, because it is the part a model invents.

> Yes: `The free evaluation is now 30 days instead of 14.`
> No: `The free evaluation is now 30 days, up from 14. Review tools get used
> in bursts, and one sprint is not an evaluation.`

**Cut the flourishes.** No "so a changed icon reads as an icon", no "it isn't
X, it's Y", no "nothing is lost", no three-item lists that exist for rhythm
rather than because there are three things.

**Name the concrete thing**: the key (`shift+j`), the file type (`.deb` or
`.rpm`), the button label (`Restart & update`), the number (30 days). Vague
verbs like "improved", "enhanced", "streamlined" mean the bullet has no
content.

**One fact per bullet.** If a bullet needs a second sentence, spend it on
what the user can still do, not on why the change is good. Example from
v0.6.0: `SVG files in a diff now show a before/after preview above the
markup. The path data is still there to read, search and comment on.`

**Verify each bullet is user-visible before writing it.** v0.6.0 had 70
commits and 8 bullets. Most of the rest were the component gallery, the
website, tests and CI. Watch for package-level fixes that the desktop app
never showed: PR #304 fixed real `@nod/ui` button defects that Tailwind's
preflight already masked in the desktop, so it belonged in no release note.
Read the PR body when a commit subject is ambiguous.

## Judgment calls

- **Version drift on first run**: if `package.json`/`Cargo.toml` are behind
  `tauri.conf.json`, bump all three to the new version anyway (don't try to
  "catch up" to the old `tauri.conf.json` value first — just converge on the
  new target version).
- **Never force-push or retag** an already-pushed version tag, even to fix a
  typo in release notes — `gh release edit` can still fix the notes after the
  fact (step 8 covers this), and the build/updater manifest is already
  public. If the *code* itself is broken, cut a new patch version instead.
- **Dirty or unexpected git state**: stop and ask rather than committing
  around it (see step 0). Don't resolve unrelated unmerged paths as a side
  effect of this skill.
- **Notes quality over speed**: past release notes are hand-curated,
  user-facing prose, not commit-log dumps. A generated draft that reads like
  `git log` output is a worse outcome than pausing to ask the user which
  changes actually matter. A draft that reads like marketing copy is the
  other failure, and the more likely one: see [Voice](#voice).

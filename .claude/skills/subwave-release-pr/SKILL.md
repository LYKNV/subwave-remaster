---
name: subwave-release-pr
description: Open a release pull request from develop to main for SUB/WAVE. Summarises the commits queued on develop, groups them by conventional-commit type, and opens the PR via gh. Trigger this skill whenever the user says "create a release PR", "open a release PR to main", "release to main", "cut a release", "ship to main from develop", "open a develop→main PR", or any equivalent phrasing where the goal is to open the develop→main merge that release-please will then promote. The skill does NOT touch versions, changelogs, or tags — release-please workflows on main own all of that downstream.
---

# SUB/WAVE release PR

Open a pull request from `develop` → `main`. Everything after that — version bump, CHANGELOG, tag, GitHub release, image publishing — is handled by the release-please and `publish-images` workflows once the PR merges. This skill's job is just to surface a clean PR with a useful summary.

## Why this skill exists

A release PR for SUB/WAVE is mechanical but easy to get wrong by hand: forgetting to fetch first, listing merge commits in the body, picking up commits that are actually already on main via a back-merge. The skill encodes the right git plumbing and the body format that matches the project's recent PR history.

## Workflow

### Step 0 — Sanity checks

Run these from the repo root (`/home/klair/Projects/subwave`). They're cheap, surface state, and let you decide whether to proceed:

```bash
git rev-parse --show-toplevel              # confirm we're in subwave (or any git repo)
git status --short                         # any uncommitted work?
git rev-parse --abbrev-ref HEAD            # current branch (informational — we work via remote refs)
git fetch origin main develop              # MUST run before computing the diff, otherwise stale
```

What to do with the output:
- If `git status --short` shows uncommitted changes, surface them to the user and ask whether to proceed (the PR is built from `origin/develop`, so local edits won't be in it — but the user might want to commit them first).
- If `git fetch` fails (no network, no remote), stop and tell the user. Don't fall back to local refs — the PR base is `origin/main` and the head is `origin/develop`, so the comparison must be against fresh remotes.

### Step 1 — Check for an existing release PR

```bash
gh pr list --base main --head develop --json number,title,state,url
```

If a non-closed PR already exists, do **not** open a second one. Show the existing PR's URL to the user and ask whether they want to update it (re-push the develop branch is enough — GitHub auto-refreshes the PR), or close it and open a fresh one. Default to "leave it alone, here's the link" unless the user explicitly asks for a new PR.

### Step 2 — Gather the commits

```bash
git log --oneline --no-merges origin/main..origin/develop
git diff --stat origin/main..origin/develop
```

The `--no-merges` filter is important — merge commits like `Merge pull request #N from branch` are noise in the PR body. The stat tells you which files / how many lines change, useful for the user to sanity-check scope.

If `git log --no-merges origin/main..origin/develop` is empty: there is nothing to release. Tell the user, stop. Don't open an empty PR.

### Step 3 — Group commits by conventional-commit type

Parse the prefix of each commit subject:

| Prefix | Section header in PR body |
|---|---|
| `feat:` / `feat(scope):` | **Features** |
| `fix:` / `fix(scope):` | **Bug Fixes** |
| `perf:` | **Performance** |
| `refactor:` | **Refactors** |
| `docs:` | **Documentation** |
| `build:` | **Build** |
| `revert:` | **Reverts** |
| Anything else (`chore:`, `ci:`, `test:`, no prefix, …) | **Other** |

These mirror the sections release-please will render in CHANGELOG.md on the main side — keeping the PR body in sync makes review easier and the eventual changelog less surprising.

If a `feat!:` / `fix!:` / `BREAKING CHANGE:` commit is present, call it out in the PR body in a one-line **Breaking changes** note at the top so the reviewer doesn't miss it. (You don't compute a semver — release-please does — but flagging it manually saves the reviewer a scan.)

### Step 4 — Draft the title

Keep it under 70 characters. Use this shape:

```
release: <short theme of the batch>
```

Pick the theme from the dominant work in the diff. A few examples from this project's history:

- `release: mobile polish, landing fixes, player tactile transport`
- `release: admin library KPI tweaks + ollama provider swap`
- `release: controller hardening and onboarding wizard`

Don't put a version number in the title — release-please owns versioning and would have to either match or override yours. The title is just human signal.

### Step 5 — Draft the body

ALWAYS use this exact template:

```markdown
## Summary

<2–4 sentences describing what's queued on develop and why this is the moment to ship. Mention scope (web-only, controller-only, full stack, infra). Mention if there are migrations, env-var changes, or breaking changes.>

**Breaking changes** (only include this line if a `!`-marked or `BREAKING CHANGE:` commit exists)
- <sha short — one-line description of the break + the migration step>

**<Section header from Step 3>**
- `<sha short>` <commit subject with the prefix kept intact, optionally a one-line elaboration if a single commit is doing a lot>
- ...

(Repeat one section per type that has commits. Skip types with no commits — don't render empty headers.)

## Test plan
- [ ] <verifiable check — prefer behaviour over implementation>
- [ ] ...
```

Notes on the body:

- **Include short SHAs** so the reviewer can `git show <sha>` to dig into anything they're unsure about. Keep them in monospace.
- **Keep commit subjects literal** — don't paraphrase. The reviewer is going to cross-check against `git log`, and paraphrasing breaks that.
- **Write the test plan from the user's perspective** — what *behaviour* should they verify, not what the code does. "Mobile landing no longer scrolls horizontally" beats "overflow-x: clip applied to body". 3–6 items, max.
- If a single commit is doing a lot (a `feat:` that's actually a multi-component shipment), add one indented sentence below it explaining the shape. Don't replicate the whole commit body.

### Step 6 — Open the PR

Prepend this banner to the PR body before opening, so the reviewer can't miss the merge-strategy requirement:

```markdown
> [!IMPORTANT]
> **Merge with "Create a merge commit"** — not "Squash and merge". Squash collapses the individual `feat:` / `fix:` / `chore:` commits into one `release: …` commit, and release-please then sees no conventional-commit signal and skips the version bump. See [Step 7](#step-7--how-to-merge-this-pr) for the why.
```

Then create the PR:

```bash
gh pr create --base main --head develop --title "release: <theme>" --body "$(cat <<'EOF'
<banner above>

<body from Step 5>
EOF
)"
```

Capture the returned URL and report it to the user. Along with the URL, tell them in plain text: **"Merge this with a merge commit, not squash — release-please needs the individual conventional commits on main to bump the version."**

### Step 7 — How to merge this PR

Release-please runs on `main` push events and walks the commits added since the last release tag. To bump the version it needs to see at least one conventional commit (`feat:`, `fix:`, `perf:`, `refactor:`, …) on main.

- **"Create a merge commit"** — preserves every commit from develop on main with its original `feat:` / `fix:` / `chore:` prefix. Release-please sees them and opens its version-bump PR. **This is the correct option.**
- **"Squash and merge"** — collapses all develop commits into one squash commit whose subject is the PR title (`release: …`). `release:` is not a recognized conventional type, so release-please considers the commit non-user-facing and skips. **Do not use this.** This is exactly what happened with PR #118 — release-please ran, found 1 commit, classified it as non-user-facing, and skipped the version bump.
- **"Rebase and merge"** — also fine in principle (individual commits preserved on main) but breaks the historical pattern (previous successful release PRs like #112, #95, #93 were all merge commits). Stick with merge commit for consistency.

If the operator accidentally squash-merges anyway, the recovery is:

```bash
git checkout main && git pull
git commit --allow-empty -m "feat: <one-line description of the dominant work>

Re-trigger release-please after squash-merge of #<N> lost conventional-commit prefixes."
git push origin main
```

Then re-run the release-please workflow (Actions tab → release-please → Run workflow on main).

## Edge cases

- **Not on develop**: doesn't matter — this skill works against `origin/develop`, not the local checkout. The local branch could be anywhere. Don't switch branches.
- **Local develop is behind origin/develop**: also doesn't matter for the PR (we use origin/develop). Mention it to the user as an FYI in case they're surprised by what's in the PR.
- **Local develop is *ahead* of origin/develop**: the unpushed commits will NOT be in the PR. Ask whether to push first; if yes, push then re-run from Step 2 (the commit list will change).
- **gh not authenticated**: `gh pr create` will fail with a clear error. Surface it and tell the user to run `gh auth login` — don't try workarounds.
- **A draft release-please PR exists on main** (the version-bump PR release-please opens after a release lands): unrelated, ignore. That PR's base is main and its head is `release-please--branches--main`, not develop.
- **Previous release PR was squash-merged and release-please skipped the version bump**: follow the recovery block in Step 7 (push an empty `feat:` commit to main, re-run the release-please workflow).

## Allowed without confirmation

- `git fetch origin main develop`
- `git log` / `git diff` / `git status` reads
- `gh pr list`, `gh pr view`
- `gh pr create` — the user invoked the skill specifically to open a PR

## Confirm before running

- `gh pr close` (only if the user explicitly chose to replace an existing PR)
- `git push` of the local develop branch (only if the user opted into Step 6's edge case)
- Anything touching the local working tree (commits, stashes, branch switches) — this skill doesn't need any of that

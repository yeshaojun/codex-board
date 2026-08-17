# Loctek Specboard

Loctek Specboard is a local-first project board and project-story generator for
Loctek `.changes/` and OpenSpec. Source Markdown remains the system of record;
Specboard scans, links, renders and performs narrowly scoped local write-back;
it never creates a task database.

It gives all registered local projects three connected views:

- **Board** — issues, discussions, plans, decisions and OpenSpec changes;
- **Evidence** — work reports, tests, intents, merges and Git authorship;
- **Project story** — a shareable, progressively detailed Markdown narrative.
- **Collaboration** — Issue owner, state and comments stored back in the
  source Markdown as an append-only activity log.

## Quick start

```bash
node src/cli.mjs scan --project /absolute/path/to/project
node src/server.mjs --project /absolute/path/to/project
open http://127.0.0.1:47931
```

No database is required. The scanner reads Markdown and Git history directly,
so the board can always be rebuilt from each project.

## Use it as a cross-project control room

Open `http://127.0.0.1:47932/` and choose **＋ 登记项目** to add any local
project path. The local registry at [projects.json](projects.json) stores only
project labels and paths; tasks, plans and decisions always remain in each
project's Markdown/Git source. Projects not yet using `.changes` or OpenSpec
remain visible as zero-record projects; an inaccessible or slow project is
marked in the board after an 8-second scan limit without blocking the others.

## Use it from the Codex sidebar

Run this once whenever you want the embedded entry:

```bash
npm run codex
```

It opens a **separate Codex window** with its own app profile and a dedicated
loopback-only debugging port (`127.0.0.1:9232`). That window gains a
**Specboard** item beside the native sidebar actions; selecting it embeds the
same cross-project board. On startup it registers the local project names and
paths already saved in that Codex window (only metadata; no tasks or documents
are copied). Keep the command running while using this special window so the
entry can be restored after Codex reloads its renderer.

This is intentionally an unofficial compatibility layer, modelled on the
approach used by Dashi Taskboard rather than a Codex plugin capability. It does
not patch `ChatGPT.app`/`app.asar`, read conversation content, read credentials,
or expose the debugging port to the network. Codex UI updates can require the
sidebar selector to be maintained. Normal Codex windows are not touched.

## Keep the board available on this Mac

For the default Cowork project and port used by this installation, register the
local-only launchd service once:

```bash
npm run service:install
```

It keeps `http://127.0.0.1:47932/` available after Codex turns end and after
login. It binds only to `127.0.0.1`, never to the network. Remove it with:

```bash
npm run service:remove
```

## Install the Codex plugin

This repository carries a local marketplace at `.agents/plugins/marketplace.json`.
Register it once, then install the plugin:

```bash
codex plugin marketplace add /Users/andy/plugins/loctek-specboard
codex plugin add loctek-specboard@loctek-local
```

Start a new Codex task afterwards: its `loctek-specboard` skill will then be
available automatically whenever you ask to organize Loctek/OpenSpec work,
capture a discussion or plan, or generate a project story. The marketplace
plugin supplies the in-chat Skill; `npm run codex` supplies the separate
unofficial sidebar integration, because the plugin manifest alone cannot add a
native Codex navigation page.

## Capture a discussion

```bash
node src/cli.mjs capture \
  --project /absolute/path/to/project \
  --kind discussion \
  --title "统一 Server 与 Local 委派语义" \
  --summary "确认 Parent 只消费经验证的 receipt 摘要。" \
  --decision "不回流 child 原始 transcript。" \
  --links ISSUE-066,ADR-001
```

This writes a compact, reviewable Markdown record under `.changes/discussions/`.
Use `--kind plan` for a durable plan. The source file is intentionally small:
it records conclusions and alternatives, not a raw AI transcript.

## Generate the project story

```bash
node src/cli.mjs narrative \
  --project /absolute/path/to/project \
  --output docs/project-story.md
```

The generated document is evidence-led. It distinguishes completed evidence,
active work, and gaps requiring human confirmation instead of treating every
note or checkbox as a completed outcome.

## Source conventions

Specboard understands existing Loctek folders without migration:

- `.changes/issues/`, `work-reports/`, `test-reports/`, `intents/`,
  `merge-reports/`, `session-notes/`, `adr/`, `pr/`, `releases/`;
- optional `.changes/discussions/` and `.changes/plans/` created by `capture`;
- `openspec/changes/<change>/proposal.md`, `design.md`, `tasks.md`, and
  `openspec/specs/`.

See [docs/data-model.md](docs/data-model.md) for the card and evidence model.
For the Issue ownership, state and comment protocol, see
[docs/task-protocol.md](docs/task-protocol.md). For reusable architecture,
playbook, prompt and case-study assets, see
[docs/knowledge-assets.md](docs/knowledge-assets.md).

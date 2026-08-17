# Project AI Instructions

This project uses Loctek Spec for lightweight AI-assisted engineering governance.

## Default Behavior

- Read `.changes/config.yml` when it exists.
- Use active Loctek records in `.changes/issues/`, `.changes/work-reports/`, `.changes/intents/`, `.changes/test-reports/`, `.changes/merge-reports/`, `.changes/pr/`, and `.changes/session-notes/`.
- Do not read `.changes/archive/` during normal work unless the user asks to trace history.
- Prefer Loctek skills when available: `loctek-issue`, `loctek-work`, `loctek-test`, `loctek-commit`, `loctek-merge`, `loctek-archive`.

## Decision Notes

When the user makes an important decision, changes scope, rejects an approach, confirms a tradeoff, or explains why a fix matters, record it in `.changes/session-notes/` if no work report is being updated.

Use a small file per session:

```text
.changes/session-notes/YYYY-MM-DD-<branch-or-topic>.md
```

Include:

- user decision
- implementation reasoning
- rejected alternatives
- behavior that must be preserved during merge
- related issue/branch when known

Do not store secrets, credentials, private customer data, or long raw chat transcripts.

## Commit, Merge, Archive

- Commit with `loctek-commit` when available. It should include relevant session notes in the change intent.
- During merge, preserve behavior from both code and Loctek records before editing conflict blocks.
- After a successful merge or completed issue, dry-run archive first. If the matched records are clearly only for the completed work, archive them with `tools/loctek/archive.mjs`; otherwise write the manual command and reason.

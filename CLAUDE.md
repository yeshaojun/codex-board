# Claude Project Instructions

This project uses Loctek Spec. Keep the workflow lightweight, but preserve intent so AI-assisted merges do not drop behavior.

- Use active `.changes` records for current work: `issues`, `work-reports`, `intents`, `test-reports`, `merge-reports`, `pr`, and `session-notes`.
- Do not read `.changes/archive` by default.
- When a user decision or implementation tradeoff matters, write a short note in `.changes/session-notes/YYYY-MM-DD-<branch-or-topic>.md` unless the same point is already captured in a work report.
- Do not store secrets or raw transcripts in session notes.
- Use `loctek-commit` for commits, `loctek-merge` for merges, `loctek-test` for validation, and `loctek-archive` after completed work when available.
- If automatic archive is unsafe, explain why and give the exact `node tools/loctek/archive.mjs ... --dry-run` command for manual review.

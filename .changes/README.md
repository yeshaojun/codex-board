# .changes

This directory stores machine-readable context for AI-assisted development.

Use it to preserve intent:

- `issues/`: feature breakdown and acceptance criteria.
- `work-reports/`: implementation, debugging, and acceptance-criteria progress for one issue.
- `intents/`: per-commit or per-change intent records.
- `merge-reports/`: merge/rebase conflict reports.
- `test-reports/`: risk-based test plans and results.
- `pr/`: PR body drafts.
- `session-notes/`: lightweight AI session decisions, implementation reasoning, rejected approaches, and merge-preserve notes.
- `archive/`: completed Loctek records moved out of active context.
- `adr/`: architecture decisions.
- `releases/`: release notes and rollback plans.

Do not keep one shared mutable file for all changes. Prefer one small file per issue, change, merge, or test run.

Normal AI work should read active directories only. Do not read `archive/` unless tracing historical decisions.

## Session Notes

When an AI tool is not actively updating a work report, record important user decisions in:

```text
.changes/session-notes/YYYY-MM-DD-<branch-or-topic>.md
```

Keep notes short:

- user decision
- implementation reasoning
- rejected alternatives
- behavior that must be preserved during merge
- related issue or branch

Never store secrets, credentials, private customer data, or long raw transcripts.

## Archive

After an issue is complete or a branch is merged, dry-run archive first:

```bash
node tools/loctek/archive.mjs . --issue ISSUE-001 --dry-run
node tools/loctek/archive.mjs . --branch feature/example --dry-run
node tools/loctek/archive.mjs . --from-merge-report .changes/merge-reports/report.md --dry-run
```

If the dry-run result only includes completed work, run the same command without `--dry-run`.

If records are mixed or uncertain, do not auto archive. Leave a clear manual command in the merge or test report.

If Loctek records appear deleted after commit, check ownership first:

```bash
node tools/loctek/check-permissions.mjs
sudo chown -R "$(id -u):$(id -g)" .changes tools/loctek
```

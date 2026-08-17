# Loctek Init Report

Created at: 2026-08-16T02:01:32.287Z
Repository: .

## Created

- .changes
- .changes/issues
- .changes/issues/.gitkeep
- .changes/work-reports
- .changes/work-reports/.gitkeep
- .changes/intents
- .changes/intents/.gitkeep
- .changes/merge-reports
- .changes/merge-reports/.gitkeep
- .changes/test-reports
- .changes/test-reports/.gitkeep
- .changes/pr
- .changes/pr/.gitkeep
- .changes/session-notes
- .changes/session-notes/.gitkeep
- .changes/archive
- .changes/archive/.gitkeep
- .changes/adr
- .changes/adr/.gitkeep
- .changes/releases
- .changes/releases/.gitkeep
- .changes/config.yml
- .changes/README.md
- .changes/session-notes/_template.md
- .gitmessage
- .github
- .github/pull_request_template.md
- .github/workflows
- .github/workflows/loctek-intent-check.yml
- AGENTS.md
- CLAUDE.md
- .cursor/rules
- .cursor/rules/loctek.mdc
- CODEOWNERS
- tools/loctek
- tools/loctek/validate-intent.mjs
- tools/loctek/collect-context.mjs
- tools/loctek/check-permissions.mjs
- tools/loctek/archive.mjs
- tools/loctek/install-git-hooks.mjs
- tools/loctek/hooks
- tools/loctek/hooks/commit-msg

## Skipped Existing Files

- None

## Permission Check

- Permission check passed for .changes and tools/loctek.

## Next Steps

- Review .changes/config.yml.
- Run: node tools/loctek/check-permissions.mjs
- Run: node tools/loctek/install-git-hooks.mjs
- Ask AI tools to follow AGENTS.md, CLAUDE.md, or .cursor/rules/loctek.mdc and record important decisions in .changes/session-notes/.
- Configure branch protection so CI must pass before merging.
- Ask an agent to use $loctek-issue for the first feature breakdown.

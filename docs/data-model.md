# Specboard data model

## The source stays authoritative

Specboard does not turn project knowledge into an opaque second database.
Every card points to one or more Markdown files, and every displayed author or
last modifier is derived from Git when possible. Uncommitted source changes are
shown as local and unattributed.

## Card types

| Card | Source | Purpose |
| --- | --- | --- |
| `issue` | `.changes/issues/*.md` | Executable work with acceptance criteria |
| `discussion` | `.changes/discussions/*.md` | A durable, concise AI/human discussion outcome |
| `plan` | `.changes/plans/*.md` | A staged plan that can link to issues |
| `decision` | `.changes/adr/*.md` and `session-notes/*.md` | Constraints and chosen tradeoffs |
| `openspec-change` | `openspec/changes/*` | Proposed behavior change and task checklist |

The initial read-only scanner also emits evidence records for work reports,
tests, intents, merge reports, PRs, releases and session notes.

## Progress is evidence, not guesswork

- issue progress is checked acceptance criteria divided by all acceptance
  criteria; when none exist it is `unknown`;
- an OpenSpec change uses checked tasks divided by all tasks;
- plan progress uses checked plan steps when present;
- a status such as `in_progress` is shown independently from checklist progress.

## Creating a discussion or plan

`capture` writes a Markdown file with frontmatter and these sections:

```markdown
---
type: discussion
id: DISC-20260816-001
status: active
links:
  - ISSUE-066
---

# Title

## 背景
## 结论
## 方案与步骤
## 放弃方案
## 未决问题
## 关联记录
```

For a `plan`, `## 方案与步骤` uses Markdown checkboxes so that progress remains
mechanically verifiable.

## Project story document

The generator writes two layers in one document:

1. **分享摘要** — problem, scope, outcomes and active risks in plain language;
2. **技术复盘** — architecture decisions, problem/evidence/solution/validation
   chains, current work, and source index.

Source file paths are retained for audit. A later AI-assistance pass may improve
wording, but it must cite source cards and label any inference as an inference.

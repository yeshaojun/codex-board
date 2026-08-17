#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const outDir = join(process.cwd(), ".changes", "pr");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const branch = git(["branch", "--show-current"]) || "unknown";
const changed = git(["diff", "--name-status", "HEAD~1..HEAD"]);
const staged = git(["diff", "--cached", "--name-status"]);
const report = `# Loctek Context

Branch: ${branch}
Generated: ${new Date().toISOString()}

## Last Commit Changed Files

\`\`\`
${changed || "No last-commit diff available."}
\`\`\`

## Staged Files

\`\`\`
${staged || "No staged diff."}
\`\`\`
`;

writeFileSync(join(outDir, `${sanitize(branch)}-context.md`), report);
console.log(report);

function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}


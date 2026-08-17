#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative as pathRelative, resolve } from "node:path";

const { repo, options } = parseArgs(process.argv.slice(2));

if (!existsSync(join(repo, ".changes"))) fail(`No .changes directory found in ${repo}. Run loctek-init first.`);

const unresolved = gitLines(["diff", "--name-only", "--diff-filter=U"]);
if (unresolved.length && !options.force) {
  fail("Unresolved merge conflicts exist. Archive after conflicts are resolved.", unresolved);
}

const criteria = buildCriteria(options);
if (!criteria.issues.length && !criteria.branches.length && !criteria.report) printUsageAndExit();

const candidates = collectCandidates(criteria);
const safetyIssues = safetyCheck(candidates);
if (safetyIssues.length && !options.force) {
  fail("Archive is not safe to run automatically. Resolve these items or use --force after manual review.", safetyIssues);
}
const archiveRoot = join(repo, ".changes", "archive", monthStamp(), archiveSlug(criteria));
const moves = candidates.map((file) => ({
  from: file.path,
  fromRel: file.rel,
  to: uniquePath(join(archiveRoot, file.rel.replace(/^\.changes\//, ""))),
}));

if (!moves.length) {
  console.log("No matching active Loctek records found. Nothing to archive.");
  process.exit(0);
}

printPlan(archiveRoot, moves, options.dryRun);

if (options.dryRun) process.exit(0);

mkdirSync(archiveRoot, { recursive: true });
for (const move of moves) {
  mkdirSync(dirname(move.to), { recursive: true });
  renameSync(move.from, move.to);
}

writeFileSync(join(archiveRoot, "index.md"), buildIndex(criteria, moves));
console.log(`Archived ${moves.length} file(s) to ${relative(archiveRoot)}`);

function parseArgs(rawArgs) {
  let repoArg = process.cwd();
  let args = rawArgs;
  if (rawArgs[0] && !rawArgs[0].startsWith("--")) {
    repoArg = rawArgs[0];
    args = rawArgs.slice(1);
  }

  const out = {
    issues: [],
    branches: [],
    fromMergeReport: "",
    dryRun: false,
    force: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--issue") out.issues.push(args[++i] || "");
    else if (arg === "--branch" || arg === "--source-branch") out.branches.push(args[++i] || "");
    else if (arg === "--from-merge-report") out.fromMergeReport = args[++i] || "";
    else if (arg === "--dry-run" || arg === "--check") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg === "--yes" || arg === "-y") {}
    else if (arg.startsWith("--issue=")) out.issues.push(arg.slice("--issue=".length));
    else if (arg.startsWith("--branch=")) out.branches.push(arg.slice("--branch=".length));
    else if (arg.startsWith("--source-branch=")) out.branches.push(arg.slice("--source-branch=".length));
    else if (arg.startsWith("--from-merge-report=")) out.fromMergeReport = arg.slice("--from-merge-report=".length);
    else fail(`Unknown option: ${arg}`);
  }

  out.issues = unique(out.issues.map((value) => value.trim()).filter(Boolean));
  out.branches = unique(out.branches.map((value) => value.trim()).filter(Boolean));
  return { repo: resolve(repoArg), options: out };
}

function buildCriteria(opts) {
  const criteria = {
    issues: [...opts.issues],
    branches: [...opts.branches],
    report: opts.fromMergeReport ? resolve(repo, opts.fromMergeReport) : "",
  };

  if (criteria.report) {
    if (!existsSync(criteria.report)) fail(`Merge report not found: ${opts.fromMergeReport}`);
    const reportText = readFileSync(criteria.report, "utf8");
    const current = extract(reportText, /^current_branch:\s*(.+)$/m);
    const target = extract(reportText, /^target_branch:\s*(.+)$/m);
    if (current && current !== target && !isMainBranch(current)) criteria.branches.push(current);
    criteria.issues.push(...(reportText.match(/\bISSUE-\d+\b/gi) || []));
  }

  criteria.issues = unique(criteria.issues.map((issue) => issue.toUpperCase()));
  criteria.branches = unique(criteria.branches);
  return criteria;
}

function collectCandidates(criteria) {
  const dirs = ["issues", "work-reports", "intents", "test-reports", "merge-reports", "pr", "session-notes"];
  const files = [];
  for (const dir of dirs) {
    const root = join(repo, ".changes", dir);
    if (!existsSync(root)) continue;
    for (const path of walk(root)) {
      const rel = relative(path);
      if (basename(path) === ".gitkeep" || basename(path).startsWith("_")) continue;
      if (!statSync(path).isFile()) continue;
      const text = safeRead(path);
      if (matchesCriteria({ rel, text, dir }, criteria)) files.push({ path, rel, text });
    }
  }
  return uniqueBy(files, (file) => file.rel).sort((a, b) => a.rel.localeCompare(b.rel));
}

function safetyCheck(files) {
  const issues = [];
  for (const file of files) {
    if (!file.rel.startsWith(".changes/issues/")) continue;
    const status = extract(file.text, /^status:\s*(.+)$/m).toLowerCase();
    if (["draft", "in_progress", "open", "todo"].includes(status)) {
      issues.push(`${file.rel} status is ${status}.`);
    }
    if (/- \[ \]/.test(file.text)) {
      issues.push(`${file.rel} still has unchecked checklist items.`);
    }
  }
  return issues;
}

function matchesCriteria(file, criteria) {
  return (
    criteria.issues.some((issue) => matchesIssue(file, issue)) ||
    criteria.branches.some((branch) => matchesBranch(file, branch)) ||
    (criteria.report && resolve(repo, file.rel) === criteria.report)
  );
}

function matchesIssue(file, issue) {
  const lowerRel = file.rel.toLowerCase();
  const lowerText = file.text.toLowerCase();
  const issueLower = issue.toLowerCase();
  return lowerRel.includes(issueLower) || lowerRel.includes(sanitize(issue)) || lowerText.includes(issueLower);
}

function matchesBranch(file, branch) {
  const safeBranch = sanitize(branch);
  const rel = file.rel;
  const frontmatterBranches = [
    ...fieldValues(file.text, "branch"),
    ...fieldValues(file.text, "current_branch"),
    ...fieldValues(file.text, "source_branch"),
  ];

  if (frontmatterBranches.includes(branch)) return true;
  if (rel.includes(`.changes/intents/${safeBranch}/`)) return true;
  if (rel === `.changes/pr/${safeBranch}.md`) return true;
  if (rel.includes(safeBranch)) return true;
  return false;
}

function buildIndex(criteria, moves) {
  return `# Loctek Archive

Archived at: ${new Date().toISOString()}

## Criteria

- Issues: ${criteria.issues.length ? criteria.issues.join(", ") : "N/A"}
- Branches: ${criteria.branches.length ? criteria.branches.join(", ") : "N/A"}
- Merge report: ${criteria.report ? relative(criteria.report) : "N/A"}

## Files

${moves.map((move) => `- ${move.fromRel} -> ${relative(move.to)}`).join("\n")}

## Note

This archive is not part of the active Loctek context. Read it only when tracing historical decisions.
`;
}

function printPlan(archiveRoot, moves, dryRun) {
  console.log(`${dryRun ? "Archive dry-run" : "Archive plan"}:`);
  console.log(`Target: ${relative(archiveRoot)}`);
  console.log("Files:");
  for (const move of moves) console.log(`- ${move.fromRel} -> ${relative(move.to)}`);
}

function walk(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function gitLines(args) {
  try {
    return lines(execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim());
  } catch {
    return [];
  }
}

function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function fieldValues(text, field) {
  const regex = new RegExp(`^${field}:\\s*(.+)$`, "gim");
  const out = [];
  let match = regex.exec(text);
  while (match) {
    out.push(match[1].trim().replace(/^["']|["']$/g, ""));
    match = regex.exec(text);
  }
  return out;
}

function extract(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

function uniquePath(path) {
  if (!existsSync(path)) return path;
  const ext = path.match(/\.[^/.]+$/)?.[0] || "";
  const stem = ext ? path.slice(0, -ext.length) : path;
  let index = 2;
  let candidate = `${stem}-${index}${ext}`;
  while (existsSync(candidate)) {
    index += 1;
    candidate = `${stem}-${index}${ext}`;
  }
  return candidate;
}

function archiveSlug(criteria) {
  const parts = [];
  if (criteria.issues.length) parts.push(criteria.issues.map(sanitize).join("+"));
  if (criteria.branches.length) parts.push(criteria.branches.map(sanitize).join("+"));
  if (!parts.length && criteria.report) parts.push(sanitize(basename(criteria.report, ".md")));
  return parts.join("-").slice(0, 120) || "manual";
}

function monthStamp() {
  return new Date().toISOString().slice(0, 7);
}

function sanitize(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function isMainBranch(value) {
  return ["main", "master", "trunk", "develop", "dev"].includes(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function relative(path) {
  return pathRelative(resolve(repo), resolve(path)) || ".";
}

function printUsageAndExit() {
  console.error("Usage:");
  console.error("  node tools/loctek/archive.mjs . --issue ISSUE-001 [--dry-run]");
  console.error("  node tools/loctek/archive.mjs . --branch feature/x [--dry-run]");
  console.error("  node tools/loctek/archive.mjs . --from-merge-report .changes/merge-reports/report.md [--dry-run]");
  process.exit(1);
}

function fail(message, details = []) {
  console.error(message);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

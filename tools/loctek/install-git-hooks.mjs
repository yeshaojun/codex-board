#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const gitDir = join(process.cwd(), ".git");
if (!existsSync(gitDir)) {
  console.error("No .git directory found. Run this from a Git repository root.");
  process.exit(1);
}

const hooksDir = join(gitDir, "hooks");
mkdirSync(hooksDir, { recursive: true });

const source = join(process.cwd(), "tools", "loctek", "hooks", "commit-msg");
const target = join(hooksDir, "commit-msg");

if (!existsSync(source)) {
  console.error("Missing tools/loctek/hooks/commit-msg");
  process.exit(1);
}

if (existsSync(target)) {
  const existing = readFileSync(target, "utf8");
  if (!existing.includes("Loctek commit intent check")) {
    console.error(".git/hooks/commit-msg already exists. Merge tools/loctek/hooks/commit-msg manually.");
    process.exit(1);
  }
}

writeFileSync(target, readFileSync(source));
chmodSync(target, 0o755);
console.log("Installed .git/hooks/commit-msg");


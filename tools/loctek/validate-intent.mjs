#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const prBodyIndex = args.indexOf("--pr-body");
const prBody = prBodyIndex >= 0 ? args[prBodyIndex + 1] || "" : "";
const requiredPrSections = ["Why", "What Changed", "Behavior To Preserve", "Validation", "Risks"];
const failures = [];

if (prBody) {
  for (const section of requiredPrSections) {
    if (!new RegExp(`(^|\\n)##\\s+${section}\\b`, "i").test(prBody)) {
      failures.push(`PR body missing section: ${section}`);
    }
  }
}

const changesDir = join(process.cwd(), ".changes", "intents");
if (existsSync(changesDir)) {
  const files = walk(changesDir).filter((file) => file.endsWith(".md"));
  if (files.length === 0) failures.push("No .changes/intents/*.md records found.");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const section of ["为什么改", "改了什么", "涉及文件", "必须保留的行为", "验证方式", "风险点"]) {
      if (!new RegExp(`(^|\\n)##\\s+${section}\\b`).test(text)) {
        failures.push(`${file} missing section: ${section}`);
      }
    }
  }
}

if (failures.length) {
  console.error("Loctek intent check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Loctek intent check passed.");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}


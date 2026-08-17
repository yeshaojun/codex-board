#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { captureRecord, generateNarrative, scanProject } from "./lib.mjs";

const [command = "help", ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);
const project = args.project || process.cwd();

try {
  if (command === "scan") {
    const scan = await scanProject(project);
    if (args.output) {
      const output = path.resolve(project, args.output);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `${JSON.stringify(scan, null, 2)}\n`);
      process.stdout.write(`${path.relative(project, output)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(scan, null, 2)}\n`);
    }
  } else if (command === "narrative") {
    const narrative = generateNarrative(await scanProject(project));
    if (args.output) {
      const output = path.resolve(project, args.output);
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, narrative);
      process.stdout.write(`${path.relative(project, output)}\n`);
    } else {
      process.stdout.write(`${narrative}\n`);
    }
  } else if (command === "capture") {
    const record = await captureRecord(project, {
      kind: args.kind,
      title: args.title,
      summary: args.summary,
      decision: args.decision,
      alternatives: args.alternatives,
      openQuestions: args["open-questions"],
      links: splitValues(args.links),
      steps: asList(args.step),
    });
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else {
    process.stdout.write(help());
  }
} catch (error) {
  process.stderr.write(`Specboard: ${error.message}\n`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) {
      result[key] = true;
      continue;
    }
    index += 1;
    if (result[key] === undefined) result[key] = value;
    else result[key] = [...asList(result[key]), value];
  }
  return result;
}

function asList(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function splitValues(value) {
  return asList(value).flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

function help() {
  return `Loctek Specboard\n\n` +
    `  node src/cli.mjs scan --project /path/to/project [--output .specboard/index.json]\n` +
    `  node src/cli.mjs narrative --project /path/to/project [--output docs/project-story.md]\n` +
    `  node src/cli.mjs capture --project /path/to/project --kind discussion|plan --title TEXT --summary TEXT [--decision TEXT] [--links ISSUE-001,ADR-001] [--step TEXT]\n`;
}

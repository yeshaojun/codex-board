#!/usr/bin/env node
import { scanProject } from "./lib.mjs";

const projectPath = process.argv[2];

if (!projectPath) {
  process.stderr.write("缺少项目路径。\n");
  process.exitCode = 1;
} else {
  try {
    process.stdout.write(JSON.stringify(await scanProject(projectPath)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

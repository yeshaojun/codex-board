#!/usr/bin/env node
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const label = "com.andy.loctek-specboard";
const uid = String(process.getuid?.() ?? "");
const destination = resolve(process.env.HOME || "/Users/andy", "Library/LaunchAgents", `${label}.plist`);

try {
  await run("launchctl", ["bootout", `gui/${uid}/${label}`]);
} catch {}
try {
  await unlink(destination);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.stdout.write("Specboard service removed.\n");

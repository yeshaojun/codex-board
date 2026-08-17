#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.andy.loctek-specboard";
const destination = resolve(process.env.HOME || "/Users/andy", "Library/LaunchAgents", `${label}.plist`);
const uid = String(process.getuid?.() ?? "");

await mkdir(dirname(destination), { recursive: true });
try {
  await run("launchctl", ["bootout", `gui/${uid}/${label}`]);
} catch {}
await copyFile(resolve(root, "launchd", `${label}.plist`), destination);
await run("launchctl", ["bootstrap", `gui/${uid}`, destination]);
await run("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`]);
process.stdout.write(`Specboard service installed: http://127.0.0.1:47932/\nLaunchAgent: ${destination}\n`);

#!/usr/bin/env node
import { accessSync, chownSync, constants, existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const args = process.argv.slice(2);
const fix = args.includes("--fix");
const relPaths = [".changes", "tools/loctek"];

if (fix) fixOwnership(relPaths);

const issues = checkPermissions(relPaths);
if (issues.length) {
  console.error("Loctek permission check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  console.error(`Repair command: ${repairCommand(relPaths)}`);
  process.exit(1);
}

console.log("Loctek permission check passed.");

function checkPermissions(paths) {
  const issues = [];
  for (const rel of paths) {
    const path = join(repo, rel);
    if (!existsSync(path)) continue;
    const stat = statSync(path);
    if (!stat.isDirectory()) continue;
    const owner = ownerText(stat);
    if (isRootOwned(stat) && !isRoot()) issues.push(`${rel} is owned by root (${owner}).`);
    try {
      accessSync(path, constants.W_OK);
      const probe = join(path, `.loctek-permission-check-${process.pid}`);
      writeFileSync(probe, "ok\n");
      unlinkSync(probe);
    } catch {
      issues.push(`${rel} is not writable by current user (${owner}).`);
    }
  }
  return issues;
}

function fixOwnership(paths) {
  const target = targetUser();
  if (target.uid === undefined || target.gid === undefined) {
    console.error("Cannot determine target uid/gid for permission repair.");
    process.exit(1);
  }
  for (const rel of paths) {
    const path = join(repo, rel);
    if (existsSync(path)) chownRecursive(path, target.uid, target.gid);
  }
}

function chownRecursive(path, uid, gid) {
  chownSync(path, uid, gid);
  const stat = statSync(path);
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) chownRecursive(join(path, entry), uid, gid);
}

function targetUser() {
  const sudoUid = Number(process.env.SUDO_UID);
  const sudoGid = Number(process.env.SUDO_GID);
  if (Number.isInteger(sudoUid) && Number.isInteger(sudoGid)) return { uid: sudoUid, gid: sudoGid };
  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    return { uid: process.getuid(), gid: process.getgid() };
  }
  return {};
}

function isRoot() {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function isRootOwned(stat) {
  return typeof stat.uid === "number" && stat.uid === 0;
}

function ownerText(stat) {
  return typeof stat.uid === "number" ? `uid:${stat.uid} gid:${stat.gid}` : "owner unknown";
}

function repairCommand(paths) {
  const existing = paths.filter((rel) => existsSync(join(repo, rel)));
  const targets = existing.length ? existing.join(" ") : paths.join(" ");
  return `sudo chown -R "$(id -u):$(id -g)" ${targets}`;
}

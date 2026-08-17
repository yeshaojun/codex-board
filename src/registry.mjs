import { promises as fs } from "node:fs";
import path from "node:path";

export async function readProjectRegistry(registryPath) {
  try {
    const content = JSON.parse(await fs.readFile(registryPath, "utf8"));
    if (!Array.isArray(content.projects)) throw new Error("projects 必须是数组。");
    return { version: content.version || 1, projects: content.projects.map(normalizeProject).filter(Boolean) };
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, projects: [] };
    throw new Error(`无法读取项目注册表：${error.message}`);
  }
}

export async function writeProjectRegistry(registryPath, registry) {
  const projects = uniqueProjects(registry.projects || []);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, "utf8");
  return { version: 1, projects };
}

export function addRegistryProject(registry, project, { preserveExistingLabel = false } = {}) {
  const normalized = normalizeProject(project);
  if (!normalized) throw new Error("项目路径不能为空。");
  const existing = (registry.projects || []).find((item) => path.resolve(item.path) === normalized.path);
  const replacement = preserveExistingLabel && existing
    ? { ...normalized, id: existing.id, label: existing.label }
    : normalized;
  const projects = uniqueProjects([...(registry.projects || []).filter((item) => path.resolve(item.path) !== normalized.path), replacement]);
  return { version: 1, projects };
}

export function removeRegistryProject(registry, id) {
  const projects = (registry.projects || []).filter((project) => project.id !== id);
  if (projects.length === (registry.projects || []).length) throw new Error(`未找到项目：${id}`);
  return { version: 1, projects };
}

function normalizeProject(project) {
  if (!project?.path || typeof project.path !== "string") return null;
  const resolvedPath = path.resolve(project.path);
  const label = typeof project.label === "string" && project.label.trim() ? project.label.trim() : path.basename(resolvedPath);
  return { id: String(project.id || slugify(path.basename(resolvedPath))), label, path: resolvedPath };
}

function uniqueProjects(projects) {
  const paths = new Set();
  const ids = new Set();
  const result = [];
  for (const project of projects.map(normalizeProject).filter(Boolean)) {
    if (paths.has(project.path)) continue;
    let id = project.id;
    let sequence = 2;
    while (ids.has(id)) id = `${project.id}-${sequence++}`;
    paths.add(project.path);
    ids.add(id);
    result.push({ ...project, id });
  }
  return result;
}

function slugify(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

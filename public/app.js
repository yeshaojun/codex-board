(() => {
window.__loctekSpecboardUiVersion = "collaboration-protocol-v5";
const app = { portfolio: null, projectId: "all", tab: "dashboard", filters: { status: "all", risk: "all", query: "" }, collapsedGroups: new Set(), detailKey: null, detailSaving: false };
window.__loctekSpecboardDebugState = () => ({ projectId: app.projectId, tab: app.tab, portfolio: app.portfolio });
// The standalone page starts itself. The Codex sidecar deliberately opts into
// managed loading, so it can wait until all registered projects are scanned
// before it removes the embedded-page loading state.
const managedInitialLoad = window.__LOCTEK_SPECBOARD_MANAGED_LOAD__ === true;
// In the standalone page `document.baseURI` is the local server. The Codex
// sidecar also injects an explicit loopback <base>, keeping the opaque iframe
// away from the host app:// origin.
const api = (pathname) => new URL(String(pathname).replace(/^\//, ""), document.baseURI).href;
const $ = (selector) => document.querySelector(selector);
const TYPES = { issue: "任务", discussion: "讨论", plan: "计划", decision: "决策", "openspec-change": "OpenSpec", "work-report": "工作报告", "test-report": "测试报告", "merge-report": "合并报告", intent: "意图", "pull-request": "PR" };
const STATUSES = { draft: "待梳理", backlog: "待办", todo: "待办", active: "讨论中", proposed: "提案", in_progress: "进行中", in_review: "复核中", blocked: "阻塞", accepted: "已确认", completed: "已完成", done: "已完成", archived: "已归档", closed: "已关闭", recorded: "已记录" };
const RISKS = { critical: "严重", high: "高", medium: "中", low: "低" };
const doneStatuses = new Set(["done", "completed", "archived", "closed", "accepted"]);
const statusGroups = [
  { id: "backlog", label: "待立项", shortLabel: "待立项", statuses: ["draft", "backlog", "todo", "proposed"], tone: "lavender" },
  { id: "progress", label: "处理中", shortLabel: "处理中", statuses: ["active", "in_progress", "in_review"], tone: "mint" },
  { id: "blocked", label: "遇到阻碍", shortLabel: "阻塞", statuses: ["blocked"], tone: "coral" },
  { id: "complete", label: "已完成", shortLabel: "已完成", statuses: ["done", "completed", "accepted", "archived", "closed"], tone: "blue" },
];
const escape = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const typeLabel = (value) => TYPES[value] || value;
const statusLabel = (value) => STATUSES[value] || value;
const riskLabel = (value) => RISKS[value] || value;
const recent = (card) => card.authorship.updatedBy?.at || card.authorship.createdBy?.at || "";
const assignee = (card) => card.collaboration?.assignee || card.collaboration?.createdBy || card.authorship.createdBy?.name || "未分配";
const creator = (card) => card.collaboration?.createdBy || card.authorship.createdBy?.name || "未识别";
const score = (card) => card.status === "blocked" ? 0 : card.risk === "critical" ? 1 : card.risk === "high" ? 2 : card.status === "in_progress" ? 3 : card.status === "active" ? 4 : 9;
const sortIssues = (left, right) => score(left) - score(right) || recent(right).localeCompare(recent(left)) || left.title.localeCompare(right.title, "zh-CN");

function date(value, includeTime = false) {
  if (!value) return "未识别";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return escape(String(value).slice(0, includeTime ? 16 : 10));
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) }).format(parsed);
}

function person(value) {
  return value ? `${escape(value.name || "未知")} · ${date(value.at, true)}` : "Git 历史中未找到";
}

function progress(value) {
  return value?.ratio === null ? "未量化" : `${value.completed}/${value.total} · ${Math.round(value.ratio * 100)}%`;
}

function brief(value, limit = 150) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

function storyUrl() {
  const query = app.projectId === "all" ? "" : `?project=${encodeURIComponent(app.projectId)}`;
  return api(`/api/narrative${query}`);
}

function scans() {
  return app.projectId === "all" ? app.portfolio.scans : app.portfolio.scans.filter((scan) => scan.project.id === app.projectId);
}

function cards() {
  return scans().flatMap((scan) => scan.cards.map((card) => ({ ...card, project: scan.project })));
}

function evidence(card) {
  const scan = app.portfolio.scans.find((item) => item.project.id === card.project.id);
  return card.evidenceIds.map((id) => scan.evidence.find((item) => item.id === id)).filter(Boolean);
}

function selectedSummary() {
  const selected = scans().filter((scan) => !scan.error);
  return selected.reduce((summary, scan) => ({
    cards: summary.cards + scan.summary.cards,
    evidence: summary.evidence + scan.summary.evidence,
    activeIssues: summary.activeIssues + scan.summary.activeIssues,
    blockedIssues: summary.blockedIssues + scan.summary.blockedIssues,
    archiveGaps: summary.archiveGaps + scan.summary.archiveGaps,
  }), { cards: 0, evidence: 0, activeIssues: 0, blockedIssues: 0, archiveGaps: 0 });
}

async function load({ force = false } = {}) {
  const refresh = $("#refresh");
  const refreshLabel = refresh?.querySelector("span");
  if (refresh) {
    refresh.disabled = true;
    refresh.dataset.loading = "true";
    refresh.setAttribute("aria-busy", "true");
    if (refreshLabel) refreshLabel.textContent = "刷新中";
  }
  const bootstrap = window.__LOCTEK_SPECBOARD_BOOTSTRAP__;
  try {
    if (bootstrap && !force) {
    // The Codex sidecar preloads the portfolio because its about:blank iframe
    // has an opaque origin. Consume this one-time loopback snapshot before
    // falling back to the normal standalone-page request path.
    delete window.__LOCTEK_SPECBOARD_BOOTSTRAP__;
      delete window.__LOCTEK_SPECBOARD_BOOTSTRAP__;
      app.portfolio = bootstrap;
    } else {
      const response = await fetch(api("/api/scan"), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "扫描项目源文件失败。");
      app.portfolio = result;
    }
    if (app.portfolio.error) throw new Error(app.portfolio.error);
    const selectedProject = app.portfolio.projects.find((project) => project.id === app.projectId);
    if (app.projectId !== "all" && (!selectedProject || selectedProject.error)) app.projectId = "all";
    renderFilters();
    render();
  } finally {
    if (refresh) {
      refresh.disabled = false;
      delete refresh.dataset.loading;
      refresh.removeAttribute("aria-busy");
      if (refreshLabel) refreshLabel.textContent = "刷新";
    }
  }
}

function renderFilters() {
  const allCards = cards();
  const statuses = [...new Set(allCards.map((card) => card.status))].sort();
  const risks = [...new Set(allCards.map((card) => card.risk).filter(Boolean))].sort();
  $("#status-filter").innerHTML = `<option value="all">全部状态</option>${statuses.map((value) => `<option value="${escape(value)}">${escape(statusLabel(value))}</option>`).join("")}`;
  $("#risk-filter").innerHTML = `<option value="all">全部风险</option>${risks.map((value) => `<option value="${escape(value)}">${escape(riskLabel(value))}</option>`).join("")}`;
}

function filteredCards(types = null) {
  return cards().filter((card) => {
    const query = `${card.id} ${card.title} ${card.excerpt} ${card.links.join(" ")} ${card.project.label} ${creator(card)} ${assignee(card)}`.toLowerCase();
    return (!types || types.has(card.type))
      && (app.filters.status === "all" || card.status === app.filters.status)
      && (app.filters.risk === "all" || card.risk === app.filters.risk)
      && (!app.filters.query || query.includes(app.filters.query));
  });
}

function render() {
  const summary = selectedSummary();
  const selectedProjects = scans();
  const selectedProject = selectedProjects.find((scan) => !scan.error)?.project;
  $("#issue-count").textContent = summary.activeIssues;
  renderSwitcher();
  $("#controls").hidden = app.tab === "dashboard";
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === app.tab));
  $("#view").innerHTML = ({ dashboard, board, list, memory })[app.tab]();
  bindCardButtons();
}

window.__loctekSpecboardDebugRender = render;

function renderSwitcher() {
  const select = $("#project-select");
  const projects = app.portfolio.projects;
  select.innerHTML = `<option value="all">全部项目 · ${app.portfolio.summary.availableProjects} 个可用</option>${projects.map((project) => `<option value="${escape(project.id)}" ${project.error ? "disabled" : ""}>${escape(project.label)} · ${project.error ? "暂不可扫描" : `${project.summary.activeIssues} 个活跃任务`}</option>`).join("")}`;
  select.value = app.projectId;
  const selected = app.projectId === "all" ? null : projects.find((project) => project.id === app.projectId);
  $("#project-selection-meta").textContent = app.projectId === "all"
    ? `${app.portfolio.summary.availableProjects} 个项目 · ${app.portfolio.summary.cards} 条记录${app.portfolio.summary.unavailableProjects ? ` · ${app.portfolio.summary.unavailableProjects} 个项目暂不可扫描` : ""}`
    : `${selected?.summary.cards || 0} 条记录 · ${selected?.summary.activeIssues || 0} 个活跃任务`;
}

function dashboard() {
  return app.projectId === "all" ? portfolioDashboard() : projectDashboard();
}

function portfolioDashboard() {
  const failed = app.portfolio.scans.filter((scan) => scan.error);
  const summary = selectedSummary();
  const issues = filteredCards(new Set(["issue"]));
  return `${failed.length ? `<p class="project-warning"><b>有 ${failed.length} 个项目暂不可扫描</b><span>${failed.map((scan) => `${escape(scan.project.label)}：${escape(scan.error)}`).join("；")}</span></p>` : ""}
  ${dashboardHero({ title: "项目完成度", subtitle: "跨项目查看执行状态与项目记忆。所有数字来自本机的 .changes、OpenSpec 与 Git。", summary, issues, source: `最后扫描 ${date(app.portfolio.generatedAt, true)}` })}
  <section class="dashboard-section"><div class="section-title"><h2>项目分析</h2><p>先选择需要关注的项目，再进入任务细节。</p></div><section class="project-overview-list">${app.portfolio.scans.map(projectOverviewRow).join("")}</section></section>`;
}

function projectOverviewRow(scan) {
  const { project, summary } = scan;
  if (scan.error) return `<article class="project-overview-row is-unavailable"><div class="project-overview-title"><p class="eyebrow">项目不可用</p><h3>${escape(project.label)}</h3><p>${escape(scan.error)}</p></div><div class="project-row-status"><span class="archive danger">暂无法扫描</span></div></article>`;
  const issues = scan.cards.filter((card) => card.type === "issue");
  const active = issues.filter((card) => !doneStatuses.has(card.status));
  const risk = issues.filter((card) => ["critical", "high"].includes(card.risk)).length;
  const knowledge = scan.cards.length - issues.length;
  const next = [...active].sort(sortIssues)[0];
  return `<article class="project-overview-row" data-project-id="${escape(project.id)}" tabindex="0" role="button" aria-label="查看 ${escape(project.label)}">
    <div class="project-overview-title"><p class="eyebrow">${escape(project.name || "PROJECT")}</p><h3>${escape(project.label)}</h3><p>${escape(project.readme.summary || "尚未从 README 提取到项目简介。")}</p></div>
    <dl class="project-stat-grid"><div><dt>活跃</dt><dd>${summary.activeIssues}</dd></div><div><dt>阻塞</dt><dd class="${summary.blockedIssues ? "danger" : ""}">${summary.blockedIssues}</dd></div><div><dt>待补证</dt><dd class="${summary.archiveGaps ? "warning" : ""}">${summary.archiveGaps}</dd></div><div><dt>高风险</dt><dd class="${risk ? "danger" : ""}">${risk}</dd></div><div><dt>记忆</dt><dd>${knowledge}</dd></div></dl>
    <div class="project-row-status"><span class="status-summary">${statusSummary(issues)}</span><p>${next ? `下一步：${escape(next.id)} · ${escape(next.title)}` : "暂无活跃任务"}</p><span class="row-arrow">→</span></div>
  </article>`;
}

function statusSummary(issueCards) {
  const active = issueCards.filter((card) => !doneStatuses.has(card.status)).length;
  const complete = issueCards.filter((card) => doneStatuses.has(card.status)).length;
  return `${active} 活跃 / ${complete} 完成`;
}

function projectDashboard() {
  const current = scans()[0];
  // Raw cards in an individual scan do not carry a project property. Enrich
  // them exactly as `cards()` does so detail buttons retain their composite
  // project/card key after moving from the portfolio view into one project.
  const projectCards = current.cards.map((card) => ({ ...card, project: current.project }));
  const issueCards = projectCards.filter((card) => card.type === "issue");
  const active = issueCards.filter((card) => !doneStatuses.has(card.status));
  const urgent = [...active].sort(sortIssues).slice(0, 8);
  const blocked = active.filter((card) => card.status === "blocked" || card.detail?.blockers.length).slice(0, 6);
  const gaps = active.filter((card) => card.detail?.archiveChecks.some((check) => check.level === "evidence")).slice(0, 6);
  return `${dashboardHero({ title: "项目完成度", subtitle: `${escape(current.project.readme.title || current.project.label)} · ${escape(brief(current.project.readme.summary, 150) || "README 未提供可提取的项目简介。")}`, summary: selectedSummary(), issues: issueCards, source: `扫描于 ${date(current.generatedAt, true)} · ${escape(current.project.path)}` })}
  <section class="dashboard-section"><div class="section-title"><h2>项目分析</h2><p>从优先级、阻塞和归档证据判断下一步。</p></div>
  <section class="overview-grid">
    ${panel("建议先处理", "按阻塞、风险、验收缺口排序。", urgent, (card) => overviewItem(card, card.detail?.recommendations?.[0] || "打开任务查看下一步。"))}
    ${panel("需要关注", "未读风险、显式阻塞与高风险任务。", blocked, (card) => overviewItem(card, card.detail?.blockers?.[0]?.text || "状态为 blocked，未写明具体原因。", "blocked"), "没有发现显式阻塞。")}
    ${panel("待补证", "缺少关联 work/test/merge 记录。", gaps, (card) => overviewItem(card, card.detail?.archiveChecks.find((check) => check.level === "evidence")?.text || "需检查归档证据。", "evidence"), "未发现活跃任务的证据缺口。")}
  </section></section>`;
}

function dashboardHero({ title, subtitle, summary, issues, source }) {
  const total = issues.length;
  const completed = issues.filter((card) => doneStatuses.has(card.status)).length;
  const ratio = total ? Math.round(completed / total * 100) : 0;
  const groups = statusGroups.map((group) => ({ ...group, count: issues.filter((card) => group.statuses.includes(card.status)).length }));
  return `<section class="dashboard-hero">
    <div class="completion-copy"><p class="eyebrow">SPECBOARD / LOCAL-FIRST</p><h1>${title}</h1><div class="completion-value"><strong>${ratio}<em>%</em></strong><span>${completed} 个已完成 · ${Math.max(total - completed, 0)} 个尚未结束</span></div></div>
    <div class="scan-note"><span class="note-spark" aria-hidden="true">✦</span><p>${subtitle}</p><small>${source}</small></div>
  </section>
  <section class="status-stats">${groups.map((group) => `<article class="status-stat ${group.tone}"><span>${group.label}</span><strong>${group.count}</strong><small>${total ? Math.round(group.count / total * 100) : 0}%</small><i><b style="width:${total ? group.count / total * 100 : 0}%"></b></i></article>`).join("")}<article class="status-stat slate"><span>待补证</span><strong>${summary.archiveGaps}</strong><small>需补执行证据</small><i><b style="width:${issues.length ? Math.min(summary.archiveGaps / issues.length * 100, 100) : 0}%"></b></i></article></section>`;
}

function panel(title, description, cardsToShow, draw, empty = "暂无相关项目。") {
  return `<section class="judgement-panel"><header><h3>${title}</h3><p>${description}</p></header><div>${cardsToShow.length ? cardsToShow.map(draw).join("") : `<p class="empty">${empty}</p>`}</div></section>`;
}

function overviewItem(card, recommendation, kind = "") {
  const tag = kind === "blocked" ? "阻塞" : kind === "evidence" ? "待补证" : statusLabel(card.status);
  const className = kind || (card.risk === "critical" || card.risk === "high" ? "high" : "normal");
  return `<button class="judgement-item" data-card-key="${escape(cardKey(card))}"><span class="priority ${className}">${tag}</span><strong>${escape(card.project.label)} · ${escape(card.id)} · ${escape(card.title)}</strong><p>${escape(recommendation)}</p></button>`;
}

function board() {
  const issueCards = filteredCards(new Set(["issue"])).sort(sortIssues);
  return `<section class="view-heading"><div><p class="eyebrow">ISSUE BOARD</p><h1>议题看板</h1><p>按源文件中的真实状态分列；任务点击后可查看执行、阻塞和下一步。</p></div><p class="result-count">${issueCards.length} 条</p></section>
  <section class="kanban-board">${statusGroups.map((group) => boardColumn(group, issueCards.filter((card) => group.statuses.includes(card.status)))).join("")}</section>`;
}

function boardColumn(group, groupedCards) {
  return `<section class="kanban-column"><header class="kanban-heading ${group.tone}"><span>${group.label}</span><b>${groupedCards.length}</b></header><div class="kanban-stack">${groupedCards.length ? groupedCards.map(boardCard).join("") : `<p class="column-empty">暂无议题</p>`}</div></section>`;
}

function boardCard(card) {
  return `<button class="board-card" data-card-key="${escape(cardKey(card))}"><code>${escape(card.id)}</code><strong>${escape(card.title)}</strong><p>${escape(card.excerpt || "尚未提取到任务摘要。")}</p><footer><span class="mini-tag ${escape(card.risk || "none")}">${escape(card.risk ? riskLabel(card.risk) : "一般")}</span><span class="owner-chip">负责人 · ${escape(assignee(card))}</span><time>${date(card.authorship.createdBy?.at)}</time></footer></button>`;
}

function list() {
  const issueCards = filteredCards(new Set(["issue"])).sort(sortIssues);
  return `<section class="view-heading"><div><p class="eyebrow">ISSUE LIST</p><h1>列表视图</h1><p>按状态折叠浏览；展示创建时间、创建者、风险与执行进度。</p></div><p class="result-count">${issueCards.length} 条</p></section>
  <section class="issue-list">${statusGroups.map((group) => listGroup(group, issueCards.filter((card) => group.statuses.includes(card.status)))).join("")}</section>`;
}

function listGroup(group, groupedCards) {
  const isCollapsed = app.collapsedGroups.has(group.id);
  return `<section class="list-group ${isCollapsed ? "is-collapsed" : ""}"><button class="list-group-heading ${group.tone}" data-group-id="${group.id}" aria-expanded="${!isCollapsed}"><span class="group-caret">⌄</span><span>${group.label}</span><b>${groupedCards.length}</b></button><div class="list-group-content">${groupedCards.length ? groupedCards.map(issueListRow).join("") : `<p class="list-empty">暂无议题</p>`}</div></section>`;
}

function issueListRow(card) {
  const checks = card.detail?.archiveChecks || [];
  const blocking = checks.some((check) => check.level === "blocking");
  const archive = blocking ? "存在阻塞" : checks.length ? "待补证" : "可执行 dry-run";
  return `<article class="issue-list-row"><button class="issue-main" data-card-key="${escape(cardKey(card))}"><code>${escape(card.project.label)} / ${escape(card.id)}</code><strong>${escape(card.title)}</strong><small>${escape(card.excerpt)}</small></button><div class="issue-row-meta"><span class="progress-text">${progress(card.progress)}</span><span class="mini-tag ${escape(card.risk || "none")}">${escape(card.risk ? riskLabel(card.risk) : "一般")}</span><span class="archive ${blocking ? "danger" : checks.length ? "warning" : "good"}">${archive}</span><span class="owner-chip">负责人 · ${escape(assignee(card))}</span><span class="author-dot">创建 · ${escape(creator(card))}</span><time>${date(card.authorship.createdBy?.at)}</time></div></article>`;
}

function memory() {
  const planningCards = filteredCards(new Set(["discussion", "plan", "openspec-change"]));
  const architectureCards = filteredCards(new Set(["decision"])).filter((card) => /(^|\/)(adr|ADR)\//.test(card.sourcePath) || /\bADR[-_]/i.test(card.id));
  const decisionCards = filteredCards(new Set(["decision", "discussion"])).filter((card) => card.type === "discussion" || !/(^|\/)(adr|ADR)\//.test(card.sourcePath));
  return `<section class="view-heading"><div><p class="eyebrow">PROJECT MEMORY</p><h1>项目记忆</h1><p>方案、计划、架构基线与关键决策均直接链接到它们的源记录。</p></div></section><section class="memory-grid">${memoryPanel("方案与计划", "讨论、跨 issue 计划与 OpenSpec 变更。", planningCards, "尚未沉淀方案、计划或 OpenSpec change。")}${memoryPanel("架构", "仅显示 ADR 项目级约束。", architectureCards, "未找到 .changes/adr/ 下的架构决策记录。")}${memoryPanel("决策", "会话结论与可检索讨论。", decisionCards, "未找到会话决策或讨论记录。")}</section>`;
}

function memoryPanel(title, description, selected, empty) {
  return `<section class="memory-panel"><header><div><h2>${title}</h2><p>${description}</p></div><b>${selected.length}</b></header><div class="knowledge-list">${selected.sort((left, right) => recent(right).localeCompare(recent(left)) || left.title.localeCompare(right.title, "zh-CN")).map(knowledgeCard).join("") || `<p class="empty-view">${empty}</p>`}</div></section>`;
}

function knowledgeCard(card) {
  const author = card.authorship.updatedBy || card.authorship.createdBy;
  return `<button class="knowledge-card" data-card-key="${escape(cardKey(card))}"><div class="knowledge-meta"><code>${escape(card.project.label)} / ${escape(card.id)}</code><span>${typeLabel(card.type)} · ${statusLabel(card.status)}</span></div><h3>${escape(card.title)}</h3><p>${escape(card.excerpt)}</p><footer><span>${date(recent(card))}</span><span>${author ? escape(author.name || "未知") : "未识别"}</span><span>${escape(card.sourcePath)}</span></footer></button>`;
}

function cardKey(card) { return `${card.project.id}::${card.id}`; }
function findCard(key) { return cards().find((card) => cardKey(card) === key); }
function bindCardButtons() { document.querySelectorAll("[data-card-key]").forEach((button) => button.addEventListener("click", () => showDetail(button.dataset.cardKey))); }

function showDetail(key) {
  const card = findCard(key);
  if (!card) return;
  app.detailKey = key;
  $("#detail-content").innerHTML = card.type === "issue" ? issueDetail(card) : genericDetail(card, evidence(card));
  if (!$("#detail").open) $("#detail").showModal();
  bindDetailActions(card);
}

function issueDetail(card) {
  const detail = card.detail;
  return `<p class="eyebrow">${escape(card.project.label)} / ${escape(card.id)} · ${escape(statusLabel(card.status))}</p><h2>${escape(card.title)}</h2><p class="source">${escape(card.project.path)} / ${escape(card.sourcePath)}</p>
  <dl class="meta-grid"><dt>创建于</dt><dd>${person(card.authorship.createdBy)}</dd><dt>创建者</dt><dd>${escape(creator(card))}</dd><dt>负责人</dt><dd>${escape(assignee(card))}</dd><dt>最近更新</dt><dd>${person(card.authorship.updatedBy)}${card.authorship.hasLocalChanges ? " · 本地尚有未提交修改" : ""}</dd><dt>进度</dt><dd>${progress(card.progress)}</dd><dt>关联</dt><dd>${card.links.length ? card.links.map(escape).join("、") : "无"}</dd></dl>
  ${collaborationEditor(card)}
  ${actionSection("要做什么", detail.scope, "issue 未单列构建范围；请从原始任务补充。")}
  ${actionSection("验收进度", detail.acceptance, "没有可量化的验收 checklist。")}
  ${workSection(detail.workDone)}
  ${actionSection("当前阻塞", detail.blockers, card.status === "blocked" ? "状态为 blocked，但尚未记录具体原因。" : "没有发现显式阻塞。")}
  ${archiveSection(detail.archiveChecks)}
  ${skillHandoff(detail.lifecycle)}
  <section class="next-actions"><h3>推荐后续如何进行</h3><ol>${detail.recommendations.map((item) => `<li>${escape(item)}</li>`).join("")}</ol></section>
  ${activitySection(card.collaboration?.activities || [])}
  ${evidenceSection(detail.evidence)}
  <p class="detail-note">“归档前检查”只是基于记录的提示，不能替代 <code>archive.mjs --dry-run</code> 的实际结果。</p>`;
}

function collaborationEditor(card) {
  const options = Object.entries(STATUSES).filter(([value]) => ["draft", "backlog", "todo", "active", "proposed", "in_progress", "in_review", "blocked", "completed", "archived", "closed"].includes(value)).map(([value, label]) => `<option value="${value}" ${card.status === value ? "selected" : ""}>${escape(label)} · ${escape(value)}</option>`).join("");
  return `<section class="collaboration-editor"><header><div><p class="eyebrow">COLLABORATION</p><h3>协作管理</h3><p>修改直接写回项目中的 Issue Markdown，并追加协作动态。</p></div><span class="local-write">仅本机</span></header><form id="issue-update-form"><div class="editor-grid"><label>负责人<input name="assignee" value="${escape(assignee(card))}" maxlength="120" required></label><label>任务状态<select name="status">${options}</select></label></div><label class="comment-field">追加评论<textarea name="comment" rows="3" maxlength="4000" placeholder="记录决策、交接说明或需要谁处理的阻塞…"></textarea></label><div class="editor-actions"><button type="submit" class="save-issue" ${app.detailSaving ? "disabled" : ""}>${app.detailSaving ? "保存中…" : "保存协作更新"}</button><span id="issue-update-message" role="status">创建者保持不变；默认负责人是创建者。</span></div></form></section>`;
}

function skillHandoff(lifecycle) {
  if (!lifecycle) return "";
  return `<section class="skill-handoff"><p class="eyebrow">LOCTEK 下一步</p><h3>${escape(lifecycle.label)} <span>${escape(lifecycle.skill)}</span></h3><p>${escape(lifecycle.reason)}</p><div><code>${escape(lifecycle.prompt)}</code><button type="button" class="copy-skill-prompt" data-skill-prompt="${escape(lifecycle.prompt)}">复制给 Codex</button></div></section>`;
}

function activitySection(activities) {
  return `<section class="detail-section activity-section"><h3>协作动态</h3>${activities.length ? `<ol class="activity-list">${activities.map((item) => `<li><div><time>${date(item.at, true)}</time><strong>${escape(item.actor)}</strong><span>${escape(item.kind)}</span></div>${item.content ? `<p>${escape(item.content)}</p>` : ""}</li>`).join("")}</ol>` : `<p class="empty">还没有协作动态；首次修改负责人、状态或追加评论后会记录在这里。</p>`}</section>`;
}

function bindDetailActions(card) {
  const form = $("#issue-update-form");
  if (form) form.addEventListener("submit", (event) => saveIssue(event, card));
  $(".copy-skill-prompt")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(button.dataset.skillPrompt || "");
      button.textContent = "已复制";
      setTimeout(() => { button.textContent = "复制给 Codex"; }, 1500);
    } catch {
      button.textContent = "请手动复制";
    }
  });
}

async function saveIssue(event, card) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = $("#issue-update-message");
  app.detailSaving = true;
  if (message) message.textContent = "正在写入项目 Markdown…";
  try {
    const payload = { assignee: form.get("assignee"), status: form.get("status") };
    const comment = String(form.get("comment") || "").trim();
    if (comment) payload.comment = comment;
    const response = await fetch(api(`/api/projects/${encodeURIComponent(card.project.id)}/issues/${encodeURIComponent(card.id)}`), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存协作更新失败。")
    app.portfolio = result.portfolio;
    app.detailSaving = false;
    renderFilters();
    render();
    showDetail(cardKey(card));
  } catch (error) {
    app.detailSaving = false;
    if (message) message.textContent = error.message;
    const button = event.currentTarget.querySelector("button[type=submit]");
    if (button) { button.disabled = false; button.textContent = "保存协作更新"; }
  }
}

function genericDetail(card, evidenceItems) {
  return `<p class="eyebrow">${escape(card.project.label)} / ${escape(typeLabel(card.type))} · ${escape(statusLabel(card.status))}</p><h2>${escape(card.title)}</h2><p class="source">${escape(card.project.path)} / ${escape(card.sourcePath)}</p><dl class="meta-grid"><dt>创建于</dt><dd>${person(card.authorship.createdBy)}</dd><dt>最近更新</dt><dd>${person(card.authorship.updatedBy)}</dd><dt>关联</dt><dd>${card.links.length ? card.links.map(escape).join("、") : "无"}</dd><dt>进度</dt><dd>${progress(card.progress)}</dd></dl><h3>摘要</h3><p>${escape(card.excerpt)}</p>${evidenceSection(evidenceItems)}<h3>来源</h3><p class="source">${escape(card.sourcePath)}</p>`;
}

function actionSection(title, items, empty) {
  return `<section class="detail-section"><h3>${title}</h3>${items?.length ? `<ul class="action-list">${items.map((item) => `<li class="${escape(item.state || "open")}"><span>${escape(item.text || item.title)}</span>${item.source ? `<small>${escape(item.source)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="empty">${escape(empty)}</p>`}</section>`;
}

function workSection(items) {
  return `<section class="detail-section"><h3>目前做了哪些</h3>${items?.length ? `<ul class="evidence-list">${items.map((item) => `<li><strong>${escape(item.title)}</strong><span>${escape(typeLabel(item.type))} · ${escape(item.sourcePath)}</span><p>${escape(item.excerpt)}</p></li>`).join("")}</ul>` : `<p class="empty">尚未找到关联的 work report、merge report 或 PR；这表示未找到记录，不代表尚未实施。</p>`}</section>`;
}

function archiveSection(checks) {
  return `<section class="archive-section"><h3>影响归档的阻塞 / 待补证</h3>${checks?.length ? `<ul>${checks.map((check) => `<li class="${escape(check.level)}">${escape(check.text)}</li>`).join("")}</ul>` : "<p>从当前记录看，未发现归档前检查项；仍需运行实际 dry-run。</p>"}</section>`;
}

function evidenceSection(items) {
  return `<section class="detail-section"><h3>关联证据</h3>${items?.length ? `<ul class="evidence-list">${items.map((item) => `<li><strong>${escape(item.title)}</strong><span>${escape(typeLabel(item.type))} · ${escape(item.sourcePath)}</span></li>`).join("")}</ul>` : "<p class='empty'>尚未找到关联证据。</p>"}</section>`;
}

async function addProject(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $("#project-error").textContent = "";
  try {
    const response = await fetch(api("/api/projects"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: form.get("label"), path: form.get("path") }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "登记项目失败。");
    $("#project-dialog").close();
    event.currentTarget.reset();
    await load();
  } catch (error) {
    $("#project-error").textContent = error.message;
  }
}

function renderInlineMarkdown(markdown) {
  return escape(markdown)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function storyMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let quote = [];
  let code = [];
  let inCode = false;
  const flushParagraph = () => { if (paragraph.length) blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`); paragraph = []; };
  const flushList = () => { if (list.length) blocks.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`); list = []; };
  const flushQuote = () => { if (quote.length) blocks.push(`<blockquote>${renderInlineMarkdown(quote.join(" "))}</blockquote>`); quote = []; };
  const flushCode = () => { if (code.length) blocks.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`); code = []; };
  for (const line of lines) {
    if (/^```/.test(line.trim())) { if (inCode) flushCode(); else { flushParagraph(); flushList(); flushQuote(); } inCode = !inCode; continue; }
    if (inCode) { code.push(line); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const item = line.match(/^\s*[-*+]\s+(.+)$/);
    const quoted = line.match(/^>\s?(.*)$/);
    if (heading) { flushParagraph(); flushList(); flushQuote(); blocks.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`); continue; }
    if (item) { flushParagraph(); flushQuote(); list.push(item[1]); continue; }
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
    flushList(); flushQuote(); paragraph.push(line.trim());
  }
  flushParagraph(); flushList(); flushQuote(); if (inCode) flushCode();
  return blocks.join("") || "<p>尚未生成项目故事。</p>";
}

async function openStory() {
  const dialog = $("#story-dialog");
  const content = $("#story-content");
  const source = storyUrl();
  $("#story-source-link").href = source;
  $("#story-title").textContent = app.projectId === "all" ? "项目故事" : `${$("#project-select").selectedOptions[0]?.textContent?.split(" · ")[0] || "当前项目"} · 项目故事`;
  $("#story-meta").textContent = "正在从本机 .changes、OpenSpec 与 Git 记录生成预览…";
  content.innerHTML = `<p class="story-loading">正在生成项目故事…</p>`;
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch(source, { cache: "no-store" });
    const markdown = await response.text();
    if (!response.ok) throw new Error(markdown || "项目故事生成失败。");
    content.innerHTML = storyMarkdown(markdown);
    $("#story-meta").textContent = "源记录生成的预览；“待补证”表示缺少关联证据，并不代表失败。";
  } catch (error) {
    content.innerHTML = `<p class="story-error">${escape(error.message)}</p>`;
    $("#story-meta").textContent = "项目故事暂时无法生成。";
  }
}

async function refreshBoard() {
  try {
    await load({ force: true });
  } catch (error) {
    $("#view").innerHTML = `<p class="error">${escape(error.message)}</p>`;
  }
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => { app.tab = button.dataset.tab; render(); }));
$("#narrative-link").addEventListener("click", openStory);
$("#project-select").addEventListener("change", (event) => {
  app.projectId = event.target.value;
  renderFilters();
  render();
});
$("#status-filter").addEventListener("change", (event) => { app.filters.status = event.target.value; render(); });
$("#risk-filter").addEventListener("change", (event) => { app.filters.risk = event.target.value; render(); });
$("#search").addEventListener("input", (event) => { app.filters.query = event.target.value.trim().toLowerCase(); render(); });
$("#refresh").addEventListener("click", refreshBoard);
$("#add-project").addEventListener("click", () => $("#project-dialog").showModal());
$("#project-form").addEventListener("submit", addProject);
$("#close-detail").addEventListener("click", () => $("#detail").close());
$("#close-story").addEventListener("click", () => $("#story-dialog").close());
$("#close-project-dialog").addEventListener("click", () => $("#project-dialog").close());
$("#view").addEventListener("click", (event) => {
  const projectRow = event.target.closest("[data-project-id]");
  if (!projectRow) return;
  app.projectId = projectRow.dataset.projectId;
  renderFilters();
  render();
});
$("#view").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const projectRow = event.target.closest("[data-project-id]");
  if (!projectRow) return;
  event.preventDefault();
  app.projectId = projectRow.dataset.projectId;
  renderFilters();
  render();
});
$("#view").addEventListener("click", (event) => {
  const groupToggle = event.target.closest("[data-group-id]");
  if (!groupToggle) return;
  const { groupId } = groupToggle.dataset;
  if (app.collapsedGroups.has(groupId)) app.collapsedGroups.delete(groupId);
  else app.collapsedGroups.add(groupId);
  render();
});
window.__loctekSpecboardLoad = load;
if (!managedInitialLoad) {
  load().catch((error) => { $("#view").innerHTML = `<p class="error">${escape(error.message)}</p>`; });
}
})();

(() => {
  "use strict";

  const VERSION = "0.2.0";
  const SOURCE_HASH = window.__LOCTEK_SPECBOARD_SOURCE_HASH__;
  const SENTINEL = "__loctekSpecboardInjection__";
  const ENTRY_ID = "loctek-specboard-entry";
  const PAGE_ID = "loctek-specboard-page";
  const FRAME_ID = "loctek-specboard-frame";
  const STYLE_ID = "loctek-specboard-inject-style";
  const OWNED = "data-loctek-specboard-owned";
  const HIDDEN = "data-loctek-specboard-native-hidden";
  const HOST = "data-loctek-specboard-page-host";
  const REATTACH_DELAY = 160;
  const PLUGIN_LABELS = ["插件", "plugins"];

  const previous = window[SENTINEL];
  if (previous?.sourceHash === SOURCE_HASH && typeof previous.refresh === "function") {
    previous.refresh();
    return;
  }
  try {
    previous?.destroy?.();
  } catch (_) {}

  let entry = null;
  let entryLabel = null;
  let page = null;
  let frame = null;
  let observer = null;
  let refreshTimer = null;
  let active = false;
  let destroyed = false;
  let lastFocusedElement = null;

  function normalized(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function boardUrl() {
    const configured = typeof window.__LOCTEK_SPECBOARD_URL__ === "string"
      ? window.__LOCTEK_SPECBOARD_URL__.trim()
      : "";
    try {
      const url = new URL(configured || "http://127.0.0.1:47932/?host=codex");
      const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
      if (!local || !["http:", "https:"].includes(url.protocol)) throw new Error("unsafe board URL");
      url.searchParams.set("host", "codex");
      return url.href;
    } catch (_) {
      return "http://127.0.0.1:47932/?host=codex";
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute(OWNED, "true");
    style.textContent = `
      #${ENTRY_ID}[aria-current="page"] {
        background: var(--color-token-list-hover-background, color-mix(in srgb, currentColor 8%, transparent));
        color: var(--color-token-foreground, inherit);
      }
      #${ENTRY_ID}:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
      [${HOST}="true"] { position: relative !important; z-index: 31 !important; pointer-events: none !important; }
      [${HIDDEN}="true"] { visibility: hidden !important; pointer-events: none !important; }
      #${PAGE_ID} {
        position: absolute; inset: 0; z-index: 2; overflow: hidden;
        min-width: 0; min-height: 0; background: Canvas; color: CanvasText; pointer-events: auto;
      }
      #${PAGE_ID}[hidden] { display: none !important; }
      #${FRAME_ID} { display: block; width: 100%; height: 100%; border: 0; background: Canvas; }
      #${FRAME_ID}[hidden] { display: none !important; }
      #${PAGE_ID} .loctek-specboard-loading {
        position: absolute; inset: 0; display: grid; place-items: center; padding: 24px;
        color: var(--color-token-text-secondary, color-mix(in srgb, CanvasText 60%, transparent));
        font: 13px/1.5 system-ui, sans-serif; text-align: center;
      }
      #${PAGE_ID} .loctek-specboard-loading[hidden] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function matchesLabel(element, labels) {
    if (!element) return false;
    const text = normalized(element.textContent || element.getAttribute("aria-label"));
    return labels.includes(text);
  }

  function findReferenceButton() {
    const sidebar = document.querySelector("[data-app-action-sidebar-scroll]");
    if (!sidebar) return null;
    const buttons = Array.from(sidebar.querySelectorAll("button"));
    const plugins = buttons.find((button) => matchesLabel(button, PLUGIN_LABELS));
    if (plugins?.parentElement) return plugins;

    const firstSection = sidebar.querySelector("[data-app-action-sidebar-section]");
    const sectionTop = firstSection?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const groups = Array.from(sidebar.querySelectorAll("div")).filter((element) => {
      const directButtons = Array.from(element.children).filter((child) => child.tagName === "BUTTON");
      return directButtons.length >= 3 && element.getBoundingClientRect().top < sectionTop;
    });
    const group = groups.sort((left, right) => right.children.length - left.children.length)[0];
    return Array.from(group?.children || []).filter((child) => child.tagName === "BUTTON").at(-1) || null;
  }

  function replaceIcon(button) {
    const icon = button.querySelector("svg");
    if (!icon) return;
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.innerHTML = "<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"16\" rx=\"2.5\"></rect><path d=\"M9 4v16M14.5 8h2.5M14.5 12h2.5M14.5 16h2.5\"></path>";
  }

  function createEntry(reference) {
    const button = reference.cloneNode(true);
    button.id = ENTRY_ID;
    button.type = "button";
    button.removeAttribute("disabled");
    ["aria-expanded", "aria-controls", "aria-describedby", "data-state", "aria-current"].forEach((name) => button.removeAttribute(name));
    Array.from(button.attributes).filter((attribute) => attribute.name.startsWith("data-app-action")).forEach((attribute) => button.removeAttribute(attribute.name));
    button.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    button.setAttribute(OWNED, "true");
    entryLabel = button.querySelector(".text-fade-truncate")
      || Array.from(button.querySelectorAll("span")).find((node) => matchesLabel(node, PLUGIN_LABELS));
    syncEntryText(button);
    replaceIcon(button);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBoard();
    });
    return button;
  }

  function syncEntryText(button = entry) {
    if (!button) return;
    button.setAttribute("aria-label", "打开 Specboard");
    button.setAttribute("title", "Specboard");
    if (entryLabel) entryLabel.textContent = "Specboard";
  }

  function syncEntryState() {
    if (!entry) return;
    if (active) entry.setAttribute("aria-current", "page");
    else entry.removeAttribute("aria-current");
  }

  function ensureEntry() {
    if (destroyed || !document.body) return;
    installStyles();
    const reference = findReferenceButton();
    if (!reference?.parentElement) return;
    if (!entry) entry = createEntry(reference);
    if (entry.parentElement !== reference.parentElement || entry.previousElementSibling !== reference) reference.after(entry);
    syncEntryText();
    syncEntryState();
  }

  function findPageMount() {
    const layout = document.querySelector("[data-app-shell-main-content-layout]");
    const direct = document.querySelector(".app-shell-main-content-frame")
      || layout?.firstElementChild;
    const surface = layout?.parentElement;
    if (!direct || !layout || !surface || !surface.closest("main")) return null;
    return { surface };
  }

  function createPage() {
    const section = document.createElement("section");
    section.id = PAGE_ID;
    section.hidden = true;
    section.setAttribute(OWNED, "true");
    section.setAttribute("aria-label", "Loctek Specboard");

    const loading = document.createElement("div");
    loading.className = "loctek-specboard-loading";
    loading.textContent = "正在加载跨项目 Specboard…";

    const nextFrame = document.createElement("iframe");
    nextFrame.id = FRAME_ID;
    nextFrame.title = "Loctek Specboard";
    nextFrame.referrerPolicy = "no-referrer";
    nextFrame.setAttribute("allow", "clipboard-read; clipboard-write");
    // Codex's app:// CSP rejects a direct localhost iframe navigation. The
    // sidecar fills this named blank document through CDP after it is mounted.
    nextFrame.name = `loctek-specboard-${crypto.randomUUID()}`;
    nextFrame.src = "about:blank";
    nextFrame.addEventListener("load", () => {
      if (nextFrame.dataset.loctekSpecboardLoaded === "true") loading.hidden = true;
    });
    nextFrame.addEventListener("error", () => {
      loading.textContent = "Specboard 页面未能加载。请确认本机服务正在运行。";
    });
    frame = nextFrame;
    section.append(loading, nextFrame);
    return section;
  }

  function restoreNativeContent() {
    document.querySelectorAll(`[${HIDDEN}="true"]`).forEach((node) => node.removeAttribute(HIDDEN));
    document.querySelectorAll(`[${HOST}="true"]`).forEach((node) => node.removeAttribute(HOST));
  }

  function mountActivePage() {
    if (!active) return;
    const mount = findPageMount();
    if (!mount) return;
    if (!page) page = createPage();
    const { surface } = mount;
    if (page.parentElement !== surface) {
      restoreNativeContent();
      surface.appendChild(page);
    }
    surface.setAttribute(HOST, "true");
    Array.from(surface.children).forEach((child) => {
      if (child !== page && child.getAttribute(OWNED) !== "true") child.setAttribute(HIDDEN, "true");
    });
    page.hidden = false;
  }

  function closeBoard(restoreFocus = true) {
    if (!active && page?.hidden !== false) return;
    active = false;
    if (page) page.hidden = true;
    restoreNativeContent();
    syncEntryState();
    if (restoreFocus) lastFocusedElement?.focus?.();
    lastFocusedElement = null;
  }

  function openBoard() {
    if (destroyed) return;
    if (!active) lastFocusedElement = document.activeElement;
    active = true;
    ensureEntry();
    mountActivePage();
    syncEntryState();
  }

  function markFrameLoaded() {
    const loading = page?.querySelector(".loctek-specboard-loading");
    if (frame) frame.dataset.loctekSpecboardLoaded = "true";
    if (loading) loading.hidden = true;
  }

  function reloadFrame() {
    if (!frame) return false;
    frame.removeAttribute("data-loctek-specboard-loaded");
    const loading = page?.querySelector(".loctek-specboard-loading");
    if (loading) {
      loading.hidden = false;
      loading.textContent = "正在刷新跨项目 Specboard…";
    }
    return true;
  }

  function isNativeNavigation(target) {
    const clickable = target?.closest?.("button,a,[role='button'],[data-app-action-sidebar-thread-id]");
    if (!clickable || clickable === entry || clickable.closest(`#${ENTRY_ID}`)) return false;
    return Boolean(clickable.closest("[data-app-action-sidebar-scroll]"));
  }

  function onDocumentClick(event) {
    if (active && isNativeNavigation(event.target)) closeBoard(false);
  }

  function scheduleRefresh() {
    if (destroyed || refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      ensureEntry();
      mountActivePage();
    }, REATTACH_DELAY);
  }

  function refresh() {
    ensureEntry();
    mountActivePage();
  }

  function mount() {
    document.removeEventListener("DOMContentLoaded", mount);
    if (destroyed || observer || !document.documentElement) return;
    ensureEntry();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current", "aria-label", "data-theme", "data-color-theme"],
    });
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", () => closeBoard(false));
    window.addEventListener("hashchange", () => closeBoard(false));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = null;
    observer?.disconnect();
    observer = null;
    document.removeEventListener("DOMContentLoaded", mount);
    document.removeEventListener("click", onDocumentClick, true);
    closeBoard(false);
    document.querySelectorAll(`[${OWNED}="true"]`).forEach((node) => node.remove());
    entry = null;
    page = null;
    frame = null;
    if (window[SENTINEL] === api) delete window[SENTINEL];
  }

  const api = { version: VERSION, sourceHash: SOURCE_HASH, refresh, open: openBoard, close: closeBoard, markFrameLoaded, reloadFrame, destroy };
  window[SENTINEL] = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();

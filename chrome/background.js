/**
 * Split Link Router - background service worker
 *
 * 策略（对齐 Obsidian 插件的思路）：
 *   - 普通点击：在"副屏 tab"里 update URL（复用）
 *   - Shift 点击：在副屏那一侧开新 tab（作为分屏侧的新 tab）
 *   - Cmd/Ctrl 点击：后台新开 tab（Chrome 默认行为）
 *
 * 如果当前 tab 不在分屏里：
 *   - 由 options 决定回退行为：新 tab / 提示用户手动分屏
 */

const DEFAULT_SETTINGS = {
  // 普通点击 / Shift / Cmd-Ctrl 各自的打开方式
  // openMode:
  //   'reuse'      - 在副屏 tab 里切换 URL（需当前已处于分屏；不在分屏走回退）
  //   'background' - 后台新 tab（Chrome 原生 Cmd+Click 行为）
  //   'foreground' - 前台新 tab
  //   'current'    - 在当前 tab 导航（覆盖当前页面）
  //   'default'    - 完全不拦截，让 Chrome 按链接自身属性处理
  //   'disabled'   - 仅 Shift / Cmd 专用，等价于"跟随普通点击"
  //
  // 备注：Chrome 扩展 API 目前**没有**办法在分屏那一侧新建 tab。
  //       tabs.create 的新 tab 总是加到普通 tab 栏，不会自动加入 splitViewId。
  //       所以本扩展暂不提供"副屏新开 tab"模式，等 Chrome 开放相关 API 再加。
  defaultAction: "default",
  shiftAction: "reuse",
  modifierAction: "disabled",

  // 当前不在分屏时的回退（仅影响 reuse 模式）：
  //   'background' - 后台新 tab
  //   'foreground' - 前台新 tab
  //   'notify'     - 弹通知提示用户先手动右键 tab → Open in split view
  fallbackWhenNotSplit: "background",

  debugLog: false,
};

// ---- 设置 ----

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function saveSettings(partial) {
  await chrome.storage.sync.set(partial);
}

function debug(settings, ...args) {
  if (settings && settings.debugLog) {
    console.log("[split-link-router]", ...args);
  }
}

// ---- 核心路由 ----

/**
 * 找到"副屏 tab"：和 sourceTab 在同一个 splitView 的另一个 tab。
 * 如果 sourceTab 不在分屏里，返回 null。
 */
async function findSiblingTab(sourceTab) {
  const splitViewId = sourceTab.splitViewId;
  if (
    splitViewId === undefined ||
    splitViewId === null ||
    splitViewId === chrome.tabs.SPLIT_VIEW_ID_NONE
  ) {
    return null;
  }

  const tabs = await chrome.tabs.query({
    windowId: sourceTab.windowId,
    splitViewId: splitViewId,
  });

  // query 可能返回两个 tab（自身 + 副屏），也可能只返回副屏
  const siblings = tabs.filter((t) => t.id !== sourceTab.id);
  return siblings[0] || null;
}

/**
 * 处理来自 content script 的点击事件。
 * 返回值：true 表示已由扩展接管；false 表示放行给 Chrome 默认行为。
 */
async function handleClick(message, sender) {
  const settings = await getSettings();
  const sourceTab = sender.tab;
  if (!sourceTab) return false;

  const url = message.url;
  const modifiers = message.modifiers || {};

  const mode = resolveMode(settings, modifiers);
  debug(settings, "click resolved", { url, mode, tabId: sourceTab.id, splitViewId: sourceTab.splitViewId });

  if (mode === "default") {
    // 放行，让 Chrome 自己处理（content script 收到 false 后会重新触发原生行为）
    return false;
  }

  await performOpen(mode, url, sourceTab, settings, modifiers);
  return true;
}

function resolveMode(settings, mod) {
  const ctrlLike = mod.metaKey || mod.ctrlKey;

  // 纯 Shift → 按 shiftAction；带了其他修饰键 → 让给原生
  if (mod.shiftKey) {
    if (!ctrlLike && !mod.altKey && settings.shiftAction && settings.shiftAction !== "disabled") {
      return settings.shiftAction;
    }
    return "default";
  }

  // 纯 Cmd/Ctrl（没有 Shift）
  if (ctrlLike && settings.modifierAction && settings.modifierAction !== "disabled") {
    return settings.modifierAction;
  }

  return settings.defaultAction;
}

async function performOpen(mode, url, sourceTab, settings, modifiers) {
  switch (mode) {
    case "reuse": {
      const sibling = await findSiblingTab(sourceTab);
      if (sibling) {
        await chrome.tabs.update(sibling.id, { url, active: true });
        return;
      }
      return fallbackWhenNoSplit(url, sourceTab, settings);
    }

    case "background":
      await chrome.tabs.create({
        url,
        windowId: sourceTab.windowId,
        openerTabId: sourceTab.id,
        index: sourceTab.index + 1,
        active: false,
      });
      return;

    case "foreground":
      await chrome.tabs.create({
        url,
        windowId: sourceTab.windowId,
        openerTabId: sourceTab.id,
        index: sourceTab.index + 1,
        active: true,
      });
      return;

    case "current":
      await chrome.tabs.update(sourceTab.id, { url });
      return;

    default:
      // 兜底：后台新 tab
      await chrome.tabs.create({
        url,
        windowId: sourceTab.windowId,
        openerTabId: sourceTab.id,
        active: false,
      });
  }
}

async function fallbackWhenNoSplit(url, sourceTab, settings) {
  const how = settings.fallbackWhenNotSplit;
  if (how === "notify") {
    try {
      await chrome.tabs.sendMessage(sourceTab.id, {
        type: "split-link-router:notify",
        text: "当前 tab 还未进入分屏：右键 tab → Open in split view，然后再试一次。",
      });
    } catch (e) {
      /* ignore */
    }
    return;
  }
  const active = how === "foreground";
  await chrome.tabs.create({
    url,
    windowId: sourceTab.windowId,
    openerTabId: sourceTab.id,
    index: sourceTab.index + 1,
    active,
  });
}

// ---- 消息入口 ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "split-link-router:click") return;
  // 异步处理；返回 true 保持消息通道开启
  handleClick(message, sender)
    .then((intercepted) => sendResponse({ intercepted: Boolean(intercepted) }))
    .catch((err) => {
      console.error("[split-link-router]", err);
      sendResponse({ intercepted: false });
    });
  return true;
});

// 打开 options 页面的消息入口（供 popup 使用）
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "split-link-router:open-options") {
    chrome.runtime.openOptionsPage();
  }
});

// ---- Badge：指示当前 tab 是否能使用"复用副屏"功能 ----
//
// 能用（当前在分屏）  → 彩色图标
// 不能用（未进分屏）  → 灰度图标
// 非 web 页           → 灰度图标（tooltip 不同）

const BADGE_DISABLED_TITLE_NOT_IN_SPLIT =
  "Split Link Router · 不可用：当前 tab 未进入分屏。右键 tab → Open in split view 开启。";
const BADGE_DISABLED_TITLE_NOT_WEB =
  "Split Link Router · 不可用：非 http(s) 页面。";

// 缓存灰度/彩色图标的 ImageData，避免每次切 tab 都重画
const iconCache = {
  color: null, // { 16, 48, 128 } 彩色 ImageData
  gray: null,  // 灰度 ImageData
};

async function loadIconImageData(size) {
  const url = chrome.runtime.getURL(`icons/icon${size}.png`);
  const resp = await fetch(url);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function toGrayscale(imageData) {
  const d = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const gray = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
    d[i] = d[i + 1] = d[i + 2] = gray;
    // 保留原 alpha，但整体再降一点透明度增强"不可用"观感
    d[i + 3] = Math.round(d[i + 3] * 0.55);
  }
  return new ImageData(d, imageData.width, imageData.height);
}

async function ensureIconCache() {
  if (iconCache.color && iconCache.gray) return;
  const sizes = [16, 48, 128];
  const color = {};
  const gray = {};
  for (const size of sizes) {
    const img = await loadIconImageData(size);
    color[size] = img;
    gray[size] = toGrayscale(img);
  }
  iconCache.color = color;
  iconCache.gray = gray;
}

async function applyColorIcon(tabId) {
  try {
    await ensureIconCache();
    await chrome.action.setIcon({ tabId, imageData: iconCache.color });
  } catch (e) {
    /* 某些 tab 可能已关闭或受限 */
  }
}

async function applyGrayIcon(tabId) {
  try {
    await ensureIconCache();
    await chrome.action.setIcon({ tabId, imageData: iconCache.gray });
  } catch (e) {
    /* ignore */
  }
}

function clearBadge(tabId) {
  try {
    chrome.action.setBadgeText({ tabId, text: "" });
  } catch (e) { /* ignore */ }
}

async function refreshBadge(tabId) {
  if (typeof tabId !== "number") return;
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    return;
  }
  if (!tab) return;

  const isWebPage =
    typeof tab.url === "string" &&
    (tab.url.startsWith("http:") || tab.url.startsWith("https:"));

  const inSplit =
    typeof tab.splitViewId === "number" &&
    tab.splitViewId !== chrome.tabs.SPLIT_VIEW_ID_NONE;

  if (isWebPage && inSplit) {
    // 能用：彩色图标
    await applyColorIcon(tabId);
    clearBadge(tabId);
    try {
      chrome.action.setTitle({ tabId, title: "Split Link Router · 可用（当前 tab 在分屏中）" });
    } catch (e) { /* ignore */ }
    return;
  }

  // 不能用：灰度图标
  await applyGrayIcon(tabId);
  clearBadge(tabId);
  try {
    chrome.action.setTitle({
      tabId,
      title: isWebPage ? BADGE_DISABLED_TITLE_NOT_IN_SPLIT : BADGE_DISABLED_TITLE_NOT_WEB,
    });
  } catch (e) { /* ignore */ }
}

// 启动时：给当前活动 tab 上一次 badge
chrome.runtime.onInstalled.addListener(async () => {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active) refreshBadge(active.id);
});
chrome.runtime.onStartup.addListener(async () => {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active) refreshBadge(active.id);
});

// tab 切换、状态变化时刷新
chrome.tabs.onActivated.addListener(({ tabId }) => refreshBadge(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.splitViewId !== undefined ||
    changeInfo.url !== undefined ||
    changeInfo.status === "complete"
  ) {
    refreshBadge(tabId);
  }
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [active] = await chrome.tabs.query({ active: true, windowId });
  if (active) refreshBadge(active.id);
});


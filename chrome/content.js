/**
 * Split Link Router - content script
 *
 * 策略：
 *   - 从 chrome.storage.sync 拉一份 settings 缓存
 *   - click 时同步判断"这个点击是否会被扩展接管"
 *   - 只在会接管时才 preventDefault；否则完全放行给 Chrome 原生
 *   - 真正的 tabs 操作仍由 background 完成
 *
 * 只处理跨站外链，不干扰站内导航。
 */

(function () {
  if (window.__splitLinkRouterInstalled) return;
  window.__splitLinkRouterInstalled = true;

  const DEFAULTS = {
    defaultAction: "default",
    shiftAction: "reuse",
    modifierAction: "disabled",
    fallbackWhenNotSplit: "background",
    debugLog: false,
  };

  let settings = { ...DEFAULTS };

  chrome.storage.sync.get(DEFAULTS, (saved) => {
    settings = { ...DEFAULTS, ...saved };
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of Object.keys(changes)) {
      settings[key] = changes[key].newValue;
    }
  });

  function findAnchor(el) {
    while (el && el !== document) {
      if (el.tagName === "A" && el.href) return el;
      el = el.parentElement;
    }
    return null;
  }

  function parseHttpUrl(anchor) {
    try {
      const url = new URL(anchor.href, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return { url: url.toString(), sameOrigin: url.host === location.host };
    } catch (e) {
      return null;
    }
  }

  function resolveMode(mod) {
    const ctrlLike = mod.metaKey || mod.ctrlKey;

    // 纯 Shift → 按 shiftAction 处理
    // Shift 组合了其他修饰键（Cmd/Ctrl/Alt）→ 让给 Chrome 原生
    if (mod.shiftKey) {
      if (!ctrlLike && !mod.altKey && settings.shiftAction && settings.shiftAction !== "disabled") {
        return settings.shiftAction;
      }
      return "default";
    }

    // 纯 Cmd/Ctrl（没有 Shift）→ 按 modifierAction 处理
    if (ctrlLike && settings.modifierAction && settings.modifierAction !== "disabled") {
      return settings.modifierAction;
    }

    return settings.defaultAction;
  }

  // 返回 true 表示扩展会接管这次点击；false 表示放行给 Chrome 原生
  function shouldIntercept(mod, parsed) {
    const mode = resolveMode(mod);
    if (mode === "default") return false;

    // 同站链接：只有修饰键明确触发时才拦，避免破坏 SPA 导航
    if (parsed.sameOrigin) {
      const ctrlLike = mod.metaKey || mod.ctrlKey;
      const shiftTriggered =
        mod.shiftKey && !ctrlLike && !mod.altKey &&
        settings.shiftAction && settings.shiftAction !== "disabled";
      const ctrlTriggered =
        ctrlLike && !mod.shiftKey &&
        settings.modifierAction && settings.modifierAction !== "disabled";
      return Boolean(shiftTriggered || ctrlTriggered);
    }

    // 跨站：按 mode 决定（mode !== 'default' 即拦）
    return true;
  }

  // 简单去重：mousedown 拦截后，同一批次的 click/auxclick 不再发消息
  let lastInterceptAt = 0;

  function handleMouse(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;

    const anchor = findAnchor(event.target);
    if (!anchor) return;

    const parsed = parseHttpUrl(anchor);
    if (!parsed) return;

    const mod = {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };

    if (!shouldIntercept(mod, parsed)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();

    // 500ms 内重复触发（同一次点击的 mousedown + click）只发一次消息
    const now = Date.now();
    if (now - lastInterceptAt < 500) return;
    lastInterceptAt = now;

    chrome.runtime.sendMessage({
      type: "split-link-router:click",
      url: parsed.url,
      modifiers: mod,
    });
  }

  // 关键：在 mousedown 阶段就拦一次，避免 Shift+Click 触发 Chrome 原生"新窗口"决策
  // （click 之前 Chrome 已经根据 mousedown 决定了窗口/tab 行为）
  document.addEventListener("mousedown", handleMouse, true);
  document.addEventListener("click", handleMouse, true);
  document.addEventListener("auxclick", handleMouse, true);

  // 接收来自 service worker 的轻量通知
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "split-link-router:notify") {
      showToast(message.text);
    }
  });

  // ---- 简单 toast ----
  function showToast(text) {
    const id = "__split_link_router_toast";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        background: "rgba(20,20,20,.92)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px",
        fontSize: "13px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "360px",
        lineHeight: "1.5",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        transition: "opacity .25s",
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(el.__hideTimer);
    el.__hideTimer = setTimeout(() => {
      el.style.opacity = "0";
    }, 3500);
  }
})();

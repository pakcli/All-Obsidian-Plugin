/**
 * Options 页面脚本：填充下拉、加载/保存设置。
 */

const DEFAULT_SETTINGS = {
  defaultAction: "default",
  shiftAction: "reuse",
  modifierAction: "disabled",
  fallbackWhenNotSplit: "background",
  debugLog: false,
};

const OPEN_MODES = [
  { value: "default", label: "不拦截（Chrome 原生行为）" },
  { value: "reuse", label: "复用副屏（在分屏另一侧 tab 里换 URL）" },
  { value: "background", label: "后台新 tab" },
  { value: "foreground", label: "前台新 tab" },
  { value: "current", label: "在当前 tab 导航（覆盖当前页）" },
];

const SHIFT_CMD_EXTRA = [
  { value: "disabled", label: "不拦截（跟随普通点击）" },
];

const FALLBACK_OPTIONS = [
  { value: "background", label: "后台新 tab" },
  { value: "foreground", label: "前台新 tab" },
  { value: "notify", label: "弹提示：请先手动进入分屏" },
];

function fillSelect(selectEl, options, extraOptions = []) {
  selectEl.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
  for (const o of extraOptions) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
}

async function load() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...saved };

  fillSelect(document.getElementById("defaultAction"), OPEN_MODES);
  fillSelect(document.getElementById("shiftAction"), OPEN_MODES, SHIFT_CMD_EXTRA);
  fillSelect(document.getElementById("modifierAction"), OPEN_MODES, SHIFT_CMD_EXTRA);
  fillSelect(document.getElementById("fallbackWhenNotSplit"), FALLBACK_OPTIONS);

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = Boolean(settings[key]);
    } else {
      el.value = settings[key];
    }
  }
}

function bindChange() {
  const savedEl = document.getElementById("saved");
  const keys = Object.keys(DEFAULT_SETTINGS);
  for (const key of keys) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.addEventListener("change", async () => {
      const value = el.type === "checkbox" ? el.checked : el.value;
      await chrome.storage.sync.set({ [key]: value });
      savedEl.classList.add("show");
      clearTimeout(savedEl.__t);
      savedEl.__t = setTimeout(() => savedEl.classList.remove("show"), 1200);
    });
  }
}

load().then(bindChange);

# Split Link Router

A Chrome extension that routes external link clicks to the "other side" of Chrome's native **Split View**, inspired by the [Obsidian sibling plugin](https://github.com/Hucy/split-link-router/tree/main/obsidian) in the same repo.

> Requires **Chrome 140+** — uses the new `tabs.splitViewId` API.

## What it does

Chrome 140+ introduced a native **Split View** feature (two tabs side by side in one window). But Chrome's extension API only lets you **observe** split state (`tab.splitViewId`); it cannot create or modify a split programmatically.

This extension bridges that gap by making your link-click behavior **split-aware**:

- When you're already in split view and click an external link on one side, the link opens on the **other** side (reusing the existing tab, or opening a new tab there).
- When you're not in split view, it gracefully falls back to a plain new tab (or a helpful notification telling you to enter split view first).

## Features

- **Minimal-intrusion by default** — Plain click and Cmd/Ctrl click are NOT intercepted, so Chrome's native behavior (in-tab navigation / background new tab) stays exactly as you're used to.
- **Shift + click → reuse split sibling** — With Chrome's native Split View active, hold Shift and click an external link. The URL loads in the *other* tab of your split view, replacing what's there.
- **Status icon** — The extension icon itself reflects availability:
  - 🟢 **Colored icon** — Extension active: current tab is in split view, Shift-click reuse works.
  - ⚫ **Greyed-out icon** — Extension inactive: current tab isn't in split view, or is a non-web page. Hover the icon for a hint.
- **Configurable per click type** — Plain / Shift / Cmd-Ctrl each have their own setting, all sharing the same set of open modes:
  - Default (don't intercept)
  - Reuse split sibling
  - Background / foreground new tab
  - Navigate current tab
- **Smart external-link detection** — Only intercepts cross-origin `http(s)` links; leaves same-origin SPA navigation alone.
- **Graceful fallback** — When "Reuse" is chosen but you're not in split view, fall back to a new tab (or show a toast with setup tips).

## Known limitation

Chrome 140+ exposes `tab.splitViewId` as **read-only**. There is currently no extension API to:

- programmatically enter split view
- open a new tab *inside* an existing split view

This means we cannot offer a "new tab on split side" mode — any `tabs.create()` goes to the normal tab strip. We'll add it as soon as Chrome ships the API.

## Installation (developer mode)

1. Clone this repo to `~/code/chrome-split-link-router` (or any location).
2. Open `chrome://extensions` in Chrome 140+.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension icon for quick access.

## First-time setup

1. Enable Chrome's Split View:
   - `chrome://flags/#side-by-side` → **Enabled** (if you're on a Chrome version where it's still flagged).
   - Or just use Chrome 142+ where it's stable.
2. Open two tabs you want to pair.
3. Right-click the tab bar → **Open in split view** (or similar menu item).
4. Now click any external link on either side. It'll route to the other side per your settings.

## Configuration

Click the extension icon → **打开设置** (or right-click the icon → Options).

| Setting | Default | Options |
|---|---|---|
| 普通点击行为 (Plain click) | Default (don't intercept) | default / reuse / background / foreground / current |
| Shift 点击行为 | Reuse split sibling | default / reuse / background / foreground / current / disabled |
| Cmd/Ctrl 点击行为 | Disabled (follow plain click) | default / reuse / background / foreground / current / disabled |
| 不在分屏时的回退 | Background new tab | background / foreground / notify |
| 调试日志 | Off | — |

### Open modes explained

| Mode | Behavior |
|---|---|
| **Default** | Don't intercept; let Chrome handle the click natively. |
| **Reuse** | Navigate the split sibling tab to the new URL. Falls back when not in split. |
| **Background** | Background new tab right after the current tab. |
| **Foreground** | Foreground new tab right after the current tab. |
| **Current** | Navigate the current tab (replaces current page). |
| **Disabled** | (Shift / Cmd only) Fall through to plain-click behavior. |

## How it works

The extension consists of:

- **`content.js`** — Injected into every page. Intercepts external `<a>` click / auxclick in the capture phase, collects URL + modifier keys, forwards to the service worker.
- **`background.js`** — Service worker. Uses `chrome.tabs.query({ splitViewId })` to find the split sibling, then either `tabs.update` (reuse), `tabs.create({ openerTabId: sibling.id })` (new tab on split side), or a plain `tabs.create` (fallback).
- **`options.html/js`** — Settings stored in `chrome.storage.sync`.

### Why not "truly create a split" from the extension?

As of Chrome 140+, `chrome.tabs.SPLIT_VIEW_ID_NONE` and `tab.splitViewId` are available, but **there is no public API to programmatically enter or create a split view**. You have to trigger it manually (right-click tab → Open in split view). This extension works *after* you've created a split, not *to* create one.

## Limitations

- **Chrome 140+ only** — Uses new APIs that don't exist in older versions.
- **Needs manual split entry** — You must right-click a tab to enter split view the first time.
- **Same-origin links are not intercepted** — Avoids breaking SPAs and in-site navigation.
- **Incognito is not enabled by default** — Enable manually in `chrome://extensions` if needed.

## Development

No build step required. Plain JS / HTML / CSS. Edit files and hit the reload icon in `chrome://extensions`.

## License

[MIT](LICENSE)

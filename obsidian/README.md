# Split Web Viewer Modifier

An [Obsidian](https://obsidian.md) plugin that opens external links in a **split-pane Web Viewer** instead of jumping to your system browser — and lets you decide what happens when you hold **Shift** or **Cmd/Ctrl**.

## Features

- **Split-pane Web Viewer** — External links open in a dedicated side pane, keeping your notes visible.
- **Smart reuse** — Subsequent clicks reuse the same pane (URL swaps in place). After an Obsidian restart, the plugin automatically picks up an existing Web Viewer tab if one is present.
- **Shift + click → new tab** — Hold Shift to open a link in a *new* Web Viewer tab right next to the current one, without replacing it.
- **Cmd/Ctrl + click → toggle target** — Quickly flip between Web Viewer and your default browser.
- **Unified open-mode options** — All three click behaviors (plain / Shift / Cmd-Ctrl) share the same set of choices, so configuration is intuitive and consistent:
  - Reuse current Web Viewer
  - New Web Viewer tab
  - New split Web Viewer
  - Default browser
- **Three-layer interception** — Catches links in Reading View (DOM click), Live Preview / Source Mode (`window.open` patch), and Electron fallback (`shell.openExternal` patch).
- **Automatic fallback** — If Web Viewer is not enabled, gracefully falls back to the default browser.
- **Clean unload** — All patches are removed when the plugin is disabled; nothing leaks into the global scope.

## Installation

### Manual

1. Download `main.js`, `manifest.json` from the latest [release](https://github.com/Hucy/split-link-router/releases) (or build from source).
2. Create a folder in your vault:
   ```
   <vault>/.obsidian/plugins/split-web-viewer-modifier/
   ```
3. Copy `main.js` and `manifest.json` into that folder.
4. Open Obsidian → **Settings → Community plugins → Installed plugins** → enable **Split Web Viewer Modifier**.
5. Make sure the **Web Viewer** core plugin is also enabled (**Settings → Core plugins → Web Viewer**).

### From Community Plugins (coming soon)

Search for **Split Web Viewer Modifier** in **Settings → Community plugins → Browse**.

## Configuration

Open **Settings → Community plugins → Split Web Viewer Modifier → ⚙️**.

### Click Behaviors

| Setting | Default | Description |
|---|---|---|
| **普通点击行为** (Plain click) | Follow Web Viewer setting | What happens when you click an external link normally. |
| **Shift 点击行为** (Shift + click) | New Web Viewer tab | What happens when you hold Shift and click. |
| **Cmd/Ctrl 点击行为** (Cmd/Ctrl + click) | Toggle default target | What happens when you hold Cmd (macOS) or Ctrl (Win/Linux) and click. |

Each of these supports the same set of open modes:

| Open Mode | Behavior |
|---|---|
| **复用当前 Web Viewer** (Reuse) | Replace the URL in the current Web Viewer pane. |
| **新开 Web Viewer tab** (New tab) | Open a new tab next to the current Web Viewer. |
| **新建分屏 Web Viewer** (New split) | Create a new split pane. |
| **在默认浏览器打开** (Browser) | Open in the system default browser. |

Additionally:
- Plain click has a **"Follow Web Viewer setting"** option that respects the core Web Viewer's external-link toggle.
- Cmd/Ctrl click has a **"Toggle default target"** option that flips Web Viewer ↔ Browser based on the plain-click result.
- Shift / Cmd-Ctrl click both have a **"Disabled"** option that falls through to the plain-click behavior.

### Other Settings

| Setting | Default | Description |
|---|---|---|
| 分屏方向 (Split direction) | vertical (right) | `vertical` = right side, `horizontal` = bottom. Only applies when a new split is created. |
| 打开后聚焦新分屏 (Focus new pane) | ✅ | Auto-switch focus to the Web Viewer pane after opening. |
| 无法使用 Web Viewer 时回退到浏览器 (Fallback) | ✅ | If Web Viewer is unavailable, open in system browser instead of showing an error. |
| 自动检测失败时的回退行为 (Detection fallback) | browser | When "Follow Web Viewer setting" can't detect the core plugin's external-link toggle. |
| 调试日志 (Debug log) | ❌ | Print interception logs to the DevTools Console for troubleshooting. |

## How It Works

Obsidian does not expose a public API to intercept external-link clicks. This plugin uses a three-layer interception strategy (the same approach used by well-known community plugins like `obsidian-open-link-with`):

1. **DOM `click` / `auxclick` capture** — Intercepts real `<a>` tag clicks in Reading View and other rendered HTML surfaces.
2. **`window.open` monkey-patch** — Catches links opened internally by Obsidian's CodeMirror editor (Live Preview / Source Mode).
3. **`electron.shell.openExternal` monkey-patch** — Catches the Electron-level fallback that some Obsidian code paths use.

A `mousedown` tracker records modifier-key state so that even `window.open` calls (which don't receive the original MouseEvent) know whether Shift or Cmd/Ctrl was held.

All patches are cleanly restored when the plugin is unloaded.

## Compatibility

- **Obsidian**: ≥ 1.8.0
- **Platform**: Desktop only (Electron required for layer 3)
- **Web Viewer core plugin**: Must be enabled for Web Viewer modes to work; otherwise falls back to browser.

## Changelog

### 1.0.0

- Unified open-mode model: plain / Shift / Cmd-Ctrl click all share the same option set.
- Three-layer interception: DOM click + `window.open` + `shell.openExternal`.
- Smart reuse: remembers last Web Viewer pane; survives Obsidian restart by detecting existing tabs.
- Shift + click: open in a new tab next to the current Web Viewer.
- Cmd/Ctrl + click: toggle between Web Viewer and browser.
- Automatic migration from pre-1.0 settings.
- Debug logging toggle for troubleshooting.

## License

[MIT](LICENSE)

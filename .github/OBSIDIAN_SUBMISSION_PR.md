# Obsidian 社区插件 PR 模板（已按本项目填好）

直接复制下面整个代码块到 PR 描述里即可。然后按 checkbox 实际勾选测试过的平台。

---

```markdown
# I am submitting a new Community Plugin

- [x] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.

## Repo URL

Link to my plugin: https://github.com/Hucy/split-link-router

> **Note on repo layout:** this repository is a monorepo hosting two related tools — an Obsidian plugin (`obsidian/`) and a Chrome extension (`chrome/`). The Obsidian plugin's `manifest.json`, source, and release pipeline all live under `obsidian/`. The GitHub release `obsidian-v1.0.0` contains the required assets as individual files (`main.js`, `manifest.json`, `versions.json`) at the root of the release, in the format Obsidian's auto-updater expects.

## Release Checklist
- [x] I have tested the plugin on
  - [ ] Windows
  - [x] macOS
  - [ ] Linux
  - [ ] Android _(if applicable — desktop-only plugin, `isDesktopOnly: true`)_
  - [ ] iOS _(if applicable — desktop-only plugin, `isDesktopOnly: true`)_
- [x] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)
  - [x] `main.js`
  - [x] `manifest.json`
  - [ ] `styles.css` _(not used — plugin has no custom CSS)_
- [x] GitHub release name matches the exact version number specified in my manifest.json (release tag is `obsidian-v1.0.0`, and `manifest.json` version is `1.0.0`)
- [x] The `id` in my `manifest.json` matches the `id` in the `community-plugins.json` file. (`split-web-viewer-modifier`)
- [x] My README.md describes the plugin's purpose and provides clear usage instructions. (see `obsidian/README.md`)
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [x] I have added a license in the LICENSE file. (MIT — both at repo root and at `obsidian/LICENSE`)
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using. I have given proper attribution to these other projects in my `README.md`.
```

---

## 需要你在 PR 提交前再次确认的点

1. **Release 必须真的已构建完成**
   - 打开 https://github.com/Hucy/split-link-router/releases/tag/obsidian-v1.0.0
   - 确认底部 Assets 里能看到独立的 `main.js`、`manifest.json`、`versions.json`（不只是 source zip）

2. **测试过的平台**
   - 当前模板勾了 macOS。实际你在哪些桌面系统测过？只勾实际测过的，不要虚报。
   - 插件 `isDesktopOnly: true`，所以 Android / iOS 本就不适用，勾不勾都行，我给它们加了说明。

3. **`community-plugins.json` 新增条目**（配套的、要放到 obsidian-releases 仓库里）

   ```json
   {
       "id": "split-web-viewer-modifier",
       "name": "Split Web Viewer Modifier",
       "author": "xIYuE",
       "description": "Open external links in a split-pane Web Viewer. Supports reuse, new tab, new split, and browser modes. Configurable Shift / Cmd/Ctrl click behavior.",
       "repo": "Hucy/split-link-router"
   }
   ```

   加在文件末尾（`]` 前），注意前一个条目末尾要加逗号。

## 提交步骤再提醒一次

```bash
# 1. Fork https://github.com/obsidianmd/obsidian-releases
# 2. clone 你的 fork
git clone git@github.com:Hucy/obsidian-releases.git
cd obsidian-releases
git remote add upstream https://github.com/obsidianmd/obsidian-releases.git
git pull upstream master

# 3. 新分支
git checkout -b add-split-web-viewer-modifier

# 4. 编辑 community-plugins.json，在末尾追加上面那个对象

# 5. commit + push
git add community-plugins.json
git commit -m "Add plugin: Split Web Viewer Modifier"
git push origin add-split-web-viewer-modifier

# 6. GitHub 上开 PR，标题：Add plugin: Split Web Viewer Modifier
#    描述里粘贴本文件顶部的模板内容
```

## 大概率会收到的 bot 反馈（提前知道好处理）

| 反馈 | 原因 | 处理 |
|---|---|---|
| `manifest.json not found in root` | 你的在 `obsidian/manifest.json` | 在根目录放一份同步副本，或拆独立仓库 |
| `Please use a name that is more specific` | `Split Web Viewer Modifier` 可能被判普通 | 如被要求改名，改 `manifest.json` 的 `name` 重新发 release |
| `Plugin does this already` | 存在功能重复插件 | 在 PR 里说明差异化点 |
| `Remove "Obsidian" / "plugin" from name` | 官方禁止在 name 里出现这些词 | 你的 name 不含，应该没问题 |

bot 报错不代表被拒，只要按提示修好 push 到同一个分支，bot 会自动重跑。

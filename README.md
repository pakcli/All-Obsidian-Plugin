# Split Link Router

一组让"点链接 → 在分屏另一侧打开"变得自然的工具，覆盖 **Obsidian** 和 **Chrome** 两个场景。

## 子项目

| 目录 | 目标平台 | 状态 |
|---|---|---|
| [`obsidian/`](./obsidian) | Obsidian 1.8+ 桌面端 | **v1.0.0** — 可用 |
| [`chrome/`](./chrome) | Chrome 140+ | 开发中 — 可本地加载 |

## 共同的理念

两个子项目都想解决同一件事：

> **不想每点一个链接就切屏 / 开新窗口，而是希望链接**"在旁边**打开**" ——**同一个面板原地换内容，或者多开在同一组里**。

- **Obsidian** 版：基于 Obsidian 原生 Web Viewer，把外链分屏打开，并支持复用同一个 Web Viewer pane、Shift 开新 tab、Cmd/Ctrl 走浏览器。
- **Chrome** 版：基于 Chrome 140+ 的原生 Split View（`tab.splitViewId` 只读 API），让 Shift+Click 把链接路由到分屏的**副屏 tab**。

## 快速索引

### Obsidian

- 路径：`obsidian/`
- 安装方式：见 [`obsidian/README.md`](./obsidian/README.md)
- 主要功能：
  - 外链在 split pane 的 Web Viewer 里打开
  - 复用同一个 Web Viewer pane 切换 URL
  - Shift + 点击：新开 Web Viewer tab
  - Cmd/Ctrl + 点击：反转默认目标（Web Viewer ↔ 浏览器）

### Chrome

- 路径：`chrome/`
- 安装方式：`chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序 → 选 `chrome/` 目录
- 主要功能：
  - Shift + Click：复用 Chrome 原生分屏的副屏 tab
  - 扩展图标颜色反映当前 tab 是否在分屏中（彩色=可用，灰度=不可用）
  - 不干扰 Chrome 原生 Cmd/Ctrl+Click、Shift+Cmd+Click 等修饰键行为

> **Chrome 扩展的已知限制**：Chrome 扩展 API 目前**不允许**程序化进入分屏，也不允许把新建 tab 加入分屏。因此 Chrome 版需要用户先手动右键 tab → **Open in split view**。

## 开发

每个子目录都是独立工程：

- Obsidian 插件：纯 JS，无构建步骤
- Chrome 扩展：纯 JS，无构建步骤（MV3）

直接改代码 → Obsidian 里 `Cmd + R` / Chrome `chrome://extensions` 点刷新图标即可。

## Release 流程

两个子项目各自打独立 tag，GitHub Actions 自动构建并发布 release。

### 使用本地脚本（推荐）

```bash
# 只发布 Obsidian v1.0.1
./scripts/release.sh --obsidian 1.0.1

# 只发布 Chrome v0.2.0
./scripts/release.sh --chrome 0.2.0

# 同时发布两个（一次 commit，两个 tag，两个 workflow 并行触发）
./scripts/release.sh --obsidian 1.0.1 --chrome 0.2.0
```

脚本会：
1. 校验 git 工作区干净、版本号合法
2. 更新对应 `manifest.json` 的 `version`（Obsidian 还会追加 `versions.json`，并把 `obsidian/manifest.json` 同步复制到仓库根目录 —— Obsidian 社区插件审核 bot 强制要求 `manifest.json` 在根目录）
3. 提交一个 commit：
   - 单目标：`release(<target>): <version>`
   - 双目标：`release: obsidian <ver>, chrome <ver>`
4. 为每个目标打 tag：
   - Obsidian：`<version>`（纯版本号，如 `1.0.1`）—— Obsidian 社区插件官方要求 tag 就是 manifest.json 的 version，不加前缀
   - Chrome：`chrome-v<version>`（如 `chrome-v0.2.0`）

最后你手动 `git push origin main --follow-tags`，CI 接管后续。

### 手动发布

也可以直接手工改 `manifest.json` 版本号，然后：

```bash
# 如果改的是 obsidian，务必同步根目录的 manifest.json
cp obsidian/manifest.json manifest.json

git commit -am "release(obsidian): 1.0.1"
git tag 1.0.1          # 注意：obsidian tag 是纯版本号
git push origin main --follow-tags
```

### CI 工作流

- `.github/workflows/release-obsidian.yml`：触发条件 纯数字型 tag（如 `1.0.0`、`1.2.3`）
  - 校验 `obsidian/manifest.json` 版本号与 tag 匹配
  - 校验根目录 `manifest.json` 与 `obsidian/manifest.json` 保持一致
  - 上传 `main.js / manifest.json / versions.json` 到 release
- `.github/workflows/release-chrome.yml`：触发条件 `chrome-v*` tag
  - 校验 `chrome/manifest.json` 版本号与 tag 匹配
  - 打包 `chrome/` 目录为 zip
  - 上传 zip 到 release（Chrome Web Store 可直接上传此 zip）

### 官方商店发布（手动）

- **Obsidian 社区插件**：release 建完后，去 [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 提 PR 添加条目（首次提交）；后续版本社区会自动识别新 tag
- **Chrome Web Store**：登录 [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)，上传 release 里的 zip 文件

## License

[MIT](LICENSE)

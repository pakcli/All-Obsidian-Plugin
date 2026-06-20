#!/usr/bin/env bash
# release.sh
#
# 用法：
#   ./scripts/release.sh --obsidian 1.0.1
#   ./scripts/release.sh --chrome 0.2.0
#   ./scripts/release.sh --obsidian 1.0.1 --chrome 0.2.0   # 同时发布两个子项目
#
# 自动完成：
#   1. 检查 git 工作区干净
#   2. 更新对应 manifest.json 的 version 字段
#   3. 如果涉及 obsidian：追加 versions.json，同步根目录 manifest.json
#   4. 一次性 commit，并为每个子项目打 tag
#      - obsidian tag = <version>      (e.g. 1.0.1)  -- 社区插件要求
#      - chrome   tag = chrome-v<ver>  (e.g. chrome-v0.2.0)
#   5. CI 检测到 tag 会自动构建 release（见 .github/workflows/）

set -euo pipefail

OBSIDIAN_VERSION=""
CHROME_VERSION=""

usage() {
  echo "Usage:"
  echo "  $0 --obsidian <version>"
  echo "  $0 --chrome <version>"
  echo "  $0 --obsidian <version> --chrome <version>"
  echo ""
  echo "Examples:"
  echo "  $0 --obsidian 1.0.1"
  echo "  $0 --chrome 0.2.0"
  echo "  $0 --obsidian 1.0.1 --chrome 0.2.0"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --obsidian)
      OBSIDIAN_VERSION="${2:-}"
      [[ -z "$OBSIDIAN_VERSION" || "$OBSIDIAN_VERSION" == --* ]] && { echo "Error: --obsidian needs a version"; usage; }
      shift 2
      ;;
    --chrome)
      CHROME_VERSION="${2:-}"
      [[ -z "$CHROME_VERSION" || "$CHROME_VERSION" == --* ]] && { echo "Error: --chrome needs a version"; usage; }
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Error: unknown argument '$1'"
      usage
      ;;
  esac
done

if [[ -z "$OBSIDIAN_VERSION" && -z "$CHROME_VERSION" ]]; then
  echo "Error: must specify at least one of --obsidian or --chrome"
  usage
fi

semver_check() {
  local label="$1" v="$2"
  if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: $label version must be semver like 1.2.3, got '$v'"
    exit 1
  fi
}

[[ -n "$OBSIDIAN_VERSION" ]] && semver_check "obsidian" "$OBSIDIAN_VERSION"
[[ -n "$CHROME_VERSION" ]]   && semver_check "chrome"   "$CHROME_VERSION"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

# 1. 工作区必须干净
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree not clean. Commit or stash first."
  git status --short
  exit 1
fi

# ---- helpers ---------------------------------------------------------------

bump_manifest() {
  # $1 = sub-project dir (obsidian|chrome)
  # $2 = new version
  local dir="$1" ver="$2"
  local manifest="$dir/manifest.json"
  if [[ ! -f "$manifest" ]]; then
    echo "Error: $manifest not found"
    exit 1
  fi
  local current
  current=$(node -p "require('./$manifest').version")
  echo "→ $dir: $current → $ver"
  node -e "
    const fs = require('fs');
    const p = '$manifest';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '$ver';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
  git add "$manifest"
}

bump_obsidian_versions_json() {
  # $1 = new obsidian version
  local ver="$1"
  local versions_file="obsidian/versions.json"
  local min_app_version
  min_app_version=$(node -p "require('./obsidian/manifest.json').minAppVersion")
  node -e "
    const fs = require('fs');
    const p = '$versions_file';
    const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    j['$ver'] = '$min_app_version';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
  echo "  updated $versions_file with $ver -> $min_app_version"
  git add "$versions_file"
}

sync_root_obsidian_manifest() {
  # Obsidian community-plugins review bot requires manifest.json at repo root.
  # Keep the root copy byte-identical to obsidian/manifest.json.
  cp obsidian/manifest.json manifest.json
  echo "  synced root manifest.json from obsidian/manifest.json"
  git add manifest.json
}

# ---- main ------------------------------------------------------------------

TAGS=()
MSG_PARTS=()

if [[ -n "$OBSIDIAN_VERSION" ]]; then
  bump_manifest "obsidian" "$OBSIDIAN_VERSION"
  bump_obsidian_versions_json "$OBSIDIAN_VERSION"
  sync_root_obsidian_manifest
  # Obsidian community plugin registry requires the tag to equal the raw version
  # (no prefix). See https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
  TAGS+=("$OBSIDIAN_VERSION")
  MSG_PARTS+=("obsidian $OBSIDIAN_VERSION")
fi

if [[ -n "$CHROME_VERSION" ]]; then
  bump_manifest "chrome" "$CHROME_VERSION"
  TAGS+=("chrome-v$CHROME_VERSION")
  MSG_PARTS+=("chrome $CHROME_VERSION")
fi

# commit + tag(s)
COMMIT_MSG="release: $(IFS=', '; echo "${MSG_PARTS[*]}")"
git commit -m "$COMMIT_MSG"
for t in "${TAGS[@]}"; do
  git tag -a "$t" -m "${t/-v/ }"
done

echo ""
echo "✓ Committed: $COMMIT_MSG"
echo "✓ Tagged locally: ${TAGS[*]}"
echo ""
echo "Next step (review first!):"
echo "  git push origin main --follow-tags"
echo ""
echo "Or to push only the tag(s):"
for t in "${TAGS[@]}"; do
  echo "  git push origin $t"
done
echo ""
echo "CI will then build and publish the release(s) automatically."

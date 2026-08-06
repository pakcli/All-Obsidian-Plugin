# start_publish.ps1
# Official automated release build script for PakCLI Editor's Choice Obsidian plugin.

$ErrorActionPreference = 'Stop'

function Write-Step ([string]$message) {
    Write-Host "`n[+] $message" -ForegroundColor Cyan
}

function Write-Success ([string]$message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warn ([string]$message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Err ([string]$message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   PakCLI Obsidian Plugin - Release & Publish Tool   " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# Step 1: Pre-flight checks
# -------------------------------------------------------------------------
Write-Step "Performing pre-flight environment checks..."

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm is not installed or not in PATH."
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Err "git is not installed or not in PATH."
    exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Err "GitHub CLI (gh) is not installed. Please install 'gh'."
    exit 1
}

if (-not (Test-Path "manifest.json")) {
    Write-Err "manifest.json not found in current directory!"
    exit 1
}

# Get current repo nameWithOwner (e.g. pakcli/All-Obsidian-Plugin)
$RepoPath = (gh repo view --json nameWithOwner -q .nameWithOwner 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    Write-Err "Could not determine GitHub repository path using gh repo view."
    exit 1
}

# Parse manifest.json
$ManifestContent = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$CurrentVersion = $ManifestContent.version
$PluginId = $ManifestContent.id
$PluginName = $ManifestContent.name

Write-Host "Plugin Name:     $PluginName" -ForegroundColor White
Write-Host "Plugin ID:       $PluginId" -ForegroundColor White
Write-Host "Current Version: $CurrentVersion" -ForegroundColor Yellow
Write-Host "GitHub Repo:     $RepoPath" -ForegroundColor White

# -------------------------------------------------------------------------
# Step 2: Version Bumping Option
# -------------------------------------------------------------------------
Write-Step "Select release version mode:"
Write-Host "  [1] Keep current version ($CurrentVersion)" -ForegroundColor White
Write-Host "  [2] Patch bump (e.g. 1.0.0 -> 1.0.1)" -ForegroundColor White
Write-Host "  [3] Minor bump (e.g. 1.0.0 -> 1.1.0)" -ForegroundColor White
Write-Host "  [4] Major bump (e.g. 1.0.0 -> 2.0.0)" -ForegroundColor White
Write-Host "  [5] Custom version string" -ForegroundColor White

$Choice = Read-Host "`nEnter choice [Default: 1]"
if ([string]::IsNullOrWhiteSpace($Choice)) { $Choice = "1" }

$TargetVersion = $CurrentVersion

if ($Choice -eq "2") {
    $v = [version]$CurrentVersion
    $TargetVersion = "$($v.Major).$($v.Minor).$($v.Build + 1)"
} elseif ($Choice -eq "3") {
    $v = [version]$CurrentVersion
    $TargetVersion = "$($v.Major).$($v.Minor + 1).0"
} elseif ($Choice -eq "4") {
    $v = [version]$CurrentVersion
    $TargetVersion = "$($v.Major + 1).0.0"
} elseif ($Choice -eq "5") {
    $TargetVersion = Read-Host "Enter custom version (Semantic Versioning e.g. 1.0.1)"
    if ([string]::IsNullOrWhiteSpace($TargetVersion)) {
        Write-Err "Invalid version entered."
        exit 1
    }
}

if ($TargetVersion -ne $CurrentVersion) {
    Write-Step "Bumping version from $CurrentVersion to $TargetVersion..."
    
    # 1. Update package.json
    $Pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $Pkg.version = $TargetVersion
    $Pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"

    # 2. Update manifest.json & versions.json via version-bump.mjs
    $env:npm_package_version = $TargetVersion
    node version-bump.mjs
    Remove-Item Env:\npm_package_version -ErrorAction SilentlyContinue

    Write-Success "Updated package.json, manifest.json, and versions.json to $TargetVersion"
} else {
    Write-Host "Proceeding with version $TargetVersion" -ForegroundColor Green
}

# -------------------------------------------------------------------------
# Step 3: Production Build & Asset Packaging
# -------------------------------------------------------------------------
Write-Step "Running production build (npm run build)..."

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed! Please fix TypeScript / esbuild compilation errors before publishing."
    exit $LASTEXITCODE
}

# Verify required files
$RequiredFiles = @("main.js", "manifest.json", "styles.css")
foreach ($f in $RequiredFiles) {
    if (-not (Test-Path $f)) {
        Write-Err "Missing required release file: $f"
        exit 1
    }
}

$DistReleaseDir = Join-Path $PSScriptRoot "dist_release"
if (!(Test-Path $DistReleaseDir)) {
    New-Item -ItemType Directory -Path $DistReleaseDir | Out-Null
}
Copy-Item "main.js" -Destination $DistReleaseDir -Force
Copy-Item "manifest.json" -Destination $DistReleaseDir -Force
Copy-Item "styles.css" -Destination $DistReleaseDir -Force

Write-Success "Build completed successfully! All release artifacts present (main.js, manifest.json, styles.css)."

# -------------------------------------------------------------------------
# Step 4: Git Commit & Tagging
# -------------------------------------------------------------------------
Write-Step "Checking Git status and tags..."

$GitStatus = git status --porcelain
if ($GitStatus) {
    Write-Host "Committing local changes..." -ForegroundColor Yellow
    git add .
    git commit -m "Release $TargetVersion"
    Write-Success "Committed with message 'Release $TargetVersion'"
}

$ExistingTag = git tag -l $TargetVersion
if (-not $ExistingTag) {
    # Note: Obsidian community plugins require EXACT tag match (NO leading 'v')
    git tag $TargetVersion
    Write-Success "Created git tag: $TargetVersion"
} else {
    Write-Host "Git tag '$TargetVersion' already exists." -ForegroundColor Yellow
}

Write-Step "Pushing commits and tag '$TargetVersion' to GitHub..."
$ErrorActionPreference = 'Continue'
git push origin HEAD
git push origin $TargetVersion
$ErrorActionPreference = 'Stop'

Write-Success "Pushed code and tag '$TargetVersion' to GitHub!"

# -------------------------------------------------------------------------
# Step 5: Create/Update GitHub Release
# -------------------------------------------------------------------------
Write-Step "Creating/updating GitHub Release '$TargetVersion' with attached assets..."

$ErrorActionPreference = 'Continue'
$ReleaseExists = $false
gh release view $TargetVersion --repo $RepoPath 2>$null
if ($LASTEXITCODE -eq 0) {
    $ReleaseExists = $true
}

if ($ReleaseExists) {
    gh release upload $TargetVersion main.js manifest.json styles.css --repo $RepoPath --clobber
    Write-Success "GitHub Release '$TargetVersion' updated with fresh build assets!"
} else {
    gh release create $TargetVersion main.js manifest.json styles.css --repo $RepoPath --title "$TargetVersion" --notes "Release $TargetVersion of $PluginName"
    Write-Success "GitHub Release '$TargetVersion' created successfully with main.js, manifest.json, styles.css!"
}
$ErrorActionPreference = 'Stop'

# -------------------------------------------------------------------------
# Step 6: Obsidian Community Directory Submission Instructions
# -------------------------------------------------------------------------
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "        GITHUB RELEASE $TargetVersion IS LIVE!           " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Release URL: https://github.com/$RepoPath/releases/tag/$TargetVersion" -ForegroundColor Yellow
Write-Host "Assets:      main.js, manifest.json, styles.css" -ForegroundColor White
Write-Host ""
Write-Host "FINAL STEP: Submit to Obsidian Community Directory" -ForegroundColor Cyan
Write-Host "1. Opening https://community.obsidian.md in your browser..." -ForegroundColor White
Write-Host "2. Sign in with your Obsidian account & link your GitHub account ($RepoPath)" -ForegroundColor White
Write-Host "3. Click 'Plugins' -> 'New plugin'" -ForegroundColor White
Write-Host "4. Paste your repo URL: https://github.com/$RepoPath" -ForegroundColor Green
Write-Host "5. Click 'Submit'!" -ForegroundColor White
Write-Host "======================================================`n" -ForegroundColor Cyan

Start-Process "https://community.obsidian.md"

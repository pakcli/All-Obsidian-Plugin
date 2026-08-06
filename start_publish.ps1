# start_publish.ps1
# Complete release and publication automation script for PakCLI Editor's Choice Obsidian plugin.

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

if (-not (Test-Path "manifest.json")) {
    Write-Err "manifest.json not found in current directory!"
    exit 1
}

# Parse current version from manifest.json
$ManifestContent = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$CurrentVersion = $ManifestContent.version
$PluginId = $ManifestContent.id
$PluginName = $ManifestContent.name

Write-Host "Plugin Name:     $PluginName" -ForegroundColor White
Write-Host "Plugin ID:       $PluginId" -ForegroundColor White
Write-Host "Current Version: $CurrentVersion" -ForegroundColor Yellow

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
# Step 3: Production Build & Validation
# -------------------------------------------------------------------------
Write-Step "Running production build (npm run build)..."

$BuildOutput = npm run build
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
Write-Success "Build completed successfully! All release artifacts present (main.js, manifest.json, styles.css)."

# -------------------------------------------------------------------------
# Step 4: Package Release Artifacts locally
# -------------------------------------------------------------------------
$DistReleaseDir = Join-Path $PSScriptRoot "dist_release"
if (!(Test-Path $DistReleaseDir)) {
    New-Item -ItemType Directory -Path $DistReleaseDir | Out-Null
}

Copy-Item "main.js" -Destination $DistReleaseDir -Force
Copy-Item "manifest.json" -Destination $DistReleaseDir -Force
Copy-Item "styles.css" -Destination $DistReleaseDir -Force

Write-Success "Local release bundle copied to: $DistReleaseDir"

# -------------------------------------------------------------------------
# Step 5: Git Commit & Tagging (No 'v' prefix for Obsidian compatibility)
# -------------------------------------------------------------------------
Write-Step "Git Tagging and Remote Push..."

$GitStatus = git status --porcelain
if ($GitStatus) {
    Write-Host "Uncommitted changes detected:" -ForegroundColor Yellow
    git status -s

    $CommitConfirm = Read-Host "`nDo you want to commit these changes and tag release '$TargetVersion'? (y/n) [Default: y]"
    if ([string]::IsNullOrWhiteSpace($CommitConfirm) -or $CommitConfirm.ToLower() -eq "y") {
        git add .
        git commit -m "Release $TargetVersion"
        Write-Success "Committed changes with message 'Release $TargetVersion'"
    }
}

# Check if git tag exists
$ExistingTag = git tag -l $TargetVersion
if ($ExistingTag) {
    Write-Warn "Git tag '$TargetVersion' already exists locally."
} else {
    $TagConfirm = Read-Host "Create git tag '$TargetVersion'? (y/n) [Default: y]"
    if ([string]::IsNullOrWhiteSpace($TagConfirm) -or $TagConfirm.ToLower() -eq "y") {
        # Note: Obsidian community plugins require EXACT tag match (NO leading 'v')
        git tag $TargetVersion
        Write-Success "Created git tag: $TargetVersion (exact match without 'v' prefix)"
    }
}

# Ask to push to remote
$PushConfirm = Read-Host "Push commit and tags to git remote (git push && git push --tags)? (y/n) [Default: y]"
if ([string]::IsNullOrWhiteSpace($PushConfirm) -or $PushConfirm.ToLower() -eq "y") {
    try {
        git push
        git push --tags
        Write-Success "Pushed commits and tag '$TargetVersion' to remote repository!"
    } catch {
        Write-Warn "Failed to push to git remote. Make sure remote is configured."
    }
}

# -------------------------------------------------------------------------
# Step 6: GitHub Release (Automated if gh CLI is available)
# -------------------------------------------------------------------------
Write-Step "GitHub Release Creation..."

if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "GitHub CLI (gh) detected!" -ForegroundColor Green
    $GhReleaseConfirm = Read-Host "Automatically create GitHub release '$TargetVersion' with main.js, manifest.json, and styles.css? (y/n) [Default: y]"
    if ([string]::IsNullOrWhiteSpace($GhReleaseConfirm) -or $GhReleaseConfirm.ToLower() -eq "y") {
        try {
            gh release create $TargetVersion main.js manifest.json styles.css --title "$TargetVersion" --notes "Release $TargetVersion of $PluginName"
            Write-Success "Successfully created GitHub release '$TargetVersion' with all assets attached!"
        } catch {
            Write-Warn "gh release command returned warning/error (release may already exist)."
        }
    }
} else {
    Write-Warn "GitHub CLI (gh) is not installed."
    Write-Host "Manual GitHub Release Steps:" -ForegroundColor Yellow
    Write-Host "  1. Go to your GitHub repository -> Releases -> Draft a new release" -ForegroundColor White
    Write-Host "  2. Choose tag: '$TargetVersion' (Must NOT start with 'v')" -ForegroundColor White
    Write-Host "  3. Drag & drop the 3 files from '$DistReleaseDir':" -ForegroundColor White
    Write-Host "     - main.js" -ForegroundColor White
    Write-Host "     - manifest.json" -ForegroundColor White
    Write-Host "     - styles.css" -ForegroundColor White
    Write-Host "  4. Publish the release!" -ForegroundColor White
}

# -------------------------------------------------------------------------
# Step 7: Final Summary & Obsidian Community Directory Submission Info
# -------------------------------------------------------------------------
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "               RELEASE PROCESS COMPLETE              " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Version:           $TargetVersion" -ForegroundColor White
Write-Host "Release Artifacts: main.js, manifest.json, styles.css" -ForegroundColor White
Write-Host "Dist Release Dir:  $DistReleaseDir" -ForegroundColor White
Write-Host ""
Write-Host "Obsidian Community Plugin Directory Submission:" -ForegroundColor Cyan
Write-Host "  If this is your first time submitting to the browsable Community Plugin catalog:" -ForegroundColor White
Write-Host "  1. Fork https://github.com/obsidianmd/obsidian-releases" -ForegroundColor White
Write-Host "  2. Edit 'community-plugins.json' to add:" -ForegroundColor White
Write-Host "     {" -ForegroundColor Gray
Write-Host "       `"id`": `"$PluginId`"," -ForegroundColor Gray
Write-Host "       `"name`": `"$PluginName`"," -ForegroundColor Gray
Write-Host "       `"author`": `"$($ManifestContent.author)`"," -ForegroundColor Gray
Write-Host "       `"description`": `"$($ManifestContent.description)`"," -ForegroundColor Gray
Write-Host "       `"repo`": `"YOUR_GITHUB_USER/$PluginId`"" -ForegroundColor Gray
Write-Host "     }" -ForegroundColor Gray
Write-Host "  3. Submit a Pull Request to obsidianmd/obsidian-releases!" -ForegroundColor White
Write-Host "======================================================`n" -ForegroundColor Cyan

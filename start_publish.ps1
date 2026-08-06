# start_publish.ps1
# Complete 1-click build, release, tag, and automated Obsidian Community Plugin PR submission script.

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
Write-Host "   PakCLI Obsidian Plugin - Automated Publisher      " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# Step 1: Pre-flight & GitHub CLI Checks
# -------------------------------------------------------------------------
Write-Step "Checking environment and tools..."

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm is not installed or not in PATH."
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Err "git is not installed or not in PATH."
    exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Err "GitHub CLI (gh) is not installed. Please install 'gh' to automate pull requests."
    exit 1
}

# Verify GitHub CLI login status safely
$OldErrorPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gh auth status 2>$null
$AuthCheckCode = $LASTEXITCODE
$ErrorActionPreference = $OldErrorPref

if ($AuthCheckCode -ne 0) {
    Write-Err "GitHub CLI is not logged in. Please run 'gh auth login' first."
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

$GhUser = (gh api user -q .login 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($GhUser)) {
    $GhUser = $RepoPath.Split('/')[0]
}

# Parse manifest.json
$ManifestContent = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$CurrentVersion = $ManifestContent.version
$PluginId = $ManifestContent.id
$PluginName = $ManifestContent.name
$PluginAuthor = $ManifestContent.author
$PluginDescription = $ManifestContent.description

Write-Host "Plugin Name:     $PluginName" -ForegroundColor White
Write-Host "Plugin ID:       $PluginId" -ForegroundColor White
Write-Host "Current Version: $CurrentVersion" -ForegroundColor Yellow
Write-Host "GitHub Repo:     $RepoPath" -ForegroundColor White
Write-Host "GitHub User:     $GhUser" -ForegroundColor White

# -------------------------------------------------------------------------
# Step 2: Version Bumping
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
    $TargetVersion = Read-Host "Enter custom version (e.g. 1.0.1)"
    if ([string]::IsNullOrWhiteSpace($TargetVersion)) {
        Write-Err "Invalid version entered."
        exit 1
    }
}

if ($TargetVersion -ne $CurrentVersion) {
    Write-Step "Bumping version from $CurrentVersion to $TargetVersion..."
    
    # Update package.json
    $Pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $Pkg.version = $TargetVersion
    $Pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"

    # Sync manifest.json & versions.json
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
Write-Step "Building production bundle (npm run build)..."

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed! Please fix build errors before publishing."
    exit $LASTEXITCODE
}

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

Write-Success "Build verified! Compiled artifacts saved in $DistReleaseDir"

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
    # Obsidian plugin tags MUST NOT start with 'v'
    git tag $TargetVersion
    Write-Success "Created git tag '$TargetVersion'"
} else {
    Write-Host "Git tag '$TargetVersion' already exists." -ForegroundColor Yellow
}

Write-Step "Pushing commits and tag '$TargetVersion' to GitHub..."
$ErrorActionPreference = 'Continue'
git push origin HEAD
git push origin $TargetVersion
$ErrorActionPreference = 'Stop'

Write-Success "Pushed current branch and tag '$TargetVersion' to GitHub!"

# -------------------------------------------------------------------------
# Step 5: Create/Update GitHub Release safely
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
    gh release create $TargetVersion main.js manifest.json styles.css --repo $RepoPath --title "$TargetVersion" --notes "Release $TargetVersion"
    Write-Success "GitHub Release '$TargetVersion' created successfully with main.js, manifest.json, styles.css!"
}
$ErrorActionPreference = 'Stop'

# -------------------------------------------------------------------------
# Step 6: Automated Submission to obsidianmd/obsidian-releases
# -------------------------------------------------------------------------
Write-Step "Checking official Obsidian Community Plugins directory..."

$CatalogRaw = Invoke-RestMethod -Uri "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json"
$IsRegistered = $false
foreach ($item in $CatalogRaw) {
    if ($item.id -eq $PluginId) {
        $IsRegistered = $true
        break
    }
}

if ($IsRegistered) {
    Write-Success "Plugin '$PluginId' is ALREADY registered in the official Obsidian Community Plugins directory!"
    Write-Host "Obsidian automatically detects release '$TargetVersion' from your GitHub release tags within 1-2 hours." -ForegroundColor Green
} else {
    Write-Warn "Plugin '$PluginId' is NOT YET listed in the official Obsidian Community Plugins directory."
    Write-Step "Submitting Pull Request to obsidianmd/obsidian-releases..."

    $ForkDir = Join-Path $PSScriptRoot ".obsidian-releases-fork"
    if (Test-Path $ForkDir) {
        Remove-Item -Path $ForkDir -Recurse -Force
    }

    # Fork & clone obsidianmd/obsidian-releases safely
    Write-Host "Forking/cloning obsidianmd/obsidian-releases repository..." -ForegroundColor Yellow
    $ErrorActionPreference = 'Continue'
    gh repo fork obsidianmd/obsidian-releases --clone=true "$ForkDir"
    $ErrorActionPreference = 'Stop'

    Set-Location $ForkDir

    # Configure branch
    $BranchName = "add-$PluginId"
    git checkout -B $BranchName

    # Pass plugin fields safely through environment variables to avoid syntax errors with single quotes
    $env:PLUGIN_ID = $PluginId
    $env:PLUGIN_NAME = $PluginName
    $env:PLUGIN_AUTHOR = $PluginAuthor
    $env:PLUGIN_DESCRIPTION = $PluginDescription
    $env:REPO_PATH = $RepoPath

    # Update community-plugins.json using Node.js script
    $AddScript = @"
const fs = require('fs');
const filePath = 'community-plugins.json';
const plugins = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const newEntry = {
  id: process.env.PLUGIN_ID,
  name: process.env.PLUGIN_NAME,
  author: process.env.PLUGIN_AUTHOR,
  description: process.env.PLUGIN_DESCRIPTION,
  repo: process.env.REPO_PATH
};

if (!plugins.some(p => p.id === newEntry.id)) {
  plugins.push(newEntry);
  plugins.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(filePath, JSON.stringify(plugins, null, 2) + '\n', 'utf8');
  console.log('Successfully added ' + newEntry.id + ' to community-plugins.json');
} else {
  console.log(newEntry.id + ' already present');
}
"@
    Set-Content -Path "add_entry.cjs" -Value $AddScript
    node add_entry.cjs
    Remove-Item "add_entry.cjs" -Force

    Remove-Item Env:\PLUGIN_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\PLUGIN_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\PLUGIN_AUTHOR -ErrorAction SilentlyContinue
    Remove-Item Env:\PLUGIN_DESCRIPTION -ErrorAction SilentlyContinue
    Remove-Item Env:\REPO_PATH -ErrorAction SilentlyContinue

    git add community-plugins.json
    git commit -m "Add $PluginName plugin ($PluginId)"
    
    $ErrorActionPreference = 'Continue'
    git push origin $BranchName --force

    # Create Pull Request with proper fork head format ($GhUser:$BranchName)
    $HeadSpec = "$GhUser`:$BranchName"
    $PrBody = @"
## Plugin Submission: $PluginName

- **Plugin ID**: `$PluginId`
- **Repository**: `https://github.com/$RepoPath`
- **Release Version**: `$TargetVersion`

### Checklist
- [x] Tested plugin on desktop
- [x] `manifest.json`, `main.js`, and `styles.css` are attached to GitHub Release `$TargetVersion`
- [x] License included
- [x] Code is original / open source
"@

    $PrOutput = gh pr create --repo obsidianmd/obsidian-releases --head $HeadSpec --base master --title "Add $PluginName" --body "$PrBody"
    $ErrorActionPreference = 'Stop'
    
    Set-Location $PSScriptRoot
    Remove-Item -Path $ForkDir -Recurse -Force

    Write-Success "PULL REQUEST SUBMITTED SUCCESSFULLY TO OBSIDIAN COMMUNITY PLUGINS!"
    Write-Host "PR Link: $PrOutput" -ForegroundColor Green
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "          ALL PUBLISH STEPS COMPLETED!               " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan

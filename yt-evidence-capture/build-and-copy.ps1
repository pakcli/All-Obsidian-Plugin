# ============================================================
#  YT Evidence Capture — Build & Install to Vault
#  Run this to deploy the plugin to your Obsidian vault.
#  Usage: Right-click → "Run with PowerShell"
#         or: powershell -ExecutionPolicy Bypass -File build-and-copy.ps1
# ============================================================

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  YT Evidence Capture — Build & Install   " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta

# ── Step 1: Build ─────────────────────────────────────────────────────────────

Write-Host "`nBuilding plugin..." -ForegroundColor Cyan
Set-Location $PSScriptRoot

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Aborting." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "  ✓ Build successful" -ForegroundColor Green

# ── Step 2: Find or ask for vault path ────────────────────────────────────────

$ConfigPath = Join-Path $PSScriptRoot ".vaultpath"
$SavedPath  = $null

# Check if we already have a saved path
if (Test-Path $ConfigPath) {
    $SavedPath = (Get-Content $ConfigPath -TotalCount 1).Trim()
}

# If not, try to derive from PakCLI Suite's .vaultpath (sibling plugin)
if ([string]::IsNullOrWhiteSpace($SavedPath)) {
    $pakCliVaultPath = Join-Path $PSScriptRoot "..\\.vaultpath"
    if (Test-Path $pakCliVaultPath) {
        $pakPath = (Get-Content $pakCliVaultPath -TotalCount 1).Trim()
        if ($pakPath) {
            # Derive vault plugins folder from PakCLI's plugin path, then add our plugin ID
            $pluginsFolder = Split-Path $pakPath -Parent
            $derived = Join-Path $pluginsFolder "yt-evidence-capture"
            Write-Host "`n  Auto-detected vault from PakCLI Suite: $derived" -ForegroundColor Yellow
            $SavedPath = $derived
        }
    }
}

# ── Step 3: Prompt user ───────────────────────────────────────────────────────

Write-Host ""
if ($SavedPath) {
    $prompt = "Vault plugin path [Enter to use: $SavedPath]"
    $input  = Read-Host -Prompt $prompt
    $VaultPath = if ([string]::IsNullOrWhiteSpace($input)) { $SavedPath } else { $input.Trim() }
} else {
    Write-Host "  Where is your Obsidian vault's plugin folder?" -ForegroundColor Yellow
    Write-Host "  Example: C:\Users\you\Documents\MyVault\.obsidian\plugins\yt-evidence-capture" -ForegroundColor Gray
    $VaultPath = (Read-Host -Prompt "  Vault plugin path").Trim()
}

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
    Write-Host "  No path entered. Aborting." -ForegroundColor Red
    exit 0
}

# ── Step 4: Save path for next time ──────────────────────────────────────────

Set-Content -Path $ConfigPath -Value $VaultPath
Write-Host "  ✓ Path saved to .vaultpath" -ForegroundColor Green

# ── Step 5: Create folder and copy files ─────────────────────────────────────

if (!(Test-Path $VaultPath)) {
    New-Item -ItemType Directory -Force -Path $VaultPath | Out-Null
    Write-Host "  ✓ Created plugin folder" -ForegroundColor Green
}

Copy-Item -Path "main.js"       -Destination $VaultPath -Force
Copy-Item -Path "manifest.json" -Destination $VaultPath -Force
Copy-Item -Path "styles.css"    -Destination $VaultPath -Force

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  ✅ Installed to vault!" -ForegroundColor Green
Write-Host "  $VaultPath" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Reload Obsidian (Ctrl+R or restart)" -ForegroundColor Gray
Write-Host "  2. Settings → Community plugins → Enable YT Evidence Capture" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

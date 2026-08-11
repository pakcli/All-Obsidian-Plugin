# ============================================================
#  YT Evidence Capture — Setup Script
#  Run this once before using the plugin.
#  Usage: Right-click → "Run with PowerShell"
#         or: powershell -ExecutionPolicy Bypass -File start.ps1
# ============================================================

$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "`n[$msg]" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  YT Evidence Capture — Dependency Setup  " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta

# ── STEP 1: Internet ──────────────────────────────────────────────────────────
Write-Step "1/4  Checking internet connection"

$internetOk = $false
try {
    $null = Invoke-WebRequest -Uri "https://www.google.com" -UseBasicParsing -TimeoutSec 5
    $internetOk = $true
    Write-Ok "Internet is reachable"
} catch {
    Write-Fail "No internet connection detected. Please connect and re-run."
    exit 1
}

# ── STEP 2: winget ────────────────────────────────────────────────────────────
Write-Step "2/4  Checking winget (Windows Package Manager)"

$wingetOk = $false
try {
    $wgVersion = (winget --version 2>&1)
    $wingetOk = $true
    Write-Ok "winget found: $wgVersion"
} catch {
    Write-Warn "winget not found."
    Write-Host "     winget comes with Windows 11 and Windows 10 (1709+)." -ForegroundColor Gray
    Write-Host "     Get it from: https://aka.ms/getwinget" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Alternatively, install manually:" -ForegroundColor Yellow
    Write-Host "    yt-dlp  → https://github.com/yt-dlp/yt-dlp/releases" -ForegroundColor Gray
    Write-Host "    ffmpeg  → https://ffmpeg.org/download.html" -ForegroundColor Gray
    exit 1
}

# ── STEP 3: yt-dlp ───────────────────────────────────────────────────────────
Write-Step "3/4  Checking yt-dlp"

$ytdlpOk = $false
try {
    $v = (yt-dlp --version 2>&1)
    $ytdlpOk = $true
    Write-Ok "yt-dlp already installed: $v"
} catch {
    Write-Warn "yt-dlp not found — installing via winget..."
    try {
        winget install --id yt-dlp.yt-dlp -e --accept-source-agreements --accept-package-agreements
        Write-Ok "yt-dlp installed successfully"
        $ytdlpOk = $true
    } catch {
        Write-Fail "Could not install yt-dlp: $_"
    }
}

# ── STEP 4: ffmpeg ────────────────────────────────────────────────────────────
Write-Step "4/4  Checking ffmpeg"

$ffmpegOk = $false
try {
    $v = (ffmpeg -version 2>&1 | Select-Object -First 1)
    $ffmpegOk = $true
    Write-Ok "ffmpeg already installed: $($v.ToString().Trim())"
} catch {
    Write-Warn "ffmpeg not found — installing via winget..."
    try {
        winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
        Write-Ok "ffmpeg installed successfully"
        $ffmpegOk = $true
    } catch {
        Write-Fail "Could not install ffmpeg: $_"
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Summary" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta

$allOk = $internetOk -and $ytdlpOk -and $ffmpegOk

if ($internetOk) { Write-Ok "Internet" } else { Write-Fail "Internet" }
if ($ytdlpOk)    { Write-Ok "yt-dlp"  } else { Write-Fail "yt-dlp — install manually from https://github.com/yt-dlp/yt-dlp/releases" }
if ($ffmpegOk)   { Write-Ok "ffmpeg"  } else { Write-Fail "ffmpeg — install manually from https://ffmpeg.org/download.html" }

Write-Host ""

if ($allOk) {
    Write-Host "  ✅ All dependencies ready!" -ForegroundColor Green
    Write-Host "  → Restart Obsidian, then enable YT Evidence Capture in Community Plugins." -ForegroundColor Gray
} else {
    Write-Host "  ❌ Some dependencies are missing. Fix the errors above and re-run this script." -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

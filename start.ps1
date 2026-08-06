# start.ps1
# Script to build PakCLI Obsidian Plugin and deploy artifacts with history selection.

$PSScriptRootPath = $PSScriptRoot
$ConfigPath = Join-Path $PSScriptRootPath ".vaultpath"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Building PakCLI Editor's Choice Plugin " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Run npm run build
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed with code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Read history from .vaultpath
$History = @()
if (Test-Path -Path $ConfigPath) {
    $RawLines = Get-Content -Path $ConfigPath
    foreach ($line in $RawLines) {
        $trimmed = $line.Trim()
        if (![string]::IsNullOrWhiteSpace($trimmed) -and ($History -notcontains $trimmed)) {
            $History += $trimmed
        }
    }
}

Write-Host ""
Write-Host "Select deployment destination:" -ForegroundColor Yellow

if ($History.Count -gt 0) {
    Write-Host "  [-1] Build only (do not copy)" -ForegroundColor Gray
    Write-Host "  [ 0] Use latest path: $($History[0])" -ForegroundColor Green
    for ($i = 0; $i -lt $History.Count; $i++) {
        $num = $i + 1
        Write-Host "  [$num] $($History[$i])" -ForegroundColor White
    }
} else {
    Write-Host "  [-1] Build only (do not copy)" -ForegroundColor Gray
    Write-Host "  (No saved history paths found)" -ForegroundColor Gray
}

Write-Host ""
$PromptText = if ($History.Count -gt 0) { "Enter option (-1, 0, 1..$($History.Count)) or a custom folder path [Default: 0]: " } else { "Enter option (-1) or a custom folder path: " }
$Selection = Read-Host -Prompt $PromptText
$Selection = $Selection.Trim()

$SelectedPath = $null

if ([string]::IsNullOrWhiteSpace($Selection) -or $Selection -eq "0") {
    if ($History.Count -gt 0) {
        $SelectedPath = $History[0]
    } else {
        Write-Host "No history available. Skipping copy." -ForegroundColor Yellow
    }
} elseif ($Selection -eq "-1") {
    Write-Host "Build complete. (Build only - skipped copy as requested)" -ForegroundColor Yellow
    exit 0
} elseif ($Selection -match '^\d+$') {
    $idx = [int]$Selection - 1
    if ($idx -ge 0 -and $idx -lt $History.Count) {
        $SelectedPath = $History[$idx]
    } else {
        Write-Host "Invalid option number. Skipping copy." -ForegroundColor Red
        exit 1
    }
} else {
    # Custom directory entered
    $SelectedPath = $Selection
}

if (![string]::IsNullOrWhiteSpace($SelectedPath)) {
    # Move selected path to top of history and save
    $NewHistory = @($SelectedPath)
    foreach ($h in $History) {
        if ($h -ne $SelectedPath) {
            $NewHistory += $h
        }
    }
    Set-Content -Path $ConfigPath -Value $NewHistory

    if (!(Test-Path -Path $SelectedPath)) {
        Write-Host "Creating target folder: $SelectedPath" -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path $SelectedPath | Out-Null
    }

    Write-Host "Copying build artifacts to: $SelectedPath" -ForegroundColor Green
    Copy-Item -Path "main.js" -Destination $SelectedPath -Force
    Copy-Item -Path "manifest.json" -Destination $SelectedPath -Force
    if (Test-Path -Path "styles.css") {
        Copy-Item -Path "styles.css" -Destination $SelectedPath -Force
    }

    Write-Host "Successfully built and deployed plugin to: $SelectedPath" -ForegroundColor Green
}

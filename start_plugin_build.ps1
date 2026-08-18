# start.ps1
# Builds PakCLI Suite and interactively deploys artifacts to target Obsidian vault.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$TargetFolder = "",
    [switch]$BuildOnly
)

$PSScriptRootPath = $PSScriptRoot
$ConfigPath = Join-Path $PSScriptRootPath ".vaultpath"
$ManifestPath = Join-Path $PSScriptRootPath "manifest.json"

$PluginId = "pakcli-suite"
if (Test-Path -Path $ManifestPath) {
    try {
        $manifestJson = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
        if ($manifestJson.id) { $PluginId = $manifestJson.id }
    } catch {}
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "        Building PakCLI Suite           " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Run npm run build
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Error: Build failed with code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

if ($BuildOnly) {
    Write-Host ""
    Write-Host "Build complete. (Build-only requested)" -ForegroundColor Yellow
    exit 0
}

# 2. Read history from .vaultpath
$History = @()
if (Test-Path -Path $ConfigPath) {
    $RawLines = Get-Content -Path $ConfigPath
    foreach ($line in $RawLines) {
        $trimmed = $line.Trim().Trim('"' + "'" + [char]13 + [char]10)
        if ($trimmed -match '\\\.obsidian\\plugins\\master$') {
            $trimmed = $trimmed -replace '\\master$', "\$PluginId"
        }
        if (![string]::IsNullOrWhiteSpace($trimmed) -and ($History -notcontains $trimmed)) {
            $History += $trimmed
        }
    }
}

$SelectedPath = $null

# If TargetFolder parameter is passed directly via command line
if (![string]::IsNullOrWhiteSpace($TargetFolder)) {
    $SelectedPath = $TargetFolder.Trim().Trim('"' + "'" + [char]13 + [char]10)
} else {
    Write-Host ""
    Write-Host "Select deployment destination:" -ForegroundColor Yellow
    
    if ($History.Count -gt 0) {
        Write-Host "  [-1] Build only (do not copy)" -ForegroundColor Gray
        Write-Host "  [ 0] Use latest: $($History[0])" -ForegroundColor Green
        for ($i = 0; $i -lt $History.Count; $i++) {
            $num = $i + 1
            Write-Host "  [$num] $($History[$i])" -ForegroundColor White
        }
    } else {
        Write-Host "  [-1] Build only (do not copy)" -ForegroundColor Gray
        Write-Host "  (No saved vault paths found)" -ForegroundColor Gray
    }

    Write-Host ""
    $PromptText = if ($History.Count -gt 0) { "Enter option (-1, 0, 1..$($History.Count)) or custom path [Default: 0]: " } else { "Enter option (-1) or custom folder path: " }
    $Selection = Read-Host -Prompt $PromptText
    $Selection = if ($Selection) { $Selection.Trim() } else { "" }

    if ([string]::IsNullOrWhiteSpace($Selection) -or $Selection -eq "0") {
        if ($History.Count -gt 0) {
            $SelectedPath = $History[0]
        } else {
            Write-Host "No history available. Skipping copy." -ForegroundColor Yellow
        }
    } elseif ($Selection -eq "-1") {
        Write-Host "Build complete. (Skipped copy as requested)" -ForegroundColor Yellow
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
        $SelectedPath = $Selection.Trim('"' + "'" + [char]13 + [char]10)
    }
}

if (![string]::IsNullOrWhiteSpace($SelectedPath)) {
    # If user provided parent plugins folder, append plugin id
    if ($SelectedPath -match '\\\.obsidian\\plugins$' -or $SelectedPath -match '/\.obsidian/plugins$') {
        $SelectedPath = Join-Path $SelectedPath $PluginId
    }

    # Save to history
    $NewHistory = @($SelectedPath)
    foreach ($h in $History) {
        if ($h -ne $SelectedPath) {
            $NewHistory += $h
        }
    }
    Set-Content -Path $ConfigPath -Value $NewHistory -Encoding UTF8

    if (!(Test-Path -Path $SelectedPath)) {
        Write-Host "Creating target folder: $SelectedPath" -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path $SelectedPath | Out-Null
    }

    Write-Host ""
    Write-Host "Deploying build artifacts..." -ForegroundColor Cyan
    Copy-Item -Path (Join-Path $PSScriptRootPath "main.js") -Destination $SelectedPath -Force
    Copy-Item -Path (Join-Path $PSScriptRootPath "manifest.json") -Destination $SelectedPath -Force
    if (Test-Path -Path (Join-Path $PSScriptRootPath "styles.css")) {
        Copy-Item -Path (Join-Path $PSScriptRootPath "styles.css") -Destination $SelectedPath -Force
    }

    $mainJsDest = Join-Path $SelectedPath "main.js"
    if (Test-Path -Path $mainJsDest) {
        $mainSize = (Get-Item $mainJsDest).Length / 1MB
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ("DEPLOYED TO: {0}" -f $SelectedPath) -ForegroundColor Green
        Write-Host ("main.js ({0:N2} MB) | manifest.json | styles.css" -f $mainSize) -ForegroundColor Green
        Write-Host "Please reload Obsidian (Ctrl+R / Cmd+R) now!" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Green
    }
} else {
    Write-Host "Warning: No destination path selected." -ForegroundColor Yellow
}



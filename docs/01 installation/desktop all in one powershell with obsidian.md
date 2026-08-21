---
title: "Desktop All in One PowerShell with Obsidian"
---

# Desktop Installation: PowerShell (Obsidian Already Installed)

Automated interactive  script for users who already have **** installed on their Windows .

---

## ⚡ Interactive PowerShell Installation Script

Open PowerShell and run:

```powershell
# PakCLI Suite - Interactive Plugin Installer (Obsidian already installed)
Write-Host "=== PakCLI Suite Installer ===" -ForegroundColor Cyan
Write-Host ""

# Ask for vault directory
Write-Host "Target vault directory:" -ForegroundColor Yellow
Write-Host "  Press [Enter] to use current directory: $(Get-Location)"
Write-Host "  Or type a custom path (e.g. C:\Users\You\Documents\MyVault)"
$input = Read-Host "Vault path"

if ([string]::IsNullOrWhiteSpace($input)) {
    $vaultPath = (Get-Location).Path
    Write-Host "Using current directory: $vaultPath" -ForegroundColor Green
} else {
    $vaultPath = $input
    New-Item -ItemType Directory -Force -Path $vaultPath | Out-Null
    Write-Host "Using custom directory: $vaultPath" -ForegroundColor Green
}

# Install plugin
$pluginDir = "$vaultPath\.obsidian\plugins\pakcli-suite"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null

Write-Host ""
Write-Host "Downloading PakCLI Suite..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://github.com/pakcli/All-Obsidian-Plugin/releases/latest/download/main.js" -OutFile "$pluginDir\main.js"
Invoke-WebRequest -Uri "https://github.com/pakcli/All-Obsidian-Plugin/releases/latest/download/manifest.json" -OutFile "$pluginDir\manifest.json"

Write-Host ""
Write-Host "PakCLI Suite installed at: $pluginDir" -ForegroundColor Green
Write-Host "Next: Open Obsidian -> Settings -> Community plugins -> Enable PakCLI Suite" -ForegroundColor Yellow
```

---

## 🛠️ Next Steps

1. Open **** and open the vault folder you selected.
2. Go to **Settings** -> ** ** -> **Reload plugins** -> Enable **PakCLI Suite**.

---
title: "Desktop All in One PowerShell Winget without Obsidian"
---

# Desktop Installation: PowerShell & Winget (Without Obsidian Installed)

Automated interactive [[powershell|PowerShell]] and [[winget|winget]] installer for new Windows [[computer|computers]] that do not have **[[obsidian|Obsidian]]** installed yet.

---

## ⚡ Interactive PowerShell & Winget Installer Script

Open PowerShell as Administrator and run:

```powershell
# PakCLI Suite - Interactive Full Installer (installs Obsidian + plugin)
Write-Host "=== PakCLI Suite Full Installer (via winget) ===" -ForegroundColor Cyan

# Step 1: Install Obsidian via winget
Write-Host ""
Write-Host "Step 1: Installing Obsidian via winget..." -ForegroundColor Yellow
winget install --id Obsidian.Obsidian -e --silent
Write-Host "Obsidian installed." -ForegroundColor Green

# Step 2: Ask for vault directory
Write-Host ""
Write-Host "Step 2: Target vault directory" -ForegroundColor Yellow
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

# Step 3: Install PakCLI Suite plugin
Write-Host ""
Write-Host "Step 3: Installing PakCLI Suite plugin..." -ForegroundColor Yellow
$pluginDir = "$vaultPath\.obsidian\plugins\pakcli-suite"
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null

Invoke-WebRequest -Uri "https://github.com/pakcli/All-Obsidian-Plugin/releases/latest/download/main.js" -OutFile "$pluginDir\main.js"
Invoke-WebRequest -Uri "https://github.com/pakcli/All-Obsidian-Plugin/releases/latest/download/manifest.json" -OutFile "$pluginDir\manifest.json"

Write-Host ""
Write-Host "All done! PakCLI Suite installed at: $pluginDir" -ForegroundColor Green
Write-Host "Next: Open Obsidian -> Open vault '$vaultPath' -> Settings -> Community plugins -> Enable PakCLI Suite" -ForegroundColor Yellow
```

---

## 🛠️ Next Steps

1. Launch **[[obsidian|Obsidian]]** and open the vault folder you selected above.
2. Go to **Settings** -> **[[community|Community]] [[plugin|plugins]]** -> **Reload plugins** -> Enable **PakCLI Suite**.

# build-and-copy.ps1
# This script builds the plugin and copies the compiled assets to your Obsidian vault's plugin directory.

# 1. Run the build process
Write-Output "Building PakCLI Editor's Choice..."
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed. Aborting copy."
    exit $LASTEXITCODE
}

# 2. Retrieve previous path if saved
$ConfigPath = Join-Path $PSScriptRoot ".vaultpath"
$SavedPath = $null
if (Test-Path -Path $ConfigPath) {
    $SavedPath = Get-Content -Path $ConfigPath -TotalCount 1
}

# 3. Prompt user for path
if ($SavedPath) {
    $PromptMessage = "Enter the absolute path to copy files to [Default: $SavedPath]"
    $InputPath = Read-Host -Prompt $PromptMessage
    if ([string]::IsNullOrWhiteSpace($InputPath)) {
        $VaultPath = $SavedPath
    } else {
        $VaultPath = $InputPath
    }
} else {
    $VaultPath = Read-Host -Prompt "Enter the absolute target path to copy files to (e.g. C:\vault\.obsidian\plugins\pakcli-editors-choice)"
}

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
    Write-Warning "No target path entered. Aborting copy."
    exit 0
}

# 4. Save path for next time
$VaultPath = $VaultPath.Trim()
Set-Content -Path $ConfigPath -Value $VaultPath

# 5. Create directory if it doesn't exist
if (!(Test-Path -Path $VaultPath)) {
    Write-Output "Creating directory: $VaultPath"
    New-Item -ItemType Directory -Force -Path $VaultPath | Out-Null
}

# 6. Copy the compiled artifacts
Write-Output "Copying build artifacts to $VaultPath..."
Copy-Item -Path "main.js" -Destination $VaultPath -Force
Copy-Item -Path "manifest.json" -Destination $VaultPath -Force
Copy-Item -Path "styles.css" -Destination $VaultPath -Force

Write-Output "Successfully copied artifacts! Reload the plugin in Obsidian to see changes."

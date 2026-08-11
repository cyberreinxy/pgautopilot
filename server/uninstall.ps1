param()

$ErrorActionPreference = "Stop"
$InstallDir = "$env:LOCALAPPDATA\pgautopilot"
$BinDir = "$InstallDir\bin"
$Launcher = "$BinDir\pgautopilot.cmd"

Write-Host "PGAutoPilot — Uninstall" -ForegroundColor Cyan
Write-Host ""

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")

if (-not (Test-Path $InstallDir)) {
    Write-Host "PGAutoPilot is not installed at $InstallDir." -ForegroundColor Yellow
    if ($userPath -notlike "*$BinDir*") {
        Write-Host "Nothing to uninstall."
        exit 0
    }
    Write-Host "But leftover PATH entry found — cleaning up." -ForegroundColor Cyan
}

if (Test-Path $InstallDir) {
    Write-Host "Removing launcher: $Launcher"
    if (Test-Path $Launcher) {
        Remove-Item -Path $Launcher -Force
    }

    Write-Host "Removing installation directory: $InstallDir"
    Remove-Item -Path $InstallDir -Recurse -Force
}

if ($userPath -like "*$BinDir*") {
    Write-Host "Removing $BinDir from your user PATH..."
    $newPath = ($userPath -split ';' | Where-Object { $_.Trim() -ne $BinDir }) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = ($env:Path -split ';' | Where-Object { $_.Trim() -ne $BinDir }) -join ';'
    Write-Host "Removed $BinDir from PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "PGAutoPilot has been uninstalled successfully." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Close and reopen your terminal for PATH changes to take effect." -ForegroundColor Yellow

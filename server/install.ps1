param(
    [switch]$Update,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$InstallDir = "$env:LOCALAPPDATA\pgautopilot"
$BinDir = "$InstallDir\bin"
$Repo = "https://github.com/cyberreinxy/pgautopilot.git"
$BundleFile = "dist\pgautopilot.bundle.cjs"
$Launcher = "$BinDir\pgautopilot.cmd"

Write-Host "PGAutoPilot — Local Install (no npm)" -ForegroundColor Cyan
Write-Host ""

$nodeCmd = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeCmd) {
    $nodeCmd = (Get-Command node.exe -ErrorAction SilentlyContinue)?.Source
}
if (-not $nodeCmd) {
    Write-Host "Node.js is not installed." -ForegroundColor Red
    Write-Host "Install it from https://nodejs.org (v18+) and try again."
    exit 1
}

$nodeVer = & node -v
$major = [int]($nodeVer -replace 'v','' -replace '\..*','')
if ($major -lt 18) {
    Write-Host "Node.js 18+ required. You have $nodeVer." -ForegroundColor Red
    Write-Host "Upgrade at https://nodejs.org"
    exit 1
}

Write-Host "Node.js $nodeVer detected."

if (Test-Path $InstallDir) {
    Write-Host "Updating existing install at $InstallDir ..."
    Push-Location $InstallDir
    git pull --ff-only origin main 2>$null
    Pop-Location
} else {
    Write-Host "Cloning PGAutoPilot into $InstallDir ..."
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    git clone --depth 1 $Repo $InstallDir
}

$BundlePath = Join-Path $InstallDir $BundleFile
if (-not (Test-Path $BundlePath)) {
    Write-Host "Bundle not found at $BundlePath" -ForegroundColor Red
    Write-Host "The repository may be missing the pre-built bundle. Try:"
    Write-Host "  cd $InstallDir; npm install; npm run bundle"
    exit 1
}

if (-not $SkipVerify) {
    $ChecksumsFile = Join-Path $InstallDir "dist\checksums.txt"
    $SigFile = Join-Path $InstallDir "dist\checksums.txt.sig"
    if (Test-Path $ChecksumsFile) {
        Write-Host "Verifying software integrity..." -ForegroundColor Cyan
        $verified = $true
        $content = Get-Content $ChecksumsFile -Encoding utf8
        foreach ($line in $content) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $parts = $line -split '\s+', 2
            if ($parts.Count -lt 2) { continue }
            $expectedHash = $parts[0]
            $relPath = $parts[1]
            $targetFile = Join-Path $InstallDir $relPath
            if (-not (Test-Path $targetFile)) {
                Write-Host "  MISSING: $relPath" -ForegroundColor Red
                $verified = $false
                continue
            }
            $actualHash = (Get-FileHash $targetFile -Algorithm SHA256).Hash.ToLower()
            if ($actualHash -ne $expectedHash.ToLower()) {
                Write-Host "  HASH MISMATCH: $relPath" -ForegroundColor Red
                $verified = $false
            }
        }
        if (Test-Path $SigFile) {
            Write-Host "  GPG signature file found (verify separately: gpg --verify $SigFile $ChecksumsFile)" -ForegroundColor Cyan
        }
        if (-not $verified) {
            Write-Host "INTEGRITY CHECK FAILED. Software may be tampered with." -ForegroundColor Red
            Write-Host "Use -SkipVerify to bypass, or re-install from the official repository." -ForegroundColor Yellow
            exit 1
        }
        Write-Host "Integrity check passed." -ForegroundColor Green
    } else {
        Write-Host "Checksums not found at $ChecksumsFile — skipping verification." -ForegroundColor Yellow
        Write-Host "Run 'npm run verify' after install to check manually." -ForegroundColor Cyan
    }
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$cmdContent = @"
@echo off
node "$BundlePath" %*
"@

Set-Content -Path $Launcher -Value $cmdContent -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-Host "Added $BinDir to your user PATH."
}

Write-Host ""
Write-Host "PGAutoPilot installed successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Run it:  pgautopilot"
Write-Host "Or:      node $BundlePath"
Write-Host ""
Write-Host "Usage:   pgautopilot [--readonly] [--dev] [DATABASE_URL]"
Write-Host ""
Write-Host "Set DATABASE_URL in your environment:"
Write-Host '  setx DATABASE_URL "postgresql://user:pass@localhost:5432/mydb"'
Write-Host ""
Write-Host "Then configure your MCP client (Claude Desktop, Cursor, VS Code):"
Write-Host '  "pgautopilot": { "command": "pgautopilot" }'
Write-Host ""
Write-Host "Need a quick test database?" -ForegroundColor Cyan
Write-Host "  docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16-alpine"
Write-Host ""
Write-Host "IMPORTANT: Close and reopen your terminal for PATH changes to take effect." -ForegroundColor Yellow

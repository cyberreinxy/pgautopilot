@echo off
setlocal enabledelayedexpansion

echo PGAutoPilot — Local Install (no npm)
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed.
    echo Install it from https://nodejs.org (v18+^) and try again.
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
echo Node.js detected.

set "INSTALL_DIR=%LOCALAPPDATA%\pgautopilot"
set "BIN_DIR=%INSTALL_DIR%\bin"
set "BUNDLE=%INSTALL_DIR%\dist\pgautopilot.bundle.cjs"
set "LAUNCHER=%BIN_DIR%\pgautopilot.cmd"

if exist "%INSTALL_DIR%" (
    echo Updating existing install...
    cd /d "%INSTALL_DIR%"
    git pull --ff-only origin main 2>nul
) else (
    echo Cloning PGAutoPilot...
    git clone --depth 1 https://github.com/cyberreinxy/pgautopilot.git "%INSTALL_DIR%"
)

if not exist "%BUNDLE%" (
    echo Bundle not found at %BUNDLE%
    echo Try: cd /d "%INSTALL_DIR%" ^&^& npm install ^&^& npm run bundle
    exit /b 1
)

if /I not "%1"=="--skip-verify" (
    if exist "%INSTALL_DIR%\dist\checksums.txt" (
        echo Verifying software integrity...
        set "VERIFIED=1"
        for /f "usebackq tokens=1,*" %%a in ("%INSTALL_DIR%\dist\checksums.txt") do (
            if not "%%a"=="" (
                set "EXPECTED=%%a"
                set "FILE=%%b"
                for /f %%i in ('certutil -hashfile "%INSTALL_DIR%\%%b" SHA256 ^| find /v "SHA256" ^| find /v "CertUtil"') do (
                    if not "%%i"=="%%a" (
                        echo HASH MISMATCH: %%b
                        set "VERIFIED=0"
                    )
                )
            )
        )
        if exist "%INSTALL_DIR%\dist\checksums.txt.sig" (
            echo GPG signature file found. Verify: gpg --verify "%INSTALL_DIR%\dist\checksums.txt.sig" "%INSTALL_DIR%\dist\checksums.txt"
        )
        if "!VERIFIED!"=="0" (
            echo INTEGRITY CHECK FAILED. Software may be tampered with.
            echo Use --skip-verify to bypass, or re-install from the official repository.
            exit /b 1
        )
        echo Integrity check passed.
    ) else (
        echo Checksums not found -- skipping verification.
        echo Run 'npm run verify' after install to check manually.
    )
)

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

> "%LAUNCHER%" echo @echo off
>> "%LAUNCHER%" echo node "%BUNDLE%" %%*

echo.
echo PGAutoPilot installed.
echo.
echo Run it:  pgautopilot
echo Or:      node "%BUNDLE%"
echo.
echo Add %BIN_DIR% to your PATH to use 'pgautopilot' from anywhere.
echo Then configure your MCP client with command: pgautopilot
echo.
echo IMPORTANT: Restart your terminal after adding to PATH.

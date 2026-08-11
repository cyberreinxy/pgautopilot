@echo off
setlocal enabledelayedexpansion

echo PGAutoPilot — Uninstall
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\pgautopilot"
set "BIN_DIR=%INSTALL_DIR%\bin"
set "LAUNCHER=%BIN_DIR%\pgautopilot.cmd"

if not exist "%INSTALL_DIR%" (
    echo PGAutoPilot is not installed at %INSTALL_DIR%.
    echo Nothing to uninstall.
    exit /b 0
)

echo Removing launcher: %LAUNCHER%
if exist "%LAUNCHER%" del "%LAUNCHER%"

echo Removing installation directory: %INSTALL_DIR%
rmdir /s /q "%INSTALL_DIR%" 2>nul

echo.
echo PGAutoPilot has been uninstalled.
echo.
echo If you added %BIN_DIR% to your PATH, remove it manually:
echo   1. Open System Properties -^> Environment Variables
echo   2. Look for "%BIN_DIR%" in your User PATH variable
echo   3. Remove it and click OK
echo.
echo Restart your terminal for PATH changes to take effect.

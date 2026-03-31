@echo off
setlocal

cd /d "%~dp0"

echo ==================================================
echo         StreamLyrics Setup ^& Builder
echo ==================================================
echo.

:: Check Node.js
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js (npm) is not installed or not in PATH.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b
)

echo [INFO] Installing required dependencies...
call npm install

echo.
echo [INFO] Building the Chrome Extension...
call npm run build

echo.
echo ==================================================
echo               Build Successful!
echo ==================================================
echo.
echo You can now load this extension into Chrome:
echo 1. Go to chrome://extensions/
echo 2. Enable "Developer Mode" in the top right.
echo 3. Click "Load Unpacked".
echo 4. Select the "dist" folder inside this directory!
echo.
pause
exit

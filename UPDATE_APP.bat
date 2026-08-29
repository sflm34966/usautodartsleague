@echo off
setlocal
cd /d "%~dp0"
title US AutoDarts League - Android Update v0.7.27
color 0A

echo ==========================================================
echo   US AutoDarts League Android Update v0.7.27
echo   One-click OTA update for installed v0.7.25-runtime APKs
echo ==========================================================
echo.
where node >nul 2>nul || (echo ERROR: Node.js is not installed.& pause& exit /b 1)
where npm.cmd >nul 2>nul || (echo ERROR: npm is not available.& pause& exit /b 1)

echo [1/3] Installing project packages...
call npm.cmd install
if errorlevel 1 goto :fail

echo.
echo [2/3] Building Android OTA update...
if exist ota-dist rmdir /s /q ota-dist
call npx.cmd expo export --platform android --output-dir ota-dist --clear
if errorlevel 1 goto :fail

echo.
echo [3/3] Publishing update to the running USADL Server Manager...
call node.exe publish-ota-update.js
if errorlevel 1 goto :fail

echo.
echo ==========================================================
echo ANDROID UPDATE PUBLISHED - v0.7.27
echo ==========================================================
echo Players on the compatible APK runtime will receive it
echo when the app checks for updates.
pause
exit /b 0

:fail
echo.
echo ANDROID UPDATE FAILED. Send the error above to ChatGPT.
pause
exit /b 1

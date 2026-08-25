@echo off
setlocal
cd /d "%~dp0"

echo.
echo US AutoDarts League - Publish Small OTA Update
echo ================================================
echo This is ONLY for JavaScript/UI/API-handling fixes compatible with APK runtime 0.7.25.
echo Native Android, Expo SDK, permissions, or native-library changes require a new APK.
echo.

echo Installing dependencies...
call npm.cmd install
if errorlevel 1 goto :error

echo.
echo Exporting Android update bundle...
if exist ota-dist rmdir /s /q ota-dist
call npx.cmd expo export --platform android --output-dir ota-dist --clear
if errorlevel 1 goto :error

echo.
echo Publishing update to the running USADL Server Manager...
call node.exe publish-ota-update.js
if errorlevel 1 goto :error

echo.
echo Update published.
pause
exit /b 0

:error
echo.
echo OTA update was NOT published. Review the error above.
pause
exit /b 1

@echo off
setlocal
cd /d "%~dp0"

echo.
echo US AutoDarts League - Unified Android APK Build v0.7.15
echo ======================================================
echo ONE APK for Player, Moderator, and Manager accounts.
echo Role permissions are determined by the server after sign-in.
echo Production API: https://api.usautodartsleague.com
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git was not found.
  goto :error
)

git config --global core.longpaths true >nul 2>&1

if not exist ".gitignore" (
  echo node_modules/>.gitignore
  echo .expo/>>.gitignore
  echo dist/>>.gitignore
  echo build/>>.gitignore
  echo *.apk>>.gitignore
  echo *.aab>>.gitignore
)

echo Installing project dependencies...
call npm.cmd install
if errorlevel 1 goto :error

echo.
echo Starting Expo EAS Android APK build v0.7.15...
call npx.cmd eas-cli@latest build --platform android --profile preview --clear-cache
if errorlevel 1 goto :error

echo.
echo Build submitted successfully.
echo EAS will display the APK download link when the build completes.
echo This package is com.usautodarts.league so it upgrades the existing Player app.
pause
exit /b 0

:error
echo.
echo Build did not complete. Review the error above.
pause
exit /b 1

@echo off
REM Start FreePi without a terminal window.
cd /d "%~dp0app"
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  echo Electron is not installed yet. Running npm install once...
  call npm install
  start "" "node_modules\electron\dist\electron.exe" .
)

@echo off
rem NTAPI ADS launcher.
rem
rem Runs electron.exe directly through `start`: the app is a GUI program with no
rem console of its own, so this cmd window closes at once and the app keeps
rem running even after it is gone.
rem
rem The previous version used `start /min cmd /c "npm start"`, which made the app
rem a child of that window - closing the window killed the app, and npm stayed
rem behind as an extra process.
rem
rem Kept ASCII-only on purpose: this file may sit under a Thai path, and cmd.exe
rem misreads non-ASCII bytes in a .bat as command separators. Thai instructions
rem live in README.md instead.
setlocal
cd /d "%~dp0"

set "ELECTRON=node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" goto install
goto launch

:install
echo NTAPI ADS dependencies are not installed yet.
echo Running npm install for the first time, this may take a minute...
call npm install
if errorlevel 1 goto failed
goto launch

:failed
echo.
echo Install failed. Open a terminal in this folder and run npm install again.
pause
exit /b 1

:launch
start "" "%ELECTRON%" .
exit /b 0

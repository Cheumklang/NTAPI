@echo off
REM ---------------------------------------------------------------
REM NTAPI.bat - run NTAPI from source (no installer needed)
REM
REM The repo has two faces, and they are the same files:
REM   Ubuntu  : /home/nt/NT-ALL/NTAPI
REM   Windows : Z:\NT-ALL\NTAPI     (Z: = that Ubuntu folder, mapped)
REM
REM node_modules next to the source was installed on Linux. Its
REM electron\dist may or may not hold a Windows electron.exe, and a
REM later npm install on either side overwrites the other. So the
REM Windows runtime is kept OUTSIDE the shared folder, in
REM %LOCALAPPDATA%\NTAPI-dev, and this script never installs into Z:.
REM
REM usage:
REM   NTAPI.vbs          (best) start with no console window at all
REM   NTAPI.bat          no window either: it hands over to NTAPI.vbs
REM   NTAPI.bat console  keep this console, so errors stay readable
REM   NTAPI.bat debug    console plus --enable-logging
REM   NTAPI.bat quiet    start detached, this console closes at once
REM   NTAPI.bat local    keep this machine's own chats (C:\NTAPI)
REM   NTAPI.bat sync     copy Ubuntu chats into C:\NTAPI\sessions first
REM   NTAPI.bat shared   force the Ubuntu data folder
REM
REM With no argument the window is hidden and the Ubuntu data folder is
REM used whenever Z: is mapped, so the same conversation can be continued
REM on either side with nothing to type. A hidden run cannot show a
REM console, so anything meant for it (a crash exit code, a missing
REM drive) is shown as a dialog instead - and every decision is written
REM to ntapi-run.log next to this file.
REM ---------------------------------------------------------------
setlocal enableextensions

set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "APP=%HERE%\app"
set "LOG=%HERE%\ntapi-run.log"
set "WINDEPS=%LOCALAPPDATA%\NTAPI-dev"

REM ---- arguments -------------------------------------------------
set "MODE=%~1"
set "WANT_CONSOLE="
set "FIRE=0"
set "DOLOG="
set "HIDDENNOW="
set "DATA=auto"
:parse
if "%~1"=="" goto :parsed
set "A=%~1"
if /i "%A%"=="hidden"  set "HIDDENNOW=1"
if /i "%A%"=="console" set "WANT_CONSOLE=1"
if /i "%A%"=="debug"   set "WANT_CONSOLE=1"
if /i "%A%"=="debug"   set "DOLOG=1"
if /i "%A%"=="quiet"   set "FIRE=1"
if /i "%A%"=="local"   set "DATA=local"
if /i "%A%"=="shared"  set "DATA=shared"
if /i "%A%"=="sync"    set "DATA=sync"
shift
goto :parse
:parsed

REM ---- no console wanted? hand over to the windowless launcher -----
REM NTAPI.vbs starts this file again with "hidden", so it must not bounce
REM back and forth: HIDDENNOW means "I am already the windowless run".
if defined HIDDENNOW goto :go
if defined WANT_CONSOLE goto :go
if "%FIRE%"=="1" goto :go
if not exist "%HERE%\NTAPI.vbs" goto :go
wscript //nologo "%HERE%\NTAPI.vbs" %*
endlocal
exit /b 0

:go
cd /d "%HERE%"
title NTAPI - source
echo [NTAPI] source  : %APP%
echo [NTAPI] mode    : %MODE%
echo [NTAPI] logfile : %LOG%
> "%LOG%" echo [NTAPI] run %DATE% %TIME%  mode=%MODE%  source=%APP%
if defined HIDDENNOW >> "%LOG%" echo window=hidden

REM The Ubuntu data folder (sessions, mcp.json, keys) is the one shared with the
REM Linux side. The repo sits two folders under the Ubuntu home, so the home
REM folder is ..\.. - that keeps working when the drive letter is not Z: or the
REM share root is mapped somewhere else.
set "ZROOT="
for %%d in ("%HERE%\..\..") do set "ZROOT=%%~fd"
if "%ZROOT:~-1%"=="\" set "ZROOT=%ZROOT:~0,-1%"
set "SHARED_ROOT="
if exist "%ZROOT%\.local\share\ntapi\sessions" set "SHARED_ROOT=%ZROOT%\.local\share\ntapi"
if not defined SHARED_ROOT if exist "Z:\.local\share\ntapi\sessions" set "SHARED_ROOT=Z:\.local\share\ntapi"
if not defined SHARED_ROOT set "SHARED_ROOT=Z:\.local\share\ntapi"
if exist "%SHARED_ROOT%\sessions" echo [NTAPI] chats   : %SHARED_ROOT%\sessions

if not exist "%APP%\package.json" goto :nodrive
if not exist "%APP%\src\main.js" goto :nosource

REM A shared node_modules was installed on Linux: its electron folder holds the
REM Linux runtime, and a Windows electron.exe dropped there by an older install
REM does NOT match those files. That mismatch is what kills the app instantly
REM with 0x80000003 (exit code -2147483645). So the Windows runtime is looked
REM up OUTSIDE the shared folder first.
set "ELECTRON=%WINDEPS%\node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" goto :found
set "ELECTRON=%WINDEPS%\electron\electron.exe"
if exist "%ELECTRON%" goto :found
REM last resort: a Windows-only checkout that ran npm install itself
set "ELECTRON=%APP%\node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" goto :repowarn
goto :install

:repowarn
echo [NTAPI] WARNING: using the electron inside the shared folder.
echo         If it dies with exit code -2147483645 that folder is a Windows/Linux
echo         mix - delete app\node_modules\electron and run this file again.
goto :found

:found
echo [NTAPI] electron: %ELECTRON%
>> "%LOG%" echo electron=%ELECTRON%
goto :launch

:install
REM Fetching/installing the runtime can take minutes and prints progress.
REM Doing that behind an invisible console looks like nothing is happening,
REM so open a real console window for this one run.
if not defined WANT_CONSOLE goto :install_visible
echo [NTAPI] no Windows electron yet - installing it once into %WINDEPS%
>> "%LOG%" echo electron=missing, installing into %WINDEPS%
pushd "%APP%"
set "EVER=38"
for /f "delims=" %%v in ('node -p "require('./node_modules/electron/package.json').version" 2^>nul') do set "EVER=%%v"
popd
>> "%LOG%" echo electron-package-version=%EVER%
where node >nul 2>nul
if errorlevel 1 >> "%LOG%" echo node=missing
if not errorlevel 1 >> "%LOG%" echo node=present
if errorlevel 1 goto :download
if not exist "%WINDEPS%" mkdir "%WINDEPS%"
echo [NTAPI] npm install electron@%EVER% --prefix "%WINDEPS%"
call npm install --prefix "%WINDEPS%" --no-audit --no-fund --loglevel=error "electron@%EVER%" >> "%LOG%" 2>&1
>> "%LOG%" echo npm-exit=%ERRORLEVEL%
set "ELECTRON=%WINDEPS%\node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" goto :found

:download
REM No node/npm on this Windows? Fetch the prebuilt runtime instead.
echo [NTAPI] fetching the Windows electron runtime from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p='%APP%\node_modules\electron\package.json'; if (-not (Test-Path $p)) { throw 'node_modules/electron/package.json is missing - the shared node_modules was not installed' }; $v=(Get-Content -Raw $p | ConvertFrom-Json).version; $d=Join-Path $env:LOCALAPPDATA 'NTAPI-dev\electron'; $z=Join-Path $env:TEMP 'ntapi-electron-win32-x64.zip'; $u=('https://github.com/electron/electron/releases/download/v{0}/electron-v{0}-win32-x64.zip' -f $v); Write-Host ('[NTAPI] ' + $u); Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; if (Test-Path $d) { Remove-Item -Recurse -Force $d }; Expand-Archive -Path $z -DestinationPath $d -Force; Write-Host '[NTAPI] runtime ready'" >> "%LOG%" 2>&1
>> "%LOG%" echo download-exit=%ERRORLEVEL%
set "ELECTRON=%WINDEPS%\electron\electron.exe"
if exist "%ELECTRON%" goto :found
set "WHY=No electron.exe yet. Install Node.js LTS from https://nodejs.org and run NTAPI again."
goto :hold

:install_visible
>> "%LOG%" echo electron=missing, reopening with a console to install it
call :say "NTAPI has to set up its Windows runtime once. A console window will open so you can watch it."
start "" "%HERE%\NTAPI.bat" console %*
endlocal
exit /b 0

:launch
if "%FIRE%"=="1" goto :quiet
if /i "%DATA%"=="local" goto :local
if /i "%DATA%"=="sync" goto :sync
if /i "%DATA%"=="shared" goto :shared
if exist "%SHARED_ROOT%\sessions" goto :shared
goto :local

:local
echo [NTAPI] data root: local (C:\NTAPI)
>> "%LOG%" echo data-root=local
goto :startapp

:shared
if not exist "%SHARED_ROOT%\sessions" (
  set "WHY=%SHARED_ROOT%\sessions was not found - is Z: mapped?"
  goto :hold
)
echo [NTAPI] using the Ubuntu data folder: %SHARED_ROOT%
echo         sessions, mcp.json, provider keys are the ones from the Linux side.
echo         Do not keep the Ubuntu app open at the same time: two writers
echo         on one session file can lose turns.
>> "%LOG%" echo data-root=%SHARED_ROOT% keyword=shared
set "NTAPI_DATA_DIR=%SHARED_ROOT%"
goto :startapp

:sync
if not exist "%SHARED_ROOT%\sessions\NTAPI" (
  set "WHY=%SHARED_ROOT%\sessions\NTAPI was not found - is Z: mapped?"
  goto :hold
)
if not exist "C:\NTAPI\sessions\NTAPI" mkdir "C:\NTAPI\sessions\NTAPI"
echo [NTAPI] copying Ubuntu chats into C:\NTAPI\sessions\NTAPI ...
xcopy /Y /D "%SHARED_ROOT%\sessions\NTAPI\*.jsonl" "C:\NTAPI\sessions\NTAPI\" >> "%LOG%" 2>&1
>> "%LOG%" echo sync-exit=%ERRORLEVEL%
goto :local

:startapp
echo [NTAPI] starting... close the app window to return here
>> "%LOG%" echo starting %ELECTRON% "%APP%" %MODE%
if "%DOLOG%"=="1" goto :run_debug
"%ELECTRON%" "%APP%"
set "RC=%ERRORLEVEL%"
goto :closed

:run_debug
"%ELECTRON%" "%APP%" --enable-logging
set "RC=%ERRORLEVEL%"

:closed
echo [NTAPI] app closed, exit code %RC%
>> "%LOG%" echo exit code %RC%
if "%RC%"=="0" goto :done
if "%RC%"=="-2147483645" (
  echo [NTAPI] 0x80000003 STATUS_BREAKPOINT: electron files of two different versions mixed.
  >> "%LOG%" echo 0x80000003 STATUS_BREAKPOINT - mixed electron versions
  set "WHY=NTAPI died with 0x80000003 (STATUS_BREAKPOINT). The electron files in %WINDEPS% are a mix of two versions - delete that folder and run this file again."
  goto :hold
)
set "WHY=NTAPI closed with exit code %RC%. Details are in ntapi-run.log next to NTAPI.bat."
goto :hold

:done
if defined HIDDENNOW >> "%LOG%" echo closed cleanly
endlocal
exit /b 0

:quiet
REM Fire and forget: no console left behind either way.
if /i "%DATA%"=="shared" if exist "%SHARED_ROOT%\sessions" set "NTAPI_DATA_DIR=%SHARED_ROOT%"
if /i "%DATA%"=="auto" if exist "%SHARED_ROOT%\sessions" set "NTAPI_DATA_DIR=%SHARED_ROOT%"
start "" "%ELECTRON%" "%APP%"
>> "%LOG%" echo started detached data-root=%NTAPI_DATA_DIR%
endlocal
exit /b 0

:nodrive
set "WHY=NTAPI cannot see %APP%\package.json. Z: is probably not mapped in this session - remap the Ubuntu folder and start again. Do not run this file as Administrator: elevated windows lose mapped drives."
goto :hold

:nosource
set "WHY=%APP%\src\main.js is missing - the source folder is incomplete."
goto :hold

:hold
>> "%LOG%" echo stopped: %WHY%
if not defined WANT_CONSOLE goto :hold_hidden
echo.
echo [NTAPI] %WHY%
echo [NTAPI] details were written to %LOG%
pause
endlocal
exit /b 1

:hold_hidden
REM The console is invisible, so say it where the user can see it.
call :say "%WHY%"
endlocal
exit /b 1

:say
>> "%LOG%" echo dialog: %~1
set "MSGVBS=%TEMP%\ntapi-say-%RANDOM%%RANDOM%.vbs"
> "%MSGVBS%" echo MsgBox "%~1", 48, "NTAPI"
wscript //nologo "%MSGVBS%"
del "%MSGVBS%" >nul 2>nul
goto :eof

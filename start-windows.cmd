@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "FORCE_BUILD=%FORCE_BUILD%"
if not defined FORCE_BUILD set "FORCE_BUILD=0"
if /I "%~1"=="--rebuild" set "FORCE_BUILD=1"
if /I "%~1"=="-r" set "FORCE_BUILD=1"

set /a STEP_TOTAL=10
set /a STEP_CURRENT=0
set "CURRENT_STAGE=Initializing"
set "FRONTEND_URL=http://127.0.0.1:8080/?_ts=%RANDOM%%RANDOM%"
set "WX_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=4bc64e7a-4e64-4872-b3f5-5493049fef6d"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

call :log_step "Initialize startup context"
echo [info] Project root: %ROOT%

call :log_step "Check Node.js and npm"
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js is not installed. Please install Node.js 18+ first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [error] npm is not available. Please reinstall Node.js.
  pause
  exit /b 1
)

call :log_step "Install dependencies if needed"
if not exist "%ROOT%\node_modules" (
  echo [info] Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "%ROOT%\node_modules\express" (
  echo [info] Installing missing backend dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

call :log_step "Build frontend package if needed"
set "NEED_BUILD=YES"
if "%FORCE_BUILD%"=="1" (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\needs-build.ps1" -ProjectRoot "%ROOT%" -ForceBuild`) do set "NEED_BUILD=%%I"
) else (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\needs-build.ps1" -ProjectRoot "%ROOT%"`) do set "NEED_BUILD=%%I"
)

if /I "%NEED_BUILD%"=="NO" (
  echo [ok] Frontend bundle is up to date. Skip build.
) else (
  if "%FORCE_BUILD%"=="1" (
    echo [info] FORCE_BUILD enabled. Running npm run build...
  ) else (
    echo [info] Frontend source changed or build output missing. Running npm run build...
  )
  call npm run build
  if errorlevel 1 goto :fail
)

call :log_step "Ensure local ffmpeg exists"
set "LOCAL_FFMPEG=%ROOT%\bin\ffmpeg.exe"
if not exist "%LOCAL_FFMPEG%" (
  echo [info] Local ffmpeg not found. Downloading and installing...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\install-ffmpeg.ps1" -ProjectRoot "%ROOT%"
  if errorlevel 1 goto :fail
)

set "FFMPEG_BIN=%LOCAL_FFMPEG%"

call :log_step "Persist ffmpeg environment variables"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\set-ffmpeg-env.ps1" -FfmpegBin "%LOCAL_FFMPEG%"
if errorlevel 1 (
  echo [warn] Failed to persist user environment variables. Continue with current process env.
)

call :log_step "Start or reuse backend gateway"
echo [info] Checking gateway health...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2; if($r.ok){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo [info] Starting backend gateway with local ffmpeg...
  start "Panku Gateway" cmd /k "cd /d ""%ROOT%"" && set ""FFMPEG_BIN=%LOCAL_FFMPEG%"" && npm run server"

  powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); $ok=$false; while((Get-Date)-lt $deadline){ try{ $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2; if($r.ok){$ok=$true; break}} catch{}; Start-Sleep -Milliseconds 500 }; if($ok){exit 0}else{exit 1}"
  if errorlevel 1 (
    echo [error] Backend did not become healthy in time.
    goto :fail
  )
) else (
  echo [ok] Backend gateway is already running.
)

call :log_step "Send startup webhook notification"
echo [info] Sending WeCom startup notification...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\windows\send-wecom-notice.ps1" -WebhookUrl "%WX_WEBHOOK_URL%"
if errorlevel 1 (
  echo [warn] Webhook notification failed, but startup will continue.
) else (
  echo [ok] Webhook notification sent.
)

call :log_step "Open frontend in fullscreen mode"
echo [info] Opening frontend URL in fullscreen: %FRONTEND_URL%
call :open_fullscreen "%FRONTEND_URL%"

echo [ok] Done.
exit /b 0

:open_fullscreen
set "OPEN_URL=%~1"
set "EDGE_X86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_X64=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME_X64=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE_X86%" (
  start "" "%EDGE_X86%" --kiosk "%OPEN_URL%" --edge-kiosk-type=fullscreen
  exit /b 0
)

if exist "%EDGE_X64%" (
  start "" "%EDGE_X64%" --kiosk "%OPEN_URL%" --edge-kiosk-type=fullscreen
  exit /b 0
)

if exist "%CHROME_X64%" (
  start "" "%CHROME_X64%" --start-fullscreen "%OPEN_URL%"
  exit /b 0
)

if exist "%CHROME_X86%" (
  start "" "%CHROME_X86%" --start-fullscreen "%OPEN_URL%"
  exit /b 0
)

echo [warn] Edge/Chrome not found, fallback to default browser.
start "" "%OPEN_URL%"
exit /b 0

:log_step
set /a STEP_CURRENT+=1
set "CURRENT_STAGE=%~1"
echo [progress !STEP_CURRENT!/!STEP_TOTAL!] !CURRENT_STAGE!
exit /b 0

:fail
echo [error] Startup failed at step !STEP_CURRENT!/!STEP_TOTAL!: !CURRENT_STAGE!
pause
exit /b 1

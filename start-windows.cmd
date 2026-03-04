@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SILENT_MODE=0"
if /I "%~1"=="--silent" set "SILENT_MODE=1"

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [info] Project root: %ROOT%
if "%SILENT_MODE%"=="1" (
  echo [info] Running in silent mode.
)

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

if not exist "%ROOT%node_modules" (
  echo [info] Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "%ROOT%node_modules\express" (
  echo [info] Installing missing backend dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

set "DIST_INDEX=%ROOT%panku\index.html"
if not exist "%DIST_INDEX%" (
  echo [info] Frontend build output missing. Running npm run build...
  call npm run build
  if errorlevel 1 goto :fail
)

set "LOCAL_FFMPEG=%ROOT%bin\ffmpeg.exe"
if not exist "%LOCAL_FFMPEG%" (
  echo [info] Local ffmpeg not found. Downloading and installing...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\windows\install-ffmpeg.ps1" -ProjectRoot "%ROOT%"
  if errorlevel 1 goto :fail
)

set "FFMPEG_BIN=%LOCAL_FFMPEG%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\windows\set-ffmpeg-env.ps1" -FfmpegBin "%LOCAL_FFMPEG%"
if errorlevel 1 (
  echo [warn] Failed to persist user environment variables. Continue with current process env.
)

echo [info] Checking gateway health...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2; if($r.ok){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  if "%SILENT_MODE%"=="1" (
    echo [info] Starting backend gateway in hidden mode...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\windows\start-backend.ps1" -ProjectRoot "%ROOT%" -FfmpegBin "%LOCAL_FFMPEG%" -Hidden
    if errorlevel 1 goto :fail
  ) else (
    echo [info] Starting backend gateway with local ffmpeg...
    start "Panku Gateway" cmd /k "cd /d ""%ROOT%"" && set ""FFMPEG_BIN=%LOCAL_FFMPEG%"" && npm run server"
  )

  powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); $ok=$false; while((Get-Date)-lt $deadline){ try{ $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2; if($r.ok){$ok=$true; break}} catch{}; Start-Sleep -Milliseconds 500 }; if($ok){exit 0}else{exit 1}"
  if errorlevel 1 (
    echo [error] Backend did not become healthy in time.
    goto :fail
  )
) else (
  echo [ok] Backend gateway is already running.
)

echo [info] Opening built frontend page...
start "" "%DIST_INDEX%"

echo [ok] Done.
exit /b 0

:fail
echo [error] Startup failed.
if "%SILENT_MODE%"=="1" exit /b 1
pause
exit /b 1

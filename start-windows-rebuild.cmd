@echo off
setlocal

set "FORCE_BUILD=1"
call "%~dp0start-windows.cmd" --rebuild
exit /b %errorlevel%

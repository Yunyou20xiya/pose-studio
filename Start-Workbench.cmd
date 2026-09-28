@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Runtime missing. Please extract the entire ZIP first.
  pause
  exit /b 1
)
"runtime\node.exe" "scripts\launch.mjs"
if errorlevel 1 pause
endlocal

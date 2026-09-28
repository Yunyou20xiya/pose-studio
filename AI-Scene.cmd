@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
"runtime\node.exe" "scripts\pose-command.mjs" %*
endlocal

@echo off
rem Windows Docker entry point. Delegate engine checks, private settings and container startup to PowerShell.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\docker-start.ps1"
if errorlevel 1 (
  echo Docker startup did not finish. Review the message above.
  pause
  exit /b 1
)
pause

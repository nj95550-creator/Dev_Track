@echo off
rem Windows Node quickstart. Check required packages, install when missing, then start the coordinated dev launcher.
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\fflate\package.json" goto install
if not exist "backend\node_modules\pg\package.json" goto install
if not exist "backend\node_modules\swagger-ui-dist\package.json" goto install
if not exist "frontend\node_modules\vite\package.json" goto install
goto launch
:install
call npm run setup
if errorlevel 1 (
  echo Installation did not finish. Review the message above.
  pause
  exit /b 1
)
:launch
node scripts/dev.mjs --open
pause

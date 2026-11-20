@echo off
title FreshLoop
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org, install it, restart your computer, then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing FreshLoop for the first time. This takes about a minute...
  call npm install
  if errorlevel 1 (
    echo Install failed. Send a screenshot of this window to your team.
    pause
    exit /b 1
  )
)
echo.
echo Starting FreshLoop. Your browser will open at http://localhost:5173
echo Keep this window open while you use the portal. Close it to stop.
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173"
call npm run dev
pause

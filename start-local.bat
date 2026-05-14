@echo off
title MANIEDUHUB local server
cd /d "%~dp0"
echo.
echo === Installing dependencies (first time may take a minute) ===
call npm install
if errorlevel 1 (
  echo npm install failed. Is Node.js installed? Get it from https://nodejs.org
  pause
  exit /b 1
)
echo.
echo === Starting web SERVER (data is NOT in the browser) ===
echo Open: http://localhost:3000
echo Close this window to stop the server.
echo.
call npm start

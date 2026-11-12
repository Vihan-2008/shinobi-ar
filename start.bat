@echo off
title Shinobi AR
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  node server.js 8080
) else (
  echo Node.js not found, using Python instead...
  start "" http://localhost:8080
  python -m http.server 8080 --bind 127.0.0.1
)

@echo off
title Job Tracker - Auto AI Loker
echo ===================================================
echo     🚀 Menjalankan Job Tracker AI Website...
echo ===================================================
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terpasang di komputer ini!
    echo Silakan install Node.js terlebih dahulu dari https://nodejs.org/
    pause
    exit /b
)

if not exist "node_modules" (
    echo Menginstall dependencies...
    npm install
)

echo Membuka browser http://localhost:3000...
start http://localhost:3000

echo Menjalankan server...
node server.js
pause

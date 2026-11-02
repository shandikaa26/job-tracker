@echo off
title Job Tracker - Python Flask (FPEB UPI)
echo ===================================================
echo     🚀 Menjalankan Job Tracker (Python Flask)...
echo     Sesuai Materi Kuliah FPEB UPI - Port 8000
echo ===================================================
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python belum terpasang di komputer ini!
    echo Silakan install Python terlebih dahulu dari https://python.org/
    pause
    exit /b
)

echo Membuka browser http://localhost:8000...
start http://localhost:8000

echo Menjalankan server Flask...
python app.py
pause

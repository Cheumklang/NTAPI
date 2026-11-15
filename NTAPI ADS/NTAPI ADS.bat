@echo off
rem เปิด NTAPI ADS โดยไม่ต้องเปิด terminal เอง
cd /d "%~dp0"
start "" /min cmd /c "npm start"
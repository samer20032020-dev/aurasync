@echo off
chcp 65001 >nul
title AuraSync — معاينة الموقع
cd /d "%~dp0"
echo جاري تشغيل معاينة الموقع...
echo.
node serve.js
pause

@echo off
chcp 65001 >nul 2>nul
set "ROOT=%~dp0"

rem 1) Installed app (per-user install location)
if exist "%LOCALAPPDATA%\Programs\AuraSync\AuraSync.exe" (
  start "" "%LOCALAPPDATA%\Programs\AuraSync\AuraSync.exe"
  exit /b
)

rem 2) Unpacked build
if exist "%ROOT%release\win-unpacked\AuraSync.exe" (
  start "" "%ROOT%release\win-unpacked\AuraSync.exe"
  exit /b
)

rem 3) Portable build
if exist "%ROOT%AuraSync-Portable.exe" (
  start "" "%ROOT%AuraSync-Portable.exe"
  exit /b
)
if exist "%ROOT%release\AuraSync-Portable.exe" (
  start "" "%ROOT%release\AuraSync-Portable.exe"
  exit /b
)

echo AuraSync was not found. Please run AuraSync-Setup.exe first.
pause

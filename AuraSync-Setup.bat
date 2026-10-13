@echo off
chcp 65001 >nul 2>nul
title AuraSync Setup
set "ROOT=%~dp0"

rem 1) Prefer the standard Windows installer (cloud setup wizard)
if exist "%ROOT%AuraSync-Setup.exe" (
  start "" "%ROOT%AuraSync-Setup.exe" --setup
  exit /b
)
if exist "%ROOT%release\AuraSync-Setup.exe" (
  start "" "%ROOT%release\AuraSync-Setup.exe" --setup
  exit /b
)

rem 2) Fallback: run the app in the cloud setup window (--setup)
if exist "%ROOT%AuraSync-Portable.exe" (
  start "" "%ROOT%AuraSync-Portable.exe" --setup
  exit /b
)
if exist "%ROOT%release\win-unpacked\AuraSync.exe" (
  start "" "%ROOT%release\win-unpacked\AuraSync.exe" --setup
  exit /b
)
if exist "%ROOT%release\AuraSync-Portable.exe" (
  start "" "%ROOT%release\AuraSync-Portable.exe" --setup
  exit /b
)

echo AuraSync installer was not found.
pause

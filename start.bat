@echo off
cd /d "%~dp0"
echo Starting LighterLlama at http://localhost:5173
echo Compare page: http://localhost:5173/#compare
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
@echo off
rem RE Tool Panel - chay KHONG tai source/quet offset (may cong ty chan node ra mang).
rem Tham so them (neu can): -Test  -Eject  -Check
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tool-panel\run.ps1" -NoUpdate %*
set RC=%ERRORLEVEL%
pause
exit /b %RC%

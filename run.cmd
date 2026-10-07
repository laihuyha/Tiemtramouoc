@echo off
rem RE Tool Panel - chay 1 phat (tu cai Node/Edge neu thieu, mo game, build, inject).
rem Tham so: -Test  -Update  -Eject  -Check   (vd: run.cmd -Test)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tool-panel\run.ps1" %*
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%

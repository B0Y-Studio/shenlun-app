@echo off
REM docs/sessions/backup.bat
REM 双击或在 cmd / Windows Terminal 跑：powershell -ExecutionPolicy Bypass -File "%~dp0backup.ps1"
REM 把脚本放在当前目录（%~dp0 = 脚本所在目录）

powershell -ExecutionPolicy Bypass -File "%~dp0backup.ps1"
pause
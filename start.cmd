@echo off
rem DELUS — оғоз дар компютер: сервер дар http://localhost:8080
cd /d "%~dp0"
start "" http://localhost:8080
node server\server.js
pause

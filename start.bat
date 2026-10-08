@echo off
setlocal
cd /d "%~dp0dist"
echo Sales OS 2.0: http://localhost:8000
echo Press Ctrl+C to stop the server.
start "" "http://localhost:8000"
py -m http.server 8000
if errorlevel 1 (
  echo.
  echo Python launcher py was not found. Install Python or follow README.md.
  pause
)

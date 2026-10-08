@echo off
setlocal
cd /d "%~dp0"
if not exist "dist-fallback\index.html" (
  echo Building the standalone fallback site...
  py scripts/audit.py
  if errorlevel 1 (
    echo.
    echo Audit failed. Install Python dependencies from requirements.txt and try again.
    pause
    exit /b 1
  )
  py scripts/build.py --out-dir dist-fallback
  if errorlevel 1 (
    echo.
    echo Fallback build failed. Install Python dependencies from requirements.txt and try again.
    pause
    exit /b 1
  )
)
cd /d "%~dp0dist-fallback"
echo Sales OS 2.0: http://localhost:8000
echo Press Ctrl+C to stop the server.
start "" "http://localhost:8000"
py -m http.server 8000
if errorlevel 1 (
  echo.
  echo Python launcher py was not found. Install Python or follow README.md.
  pause
)

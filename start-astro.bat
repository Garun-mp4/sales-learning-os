@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 22 or newer is required. & pause & exit /b 1)
where python >nul 2>&1 || (echo Python with requirements.txt is required. & pause & exit /b 1)
if not exist node_modules\astro npm install || (echo NPM install failed. Check internet connectivity. & pause & exit /b 1)
npm run dev
pause

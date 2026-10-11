@echo off
title IBVAP — Border Surveillance Command ^& Control Platform
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════════════╗
echo  ║   IBVAP — Intelligent Border Video Analytics Platform            ║
echo  ║   Problem Statement: SIH26187 ^| SSB / Ministry of Home Affairs   ║
echo  ║   Unified Launch: FastAPI AI Engine + Vite Tactical Frontend     ║
echo  ╚══════════════════════════════════════════════════════════════════╝
echo.

:: Move to the project root directory (location of this .bat file)
cd /d "%~dp0"

:: 1. Verify Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not found in PATH.
    echo  Please install Node.js ^(v18+^) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Verify Python is installed
where python >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python is not found in PATH.
    echo  Please install Python 3.10+ from https://python.org
    echo.
    pause
    exit /b 1
)

:: 3. Check and install frontend dependencies if missing
if not exist "%~dp0node_modules\" (
    echo  [INFO] node_modules not found — running npm install...
    call npm install
    echo.
)

:: 4. Start the Surveillance Backend (FastAPI, AI Pipeline, SQLite, WebSocket)
echo  [INFO] Launching Surveillance Backend Engine on http://127.0.0.1:8000 ...
start "IBVAP Surveillance Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: 5. Start the Tactical Frontend (Vite, React, Tailwind)
echo  [INFO] Launching Command ^& Control Frontend on http://localhost:5173 ...
start "IBVAP Tactical Console (Port 5173)" cmd /k "cd /d "%~dp0" && npm run dev"

:: 6. Wait for services to initialize
echo  [INFO] Initializing surveillance subsystems...
timeout /t 4 /nobreak >nul

:: 7. Launch browser at login / entry portal
set APP_URL=http://localhost:5173/

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" %APP_URL%
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" %APP_URL%
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" %APP_URL%
) else (
    start "" %APP_URL%
)

echo.
echo  ╔══════════════════════════════════════════════════════════════════╗
echo  ║   IBVAP System Operational                                       ║
echo  ║                                                                  ║
echo  ║   * Tactical Console:   http://localhost:5173/                   ║
echo  ║   * Backend REST API:   http://127.0.0.1:8000                    ║
echo  ║   * API Swagger Docs:   http://127.0.0.1:8000/docs               ║
echo  ║   * Live WebSocket:     ws://127.0.0.1:8000/ws                   ║
echo  ╚══════════════════════════════════════════════════════════════════╝
echo.
echo  [OK] Both backend and frontend servers are running in separate windows.
echo  [OK] To stop the system, close both opened terminal windows.
echo.
pause

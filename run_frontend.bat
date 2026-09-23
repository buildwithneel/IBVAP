@echo off
title IBVAP Frontend Server
cd /d "%~dp0"

echo ========================================================
echo               IBVAP - Frontend Launcher
echo ========================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists; if not, run npm install
if not exist "node_modules\" (
    echo [INFO] Dependencies not found. Installing packages with 'npm install'...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install encountered an error.
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Dependencies installed successfully!
    echo.
)

:: Start Vite dev server and automatically launch the browser
echo [INFO] Starting Vite development server...
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm run dev -- --open

if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] Dev server stopped.
    pause
)

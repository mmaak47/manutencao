@echo off
title Intermidia - Manutencao

echo ================================
echo   Intermidia - Sistema de Manutencao
echo ================================
echo.

:: Inicia o backend
echo [1/2] Iniciando backend (porta 3001)...
cd /d "%~dp0backend"
start "Backend - Intermidia" cmd /k "node index.js"

:: Aguarda o backend subir
timeout /t 3 /nobreak >nul

:: Inicia o frontend
echo [2/2] Iniciando frontend (porta 3002)...
cd /d "%~dp0frontend"
start "Frontend - Intermidia" cmd /k "npm start"

echo.
echo ================================
echo   Servidores iniciados!
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3002
echo ================================
echo.
echo Feche esta janela quando quiser.
pause

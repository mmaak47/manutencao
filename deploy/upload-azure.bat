@echo off
title Intermidia — Upload para Azure
echo ============================================
echo   Upload do projeto para Azure VM
echo ============================================
echo.

set /p AZURE_IP="Digite o IP da VM Azure: "
set /p AZURE_USER="Usuario SSH (padrao: azureuser): "
if "%AZURE_USER%"=="" set AZURE_USER=azureuser

echo.
echo Enviando arquivos para %AZURE_USER%@%AZURE_IP%...
echo (Vai pedir a senha SSH ou usar sua chave)
echo.

:: Upload backend
echo [1/4] Enviando backend...
scp -r "%~dp0backend" %AZURE_USER%@%AZURE_IP%:/tmp/intermidia-backend

:: Upload frontend build
echo [2/4] Enviando frontend build...
scp -r "%~dp0frontend\build" %AZURE_USER%@%AZURE_IP%:/tmp/intermidia-frontend-build

:: Upload frontend package.json (for future builds)
scp "%~dp0frontend\package.json" %AZURE_USER%@%AZURE_IP%:/tmp/intermidia-frontend-package.json

:: Upload deploy configs
echo [3/4] Enviando configs de deploy...
scp -r "%~dp0deploy" %AZURE_USER%@%AZURE_IP%:/tmp/intermidia-deploy
scp "%~dp0ecosystem.config.js" %AZURE_USER%@%AZURE_IP%:/tmp/intermidia-ecosystem.config.js

:: Move files on server
echo [4/4] Organizando no servidor...
ssh %AZURE_USER%@%AZURE_IP% "sudo mkdir -p /home/intermidia/app/frontend && sudo cp -r /tmp/intermidia-backend /home/intermidia/app/backend && sudo cp -r /tmp/intermidia-frontend-build /home/intermidia/app/frontend/build && sudo cp -r /tmp/intermidia-deploy /home/intermidia/app/deploy && sudo cp /tmp/intermidia-ecosystem.config.js /home/intermidia/app/ecosystem.config.js && sudo cp /tmp/intermidia-frontend-package.json /home/intermidia/app/frontend/package.json && sudo chown -R intermidia:intermidia /home/intermidia/app && rm -rf /tmp/intermidia-*"

echo.
echo ============================================
echo   Upload concluido!
echo   Agora conecte via SSH e execute:
echo   ssh %AZURE_USER%@%AZURE_IP%
echo   sudo bash /home/intermidia/app/deploy/setup-azure.sh
echo   sudo -u intermidia bash /home/intermidia/app/deploy/deploy.sh
echo ============================================
pause

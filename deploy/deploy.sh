#!/bin/bash
# =============================================================
#  Deploy / Update — roda como usuário intermidia
#  Uso: bash deploy.sh
# =============================================================

set -e

APP_DIR="/home/intermidia/app"
LOG_DIR="/home/intermidia/logs"

echo "============================================"
echo "  Intermídia — Deploy"
echo "============================================"

# 1. Install backend dependencies
echo "[1/4] Instalando dependências do backend..."
cd $APP_DIR/backend
npm install --production

# 2. Build frontend (if src exists)
if [ -d "$APP_DIR/frontend/src" ]; then
  echo "[2/4] Fazendo build do frontend..."
  cd $APP_DIR/frontend
  npm install
  npx react-scripts build
else
  echo "[2/4] Frontend build já existe, pulando..."
fi

# 3. Start/Restart with PM2
echo "[3/4] Iniciando aplicação com PM2..."
cd $APP_DIR
pm2 delete intermidia-manutencao 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 4. Verify
echo "[4/4] Verificando..."
sleep 3
pm2 status

echo ""
echo "============================================"
echo "  Deploy concluído!"
echo "  Backend rodando na porta 3001"
echo "  Nginx servindo na porta 80"
echo "  Logs: pm2 logs intermidia-manutencao"
echo "============================================"

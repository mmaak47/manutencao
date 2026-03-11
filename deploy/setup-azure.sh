#!/bin/bash
# =============================================================
#  Intermídia Manutenção — Azure VM Setup Script
#  Execute como root: sudo bash setup-azure.sh
# =============================================================

set -e

APP_USER="intermidia"
APP_DIR="/home/$APP_USER/app"
LOG_DIR="/home/$APP_USER/logs"

echo "============================================"
echo "  Intermídia — Setup Azure VM"
echo "============================================"

# 1. Update system
echo "[1/8] Atualizando sistema..."
apt update && apt upgrade -y

# 2. Install Node.js 20 LTS
echo "[2/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install Nginx
echo "[3/8] Instalando Nginx..."
apt install -y nginx

# 4. Install PM2
echo "[4/8] Instalando PM2..."
npm install -g pm2

# 5. Create app user (if not exists)
echo "[5/8] Configurando usuário e diretórios..."
id -u $APP_USER &>/dev/null || useradd -m -s /bin/bash $APP_USER
mkdir -p $APP_DIR $LOG_DIR
chown -R $APP_USER:$APP_USER /home/$APP_USER

# 6. Setup Nginx
echo "[6/8] Configurando Nginx..."
cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/intermidia
ln -sf /etc/nginx/sites-available/intermidia /etc/nginx/sites-enabled/intermidia
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

# 7. Setup firewall
echo "[7/8] Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 8. Setup PM2 startup
echo "[8/8] Configurando PM2 startup..."
pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

echo ""
echo "============================================"
echo "  Setup concluído!"
echo "  Agora faça o deploy dos arquivos:"
echo ""
echo "  1. Copie os arquivos para $APP_DIR"
echo "  2. Execute: sudo -u $APP_USER bash $APP_DIR/deploy/deploy.sh"
echo "============================================"

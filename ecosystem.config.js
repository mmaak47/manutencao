module.exports = {
  apps: [{
    name: 'intermidia-manutencao',
    script: 'index.js',
    cwd: '/home/intermidia/app/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: '/home/intermidia/logs/error.log',
    out_file: '/home/intermidia/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 5000
  }]
};

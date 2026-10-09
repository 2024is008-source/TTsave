module.exports = {
  apps: [
    {
      name: 'ttsave',
      cwd: '/var/www/TTsave',
      script: 'dist/server.js',
      interpreter: 'node',
      node_args: '--env-file=/var/www/TTsave/.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      kill_timeout: 12000,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        PUBLIC_BASE_URL: 'https://tiksavemp4.online',
        TRUST_PROXY: '1',
        LOG_LEVEL: 'info',
      },
    },
  ],
};

module.exports = {
  apps: [{
    name: 'mi-tienda-ya-2',
    cwd: __dirname,
    script: 'api/src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '768M',
    kill_timeout: 15000,
    env: { NODE_ENV: 'production' },
    time: true
  }]
};

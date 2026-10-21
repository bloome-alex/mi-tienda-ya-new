import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: process.env.ENV_FILE ? path.resolve(root, process.env.ENV_FILE) : path.join(root, '.env'), quiet: true });
const extra = process.argv.slice(2);
const supervisorPort = extra.indexOf('--port');
const clientPort = supervisorPort >= 0 ? extra[supervisorPort + 1] : process.env.CLIENT_PORT || '5173';
const children = [
  spawn(process.execPath, ['--watch', 'api/src/index.js'], { cwd: root, stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', clientPort], { cwd: path.join(root,'client'), stdio: 'inherit', env: process.env })
];
// Vite is hoisted by npm workspaces. Launch from the shared dependency root.
children[1].on('error', error => console.error('No se pudo iniciar Vite:',error.message));
let stopping=false;
function stop(signal='SIGTERM') { if(stopping)return; stopping=true; for(const child of children)child.kill(signal); }
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop(signal));
for(const child of children)child.on('exit',code=>{if(!stopping){stop();process.exitCode=code||0;}});

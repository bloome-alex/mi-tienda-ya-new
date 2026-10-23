import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import qrcode from 'qrcode';

/** Una instancia por proceso. LocalAuth separa el perfil Chromium por clientId. */
export class WhatsAppService {
  constructor() { this.client = null; this.connecting = null; this.generation = 0; this.state = { status: 'disconnected', qr: null, error: null, clientId: config.whatsappClientId }; }
  status() { return { ...this.state }; }
  async connect() {
    if (this.client || this.connecting) return this.status();
    this.state = { ...this.state, status: 'connecting', error: null, qr: null };
    this.connecting = this.initialize(++this.generation);
    this.connecting.catch(error => {
      this.state.status = 'error'; this.state.error = 'No se pudo iniciar WhatsApp. Revisá Chromium, permisos y el identificador del cliente.';
      console.error(`[whatsapp] ${error.name}: ${error.message}`);
    }).finally(() => { this.connecting = null; });
    return this.status();
  }
  async initialize(generation) {
    const module = await import('whatsapp-web.js');
    const { Client, LocalAuth } = module.default || module;
    if (generation !== this.generation) return;
    const puppeteerArgs = [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ];
    if (config.whatsappNoSandbox) puppeteerArgs.unshift('--no-sandbox', '--disable-setuid-sandbox');
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: config.whatsappClientId, dataPath: config.whatsappDataPath }),
      puppeteer: {
        headless: true,
        executablePath: config.whatsappExecutablePath,
        args: puppeteerArgs,
      },
    });
    this.client = client;
    client.on('qr', qr => { qrcode.toDataURL(qr).then(data => { if (this.client === client) { this.state.status = 'qr'; this.state.qr = data; } }).catch(() => { this.state.error = 'No se pudo generar el QR.'; }); });
    client.on('authenticated', () => { if (this.client !== client) return; this.state.status = 'authenticated'; this.state.qr = null; });
    client.on('ready', () => { if (this.client !== client) return; this.state.status = 'connected'; this.state.qr = null; this.state.error = null; });
    client.on('auth_failure', () => { if (this.client !== client) return; this.state.status = 'error'; this.state.qr = null; this.state.error = 'La autenticación falló. Desconectá y volvé a vincular.'; });
    client.on('disconnected', () => { if (this.client !== client) return; this.state.status = 'disconnected'; this.state.qr = null; this.client = null; client.destroy().catch(() => {}); });
    try { await client.initialize(); } catch (error) { this.client = null; await client.destroy().catch(() => {}); throw error; }
  }
  async disconnect() {
    this.generation++; const client = this.client; this.client = null;
    if (client) { await client.logout().catch(() => {}); await client.destroy().catch(() => {}); }
    this.state = { status: 'disconnected', qr: null, error: null, clientId: config.whatsappClientId };
    return this.status();
  }
  async close() { this.generation++; const client = this.client; this.client = null; if (client) await client.destroy().catch(() => {}); }
  async send(phone, text) {
    if (!this.client || this.state.status !== 'connected') throw new AppError('WhatsApp no está conectado.', 503, 'WHATSAPP_DISCONNECTED');
    const number = String(phone).replace(/\D/g, '');
    if (number.length < 8 || number.length > 15) throw new AppError('Número de WhatsApp no válido.', 422);
    return this.client.sendMessage(`${number}@c.us`, String(text).slice(0, 4000));
  }
}
export const whatsappService = new WhatsAppService();

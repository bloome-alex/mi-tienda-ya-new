import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';

const execFileAsync = promisify(execFile);
const STORE_ID = /^[a-f0-9]{24}$/i;
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

export class DomainProvisioningService {
  constructor({ settings = config.domainProvisioning, runner = execFileAsync, logger = console } = {}) {
    this.settings = settings;
    this.runner = runner;
    this.logger = logger;
  }

  enabled() { return Boolean(this.settings?.enabled); }

  assertConfigured() {
    if (!this.enabled()) throw new AppError('El aprovisionamiento automático de dominios no está habilitado en el servidor.', 503, 'DOMAIN_PROVISIONING_DISABLED');
    if (!this.settings.provisionerBin) throw new AppError('Falta configurar DOMAIN_PROVISIONER_BIN en el servidor.', 503, 'DOMAIN_PROVISIONING_NOT_CONFIGURED');
  }

  normalizeStoreId(storeId) {
    const value = String(storeId || '').trim();
    if (!STORE_ID.test(value)) throw new AppError('No se pudo identificar la tienda para configurar el dominio.', 500, 'INVALID_STORE_ID');
    return value.toLowerCase();
  }

  normalizeDomain(domain) {
    const value = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
    if (!HOSTNAME.test(value)) throw new AppError('El dominio propio no es válido.', 422, 'INVALID_DOMAIN');
    return value;
  }

  invocation(action, storeId, domain = '') {
    const args = [action, this.normalizeStoreId(storeId)];
    if (action === 'provision') args.push(this.normalizeDomain(domain));
    if (this.settings.useSudo) return { file: this.settings.sudoBin || '/usr/bin/sudo', args: ['-n', this.settings.provisionerBin, ...args] };
    return { file: this.settings.provisionerBin, args };
  }

  async execute(action, storeId, domain = '') {
    this.assertConfigured();
    const invocation = this.invocation(action, storeId, domain);
    try {
      const result = await this.runner(invocation.file, invocation.args, {
        timeout: this.settings.timeoutMs || 180000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return String(result?.stdout || '').trim();
    } catch (error) {
      const stderr = String(error?.stderr || '').trim().slice(0, 4000);
      this.logger.error(`[domain] Falló ${action} para la tienda ${storeId}: ${stderr || error?.message || 'error desconocido'}`);
      if (error?.killed || error?.code === 'ETIMEDOUT') throw new AppError('El servidor tardó demasiado en configurar Nginx/SSL. Podés volver a intentar la verificación.', 503, 'DOMAIN_PROVISIONING_TIMEOUT');
      throw new AppError('El dominio fue validado, pero no se pudo completar la configuración automática de Nginx/SSL. Revisá la configuración del aprovisionador del servidor y volvé a intentar.', 503, 'DOMAIN_PROVISIONING_FAILED');
    }
  }

  async provision({ storeId, domain }) { return this.execute('provision', storeId, domain); }

  async deprovision({ storeId }) {
    if (!this.enabled()) return false;
    try { await this.execute('remove', storeId); return true; }
    catch (error) {
      this.logger.error(`[domain] No se pudo limpiar la configuración anterior de la tienda ${storeId}: ${error.message}`);
      return false;
    }
  }
}

export const domainProvisioningService = new DomainProvisioningService();

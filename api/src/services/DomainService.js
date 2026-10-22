import dns from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { Store } from '../models/index.js';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { domainProvisioningService } from './DomainProvisioningService.js';

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

function stripPort(host) {
  const value = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!value) return '';
  if (value.startsWith('[')) return value;
  return value.replace(/:\d+$/, '');
}

export class DomainService {
  constructor({ storeModel = Store, resolver = dns, storefront = config.storefront, appUrl = config.appUrl, provisioner = domainProvisioningService } = {}) {
    this.storeModel = storeModel;
    this.resolver = resolver;
    this.storefront = storefront;
    this.appUrl = appUrl;
    this.provisioner = provisioner;
    this.cache = new Map();
  }

  baseDomain() { return this.storefront.baseDomain; }

  normalizeSubdomain(input) {
    const value = String(input || '').trim().toLowerCase();
    if (!SUBDOMAIN.test(value) || value.length > 63) throw new AppError('Usá entre 3 y 63 caracteres: letras minúsculas, números y guiones.', 422, 'INVALID_SUBDOMAIN');
    if (value.length < 3) throw new AppError('El subdominio debe tener al menos 3 caracteres.', 422, 'INVALID_SUBDOMAIN');
    const hostname = this.managedHostname(value);
    const appHost = stripPort(new URL(this.appUrl).host);
    if (this.storefront.reservedSubdomains.includes(value) || hostname === appHost || hostname === this.storefront.cnameTarget) throw new AppError('Ese subdominio está reservado por Mi Tienda Ya.', 409, 'SUBDOMAIN_RESERVED');
    return value;
  }

  normalizeCustomDomain(input) {
    let raw = String(input || '').trim().toLowerCase();
    if (!raw) throw new AppError('Ingresá el dominio propio.', 422, 'INVALID_DOMAIN');
    if (/^https?:\/\//i.test(raw)) {
      try { raw = new URL(raw).hostname; } catch { throw new AppError('Ingresá solamente un dominio válido, por ejemplo tienda.marca.com.', 422, 'INVALID_DOMAIN'); }
    }
    raw = raw.split('/')[0].split('?')[0].split('#')[0].replace(/\.$/, '');
    const ascii = domainToASCII(raw).toLowerCase();
    if (!ascii || !HOSTNAME.test(ascii) || ascii === 'localhost' || /^\d+(?:\.\d+){3}$/.test(ascii)) throw new AppError('Ingresá un dominio válido, por ejemplo tienda.marca.com.', 422, 'INVALID_DOMAIN');
    const base = this.baseDomain();
    const appHost = stripPort(new URL(this.appUrl).host);
    if (ascii === base || ascii.endsWith('.' + base)) throw new AppError(`Para direcciones ${base} usá la opción de subdominio.`, 422, 'USE_SUBDOMAIN_MODE');
    if (ascii === appHost || ascii === this.storefront.cnameTarget) throw new AppError('Ese dominio está reservado por Mi Tienda Ya.', 409, 'DOMAIN_RESERVED');
    return ascii;
  }

  managedHostname(subdomain) { return subdomain ? `${subdomain}.${this.baseDomain()}` : ''; }
  verificationName(domain) { return `${this.storefront.verificationPrefix}.${domain}`; }

  pathUrl(store) {
    const base = this.appUrl.replace(/\/$/, '');
    return `${base}/t/${store.slug}`;
  }

  publicUrl(store) {
    const domain = store?.domain || {};
    if (domain.mode === 'subdomain' && domain.subdomain) return `https://${this.managedHostname(domain.subdomain)}`;
    if (domain.mode === 'custom' && domain.customDomain && domain.status === 'verified') return `https://${domain.customDomain}`;
    return this.pathUrl(store);
  }

  publicDomain(store) {
    const domain = store?.domain || {};
    return {
      mode: domain.mode || 'path',
      subdomain: domain.subdomain || '',
      customDomain: domain.customDomain || '',
      status: domain.status || 'unconfigured',
      dnsVerifiedAt: domain.dnsVerifiedAt || null,
      verifiedAt: domain.verifiedAt || null,
      provisionedAt: domain.provisionedAt || null,
      provisioningError: domain.provisioningError || '',
      provisioningEnabled: typeof this.provisioner?.enabled === 'function' ? this.provisioner.enabled() : true,
      publicUrl: this.publicUrl(store),
      baseDomain: this.baseDomain(),
      cnameTarget: this.storefront.cnameTarget,
      verification: domain.customDomain && domain.verificationToken ? {
        type: 'TXT',
        name: this.verificationName(domain.customDomain),
        value: domain.verificationToken,
      } : null,
    };
  }

  async ensureUnique(field, value, storeId) {
    const existing = await this.storeModel.findOne({ [field]: value, archived: { $ne: true }, _id: { $ne: storeId } }).select('_id').lean();
    if (existing) throw new AppError(field.endsWith('subdomain') ? 'Ese subdominio ya está asignado a otra tienda.' : 'Ese dominio ya está asignado a otra tienda.', 409, 'DOMAIN_IN_USE');
  }

  async configure(store, input) {
    const mode = input?.mode;
    if (!['path', 'subdomain', 'custom'].includes(mode)) throw new AppError('Elegí una modalidad de dominio válida.', 422, 'INVALID_DOMAIN_MODE');
    const previous = this.publicDomain(store);
    const previousCustomDomain = store.domain?.mode === 'custom' ? store.domain?.customDomain : '';
    if (mode === 'path') {
      store.domain = { mode: 'path', subdomain: null, customDomain: null, status: 'unconfigured', verificationToken: '', dnsVerifiedAt: null, verifiedAt: null, provisionedAt: null, provisioningError: '' };
    } else if (mode === 'subdomain') {
      const subdomain = this.normalizeSubdomain(input.subdomain);
      await this.ensureUnique('domain.subdomain', subdomain, store._id);
      store.domain = { mode: 'subdomain', subdomain, customDomain: null, status: 'verified', verificationToken: '', dnsVerifiedAt: null, verifiedAt: new Date(), provisionedAt: null, provisioningError: '' };
    } else {
      const customDomain = this.normalizeCustomDomain(input.customDomain);
      await this.ensureUnique('domain.customDomain', customDomain, store._id);
      const same = store.domain?.mode === 'custom' && store.domain?.customDomain === customDomain;
      store.domain = {
        mode: 'custom', subdomain: null, customDomain,
        status: same ? (store.domain?.status || 'pending') : 'pending',
        verificationToken: same && store.domain?.verificationToken ? store.domain.verificationToken : randomBytes(24).toString('hex'),
        dnsVerifiedAt: same ? store.domain?.dnsVerifiedAt || null : null,
        verifiedAt: same ? store.domain?.verifiedAt || null : null,
        provisionedAt: same ? store.domain?.provisionedAt || null : null,
        provisioningError: same ? store.domain?.provisioningError || '' : '',
      };
    }
    await store.save();
    const currentCustomDomain = store.domain?.mode === 'custom' ? store.domain?.customDomain : '';
    if (previousCustomDomain && previousCustomDomain !== currentCustomDomain) await this.provisioner.deprovision({ storeId: store._id });
    this.cache.clear();
    return { before: previous, after: this.publicDomain(store) };
  }

  async deprovisionStore(store) {
    if (store?.domain?.mode !== 'custom' || !store?.domain?.customDomain) return false;
    const removed = await this.provisioner.deprovision({ storeId: store._id });
    this.cache.clear();
    return removed;
  }

  async verify(store) {
    if (store.domain?.mode !== 'custom' || !store.domain?.customDomain || !store.domain?.verificationToken) throw new AppError('Configurá primero un dominio propio.', 422, 'CUSTOM_DOMAIN_NOT_CONFIGURED');
    if (store.domain.status === 'verified' && store.domain.provisionedAt) return this.publicDomain(store);
    const name = this.verificationName(store.domain.customDomain);
    let records;
    try { records = await this.resolver.resolveTxt(name); }
    catch (error) {
      if (['ENODATA', 'ENOTFOUND', 'SERVFAIL', 'ETIMEOUT', 'EREFUSED'].includes(error?.code)) throw new AppError('Todavía no encontramos el registro TXT de verificación. Esperá la propagación DNS e intentá nuevamente.', 422, 'DOMAIN_DNS_PENDING');
      throw error;
    }
    const values = records.map(parts => parts.join(''));
    if (!values.includes(store.domain.verificationToken)) throw new AppError('El registro TXT existe pero no coincide con el valor de verificación de esta tienda.', 422, 'DOMAIN_TOKEN_MISMATCH');

    store.domain.dnsVerifiedAt = new Date();
    store.domain.provisioningError = '';
    await store.save();
    try {
      await this.provisioner.provision({ storeId: store._id, domain: store.domain.customDomain });
    } catch (error) {
      store.domain.status = 'pending';
      store.domain.verifiedAt = null;
      store.domain.provisionedAt = null;
      store.domain.provisioningError = error.message;
      await store.save();
      throw error;
    }

    const now = new Date();
    store.domain.status = 'verified';
    store.domain.verifiedAt = now;
    store.domain.provisionedAt = now;
    store.domain.provisioningError = '';
    try { await store.save(); }
    catch (error) {
      await this.provisioner.deprovision({ storeId: store._id });
      throw error;
    }
    this.cache.clear();
    return this.publicDomain(store);
  }

  hostKind(host) {
    const hostname = stripPort(host);
    if (!hostname) return null;
    const base = this.baseDomain();
    if (hostname.endsWith('.' + base)) {
      const prefix = hostname.slice(0, -(base.length + 1));
      if (prefix && !prefix.includes('.')) return { type: 'subdomain', value: prefix, hostname };
    }
    return { type: 'custom', value: hostname, hostname };
  }

  async resolveStoreByHost(host, { allowInactive = true } = {}) {
    const parsed = this.hostKind(host);
    if (!parsed) return null;
    const appHost = stripPort(new URL(this.appUrl).host);
    if (parsed.hostname === appHost || parsed.hostname === this.baseDomain() || parsed.hostname === 'www.' + this.baseDomain()) return null;
    const cacheKey = `${allowInactive ? 'all' : 'active'}:${parsed.hostname}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const domainFilter = parsed.type === 'subdomain'
      ? { 'domain.mode': 'subdomain', 'domain.subdomain': parsed.value }
      : { 'domain.mode': 'custom', 'domain.customDomain': parsed.value, 'domain.status': 'verified' };
    const store = await this.storeModel.findOne({ ...domainFilter, archived: { $ne: true }, ...(allowInactive ? {} : { active: true }) });
    this.cache.set(cacheKey, { value: store || null, expires: Date.now() + 30000 });
    return store || null;
  }

  async isAllowedOrigin(origin) {
    if (!origin) return true;
    let url;
    try { url = new URL(origin); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.origin === new URL(this.appUrl).origin) return true;
    return Boolean(await this.resolveStoreByHost(url.hostname, { allowInactive: true }));
  }
}

export const domainService = new DomainService();

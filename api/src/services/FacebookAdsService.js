import { createHmac } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';
import { Product, SocialAd, SocialIntegration, SocialOAuthState, Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret, encryptSecret, hashToken, randomToken } from '../utils/crypto.js';
import { domainService } from './DomainService.js';

const OAUTH_SCOPES = Object.freeze(['ads_management', 'ads_read', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const activeAdAccount = account => Number(account?.accountStatus ?? account?.account_status ?? 0) === 1;
const normalizeAdAccountId = value => {
  const id = String(value || '').trim();
  if (!/^(?:act_)?\d+$/.test(id)) throw new AppError('Ingresá un ID de cuenta publicitaria válido.', 422, 'FACEBOOK_AD_ACCOUNT_INVALID');
  return id.startsWith('act_') ? id : `act_${id}`;
};
const normalizePageId = value => {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) throw new AppError('Ingresá un ID de Página de Facebook válido.', 422, 'FACEBOOK_PAGE_INVALID');
  return id;
};
const cleanGraphError = payload => {
  const error = payload?.error || {};
  return String(error.error_user_msg || error.error_user_title || error.message || 'Facebook rechazó la operación.').slice(0, 700);
};
const isPrivateAddress = address => {
  if (!address) return true;
  if (net.isIPv4(address)) {
    const [a,b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:') && net.isIPv4(value.slice(7))) return isPrivateAddress(value.slice(7));
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
};

export class MetaGraphClient {
  constructor(accessToken = '', {
    fetchImpl = globalThis.fetch,
    baseUrl = 'https://graph.facebook.com',
    graphVersion = config.facebookAds.graphVersion,
    appSecret = config.facebookAds.appSecret,
    timeoutMs = 20000,
  } = {}) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl || 'https://graph.facebook.com').replace(/\/$/, '');
    this.graphVersion = graphVersion;
    this.appSecret = appSecret;
    this.timeoutMs = timeoutMs;
  }
  base(path) { return `${this.baseUrl}/${this.graphVersion}/${String(path).replace(/^\//, '')}`; }
  proof() { return this.accessToken && this.appSecret ? createHmac('sha256', this.appSecret).update(this.accessToken).digest('hex') : ''; }
  async request(path, { method = 'GET', params = {}, token = this.accessToken } = {}) {
    const url = new URL(this.base(path));
    const values = { ...params };
    if (token) values.access_token = token;
    if (token && this.proof()) values.appsecret_proof = this.proof();
    let body;
    if (method === 'GET' || method === 'DELETE') Object.entries(values).forEach(([key,value]) => value !== undefined && value !== null && url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value)));
    else {
      const form = new URLSearchParams();
      Object.entries(values).forEach(([key,value]) => value !== undefined && value !== null && form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value)));
      body = form;
    }
    let response;
    try { response = await this.fetch(url, { method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (error) { throw new AppError(`No se pudo conectar con Facebook: ${error.name === 'TimeoutError' ? 'la solicitud tardó demasiado.' : 'revisá la conexión e intentá nuevamente.'}`, 503, 'FACEBOOK_UNAVAILABLE'); }
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok || payload?.error) throw new AppError(cleanGraphError(payload), response.status >= 500 ? 503 : 422, 'FACEBOOK_API_ERROR', { facebookCode: payload?.error?.code, facebookSubcode: payload?.error?.error_subcode });
    return payload;
  }
  get(path, params) { return this.request(path, { params }); }
  post(path, params) { return this.request(path, { method: 'POST', params }); }
  delete(path) { return this.request(path, { method: 'DELETE' }); }
}

/**
 * Política aislada para validar y descargar recursos públicos usados por Meta.
 * Es inyectable para que los tests del transporte Graph no necesiten salir a Internet.
 */
export class PublicAdAssetPolicy {
  constructor({ fetchImpl = globalThis.fetch, dnsLookup = null, isProduction = config.isProduction, maxImageBytes = MAX_IMAGE_BYTES, timeoutMs = 15000 } = {}) {
    this.fetch = fetchImpl;
    this.dnsLookup = dnsLookup || (hostname => dns.lookup(hostname, { all: true }));
    this.isProduction = isProduction;
    this.maxImageBytes = maxImageBytes;
    this.timeoutMs = timeoutMs;
  }
  async destination(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { throw new AppError('La ficha del producto necesita una URL pública válida para anunciarse.', 422, 'FACEBOOK_DESTINATION_NOT_PUBLIC'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new AppError('La ficha del producto necesita una URL pública HTTP/HTTPS.', 422, 'FACEBOOK_DESTINATION_NOT_PUBLIC');
    if (this.isProduction && url.protocol !== 'https:') throw new AppError('La ficha del producto debe usar HTTPS para crear anuncios.', 422, 'FACEBOOK_DESTINATION_NOT_HTTPS');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new AppError('Meta necesita que la tienda sea accesible desde una URL pública. Usá un dominio/subdominio público o un túnel HTTPS de desarrollo.', 422, 'FACEBOOK_DESTINATION_NOT_PUBLIC');
    const addresses = await this.dnsLookup(hostname).catch(() => []);
    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new AppError('Meta necesita que la tienda sea accesible desde una dirección pública.', 422, 'FACEBOOK_DESTINATION_NOT_PUBLIC');
    return url.toString();
  }
  async image(rawUrl) {
    let current;
    try { current = new URL(rawUrl); } catch { throw new AppError('La imagen del producto debe tener una URL pública HTTP/HTTPS.', 422, 'FACEBOOK_IMAGE_NOT_PUBLIC'); }
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      if (!['https:', 'http:'].includes(current.protocol)) throw new AppError('La imagen del producto debe tener una URL pública HTTP/HTTPS.', 422, 'FACEBOOK_IMAGE_NOT_PUBLIC');
      if (this.isProduction && current.protocol !== 'https:') throw new AppError('La imagen del producto debe usar HTTPS para crear anuncios.', 422, 'FACEBOOK_IMAGE_NOT_HTTPS');
      const hostname = current.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new AppError('La imagen del producto debe ser pública.', 422, 'FACEBOOK_IMAGE_NOT_PUBLIC');
      const addresses = await this.dnsLookup(hostname).catch(() => []);
      if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new AppError('La imagen del producto debe estar alojada en una dirección pública.', 422, 'FACEBOOK_IMAGE_NOT_PUBLIC');
      let response;
      try { response = await this.fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs), headers: { Accept: 'image/*' } }); }
      catch { throw new AppError('No se pudo descargar la imagen del producto.', 422, 'FACEBOOK_IMAGE_DOWNLOAD_FAILED'); }
      if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw new AppError('La imagen redirige a una ubicación inválida.', 422, 'FACEBOOK_IMAGE_DOWNLOAD_FAILED'); current = new URL(location, current); continue; }
      if (!response.ok) throw new AppError('No se pudo descargar la imagen del producto.', 422, 'FACEBOOK_IMAGE_DOWNLOAD_FAILED');
      const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(type)) throw new AppError('Usá una imagen JPG, PNG, WEBP o GIF para el anuncio.', 422, 'FACEBOOK_IMAGE_TYPE_INVALID');
      const declared = Number(response.headers.get('content-length') || 0); if (declared > this.maxImageBytes) throw new AppError('La imagen supera 10 MB.', 422, 'FACEBOOK_IMAGE_TOO_LARGE');
      const chunks=[]; let total=0; const reader=response.body.getReader();
      while (true) { const {done,value}=await reader.read(); if(done)break; total+=value.byteLength; if(total>this.maxImageBytes){reader.cancel();throw new AppError('La imagen supera 10 MB.',422,'FACEBOOK_IMAGE_TOO_LARGE');} chunks.push(Buffer.from(value)); }
      return { bytes: Buffer.concat(chunks).toString('base64'), url: current.toString(), type };
    }
    throw new AppError('La imagen tiene demasiadas redirecciones.', 422, 'FACEBOOK_IMAGE_REDIRECTS');
  }
}

export class FacebookAdsService {
  constructor({
    fetchImpl = globalThis.fetch,
    graphBaseUrl = 'https://graph.facebook.com',
    graphClientFactory = null,
    assetPolicy = null,
    timeoutMs = 20000,
  } = {}) {
    this.fetch = fetchImpl;
    this.graphBaseUrl = String(graphBaseUrl || 'https://graph.facebook.com').replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.graphClientFactory = graphClientFactory || (token => new MetaGraphClient(token, { fetchImpl: this.fetch, baseUrl: this.graphBaseUrl, timeoutMs: this.timeoutMs }));
    this.assetPolicy = assetPolicy || new PublicAdAssetPolicy({ fetchImpl: this.fetch });
  }
  graph(accessToken) { return this.graphClientFactory(accessToken); }
  oauthConfigured() { return Boolean(config.facebookAds.appId && config.facebookAds.appSecret); }
  safeIntegration(integration) {
    if (!integration) return null;
    const data = integration.toObject ? integration.toObject() : { ...integration };
    delete data.accessToken;
    return {
      _id: data._id, provider: data.provider, connectionMode: data.connectionMode, status: data.status,
      externalUserId: data.externalUserId, externalUserName: data.externalUserName, scopes: data.scopes || [],
      selectedAdAccountId: data.selectedAdAccountId || '', selectedPageId: data.selectedPageId || '',
      adAccounts: data.adAccounts || [], pages: data.pages || [], tokenExpiresAt: data.tokenExpiresAt || null,
      lastValidatedAt: data.lastValidatedAt || null, lastError: data.lastError || '',
    };
  }
  async integration(storeId, { withToken = false } = {}) {
    const query = SocialIntegration.findOne({ storeId, provider: 'facebook' });
    if (withToken) query.select('+accessToken');
    return query;
  }
  async status(storeId) {
    const [integration, ads] = await Promise.all([
      this.integration(storeId),
      SocialAd.find({ storeId, provider: 'facebook' }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return {
      provider: 'facebook', available: true, oauthConfigured: this.oauthConfigured(), sandboxAllowed: config.facebookAds.sandboxEnabled,
      apiVersion: config.facebookAds.graphVersion, redirectUri: config.facebookAds.redirectUri,
      requiredScopes: [...OAUTH_SCOPES], integration: this.safeIntegration(integration), ads,
    };
  }
  async createOAuthUrl(store, user) {
    if (!this.oauthConfigured()) throw new AppError('Facebook todavía no está configurado en el servidor. Completá META_APP_ID y META_APP_SECRET.', 503, 'FACEBOOK_NOT_CONFIGURED');
    const rawState = randomToken();
    await SocialOAuthState.create({ tokenHash: hashToken(rawState), provider: 'facebook', storeId: store._id, userId: user._id, expiresAt: new Date(Date.now() + 10 * 60000) });
    const url = new URL(`https://www.facebook.com/${config.facebookAds.graphVersion}/dialog/oauth`);
    url.searchParams.set('client_id', config.facebookAds.appId);
    url.searchParams.set('redirect_uri', config.facebookAds.redirectUri);
    url.searchParams.set('state', rawState);
    url.searchParams.set('response_type', 'code');
    if (config.facebookAds.loginConfigId) {
      url.searchParams.set('config_id', config.facebookAds.loginConfigId);
      url.searchParams.set('override_default_response_type', 'true');
    } else url.searchParams.set('scope', OAUTH_SCOPES.join(','));
    return { authUrl: url.toString(), redirectUri: config.facebookAds.redirectUri };
  }
  async exchangeCode(code) {
    const url = new URL(`${this.graphBaseUrl}/${config.facebookAds.graphVersion}/oauth/access_token`);
    url.searchParams.set('client_id', config.facebookAds.appId); url.searchParams.set('client_secret', config.facebookAds.appSecret);
    url.searchParams.set('redirect_uri', config.facebookAds.redirectUri); url.searchParams.set('code', code);
    let response;
    try { response = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch { throw new AppError('No se pudo completar la autorización con Facebook.', 503, 'FACEBOOK_UNAVAILABLE'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new AppError(cleanGraphError(payload), 422, 'FACEBOOK_OAUTH_FAILED');
    let accessToken = payload.access_token, expiresIn = Number(payload.expires_in || 0);
    try {
      const longUrl = new URL(`${this.graphBaseUrl}/${config.facebookAds.graphVersion}/oauth/access_token`);
      longUrl.searchParams.set('grant_type', 'fb_exchange_token'); longUrl.searchParams.set('client_id', config.facebookAds.appId); longUrl.searchParams.set('client_secret', config.facebookAds.appSecret); longUrl.searchParams.set('fb_exchange_token', accessToken);
      const longResponse = await this.fetch(longUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
      const longPayload = await longResponse.json().catch(() => ({}));
      if (longResponse.ok && longPayload.access_token) { accessToken = longPayload.access_token; expiresIn = Number(longPayload.expires_in || expiresIn); }
    } catch { /* El token corto sigue siendo válido si el intercambio largo no está disponible. */ }
    return { accessToken, expiresIn };
  }
  async assets(accessToken) {
    const graph = this.graph(accessToken);
    const [me, accounts, pages, permissions] = await Promise.all([
      graph.get('me', { fields: 'id,name' }),
      graph.get('me/adaccounts', { fields: 'id,account_id,name,currency,account_status', limit: 100 }),
      graph.get('me/accounts', { fields: 'id,name', limit: 100 }),
      graph.get('me/permissions').catch(() => ({ data: [] })),
    ]);
    return {
      me,
      adAccounts: (accounts.data || []).map(item => ({ id: normalizeAdAccountId(item.id || item.account_id), accountId: String(item.account_id || '').replace(/^act_/, ''), name: item.name || `Cuenta ${item.account_id || item.id}`, currency: item.currency || '', accountStatus: Number(item.account_status || 0) })),
      pages: (pages.data || []).map(item => ({ id: String(item.id), name: item.name || `Página ${item.id}` })),
      scopes: (permissions.data || []).filter(item => item.status === 'granted').map(item => item.permission),
    };
  }
  async completeOAuth({ state, code, user }) {
    const pending = await SocialOAuthState.findOneAndDelete({ tokenHash: hashToken(state || ''), provider: 'facebook', userId: user._id, expiresAt: { $gt: new Date() } });
    if (!pending) throw new AppError('La autorización de Facebook venció o no corresponde a esta sesión.', 400, 'FACEBOOK_OAUTH_STATE_INVALID');
    const store = await Store.findOne({ _id: pending.storeId, archived: { $ne: true } });
    if (!store || (user.role !== 'admin' && String(store.ownerId) !== String(user._id))) throw new AppError('La tienda ya no está disponible.', 404, 'STORE_NOT_FOUND');
    const { accessToken, expiresIn } = await this.exchangeCode(code);
    const assets = await this.assets(accessToken);
    const required = ['ads_management', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads'];
    const missing = required.filter(scope => !assets.scopes.includes(scope));
    if (missing.length) throw new AppError(`Facebook no concedió todos los permisos necesarios: ${missing.join(', ')}.`, 422, 'FACEBOOK_PERMISSIONS_MISSING');
    if (!assets.adAccounts.length) throw new AppError('La cuenta conectada no tiene cuentas publicitarias disponibles para esta aplicación.', 422, 'FACEBOOK_NO_AD_ACCOUNTS');
    const activeAccounts = assets.adAccounts.filter(activeAdAccount);
    if (!activeAccounts.length) throw new AppError('Facebook no devolvió ninguna cuenta publicitaria activa para esta conexión.', 422, 'FACEBOOK_NO_ACTIVE_AD_ACCOUNTS');
    if (!assets.pages.length) throw new AppError('La cuenta conectada no tiene Páginas de Facebook disponibles. Se necesita una Página para crear el anuncio.', 422, 'FACEBOOK_NO_PAGES');
    const existing = await this.integration(store._id);
    const selectedAdAccountId = activeAccounts.some(item => item.id === existing?.selectedAdAccountId) ? existing.selectedAdAccountId : activeAccounts.length === 1 ? activeAccounts[0].id : '';
    const selectedPageId = assets.pages.some(item => item.id === existing?.selectedPageId) ? existing.selectedPageId : assets.pages.length === 1 ? assets.pages[0].id : '';
    await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: 'facebook' }, { $set: {
      connectionMode: 'oauth', status: 'connected', accessToken: encryptSecret(accessToken), tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      externalUserId: String(assets.me.id || ''), externalUserName: assets.me.name || '', scopes: assets.scopes,
      adAccounts: assets.adAccounts, pages: assets.pages, selectedAdAccountId, selectedPageId, connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return store;
  }
  async connectSandbox(store, user, { accessToken, adAccountId, pageId }) {
    if (!config.facebookAds.sandboxEnabled) throw new AppError('La conexión manual de Sandbox está deshabilitada en este entorno.', 403, 'FACEBOOK_SANDBOX_DISABLED');
    const accountId = normalizeAdAccountId(adAccountId), normalizedPageId = normalizePageId(pageId);
    const graph = this.graph(accessToken);
    const [account, page] = await Promise.all([
      graph.get(accountId, { fields: 'id,account_id,name,currency,account_status' }),
      graph.get(normalizedPageId, { fields: 'id,name' }),
    ]);
    if (!activeAdAccount(account)) throw new AppError('La cuenta publicitaria de Facebook no está activa. Revisala en Meta Ads Manager antes de conectarla.', 422, 'FACEBOOK_AD_ACCOUNT_INACTIVE');
    const integration = await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: 'facebook' }, { $set: {
      connectionMode: 'sandbox', status: 'connected', accessToken: encryptSecret(accessToken), tokenExpiresAt: null,
      externalUserId: '', externalUserName: 'Marketing API Sandbox', scopes: ['ads_management'],
      adAccounts: [{ id: accountId, accountId: String(account.account_id || accountId).replace(/^act_/, ''), name: account.name || `Sandbox ${accountId}`, currency: account.currency || '', accountStatus: Number(account.account_status || 0) }],
      pages: [{ id: normalizedPageId, name: page.name || `Página ${normalizedPageId}` }], selectedAdAccountId: accountId, selectedPageId: normalizedPageId,
      connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return this.safeIntegration(integration);
  }
  async refresh(storeId) {
    const integration = await this.integration(storeId, { withToken: true });
    if (!integration) throw new AppError('Conectá Facebook antes de actualizar los activos.', 404, 'FACEBOOK_NOT_CONNECTED');
    const token = decryptSecret(integration.accessToken);
    if (integration.connectionMode === 'sandbox') {
      const graph = this.graph(token); const accountId = normalizeAdAccountId(integration.selectedAdAccountId); const pageId = normalizePageId(integration.selectedPageId);
      const [account, page] = await Promise.all([graph.get(accountId, { fields: 'id,account_id,name,currency,account_status' }), graph.get(pageId, { fields: 'id,name' })]);
      if (!activeAdAccount(account)) {
        integration.status = 'error'; integration.lastError = 'La cuenta publicitaria de Facebook ya no está activa.'; integration.lastValidatedAt = new Date(); await integration.save();
        throw new AppError(integration.lastError, 422, 'FACEBOOK_AD_ACCOUNT_INACTIVE');
      }
      integration.adAccounts = [{ id: accountId, accountId: String(account.account_id || accountId).replace(/^act_/, ''), name: account.name || `Sandbox ${accountId}`, currency: account.currency || '', accountStatus: Number(account.account_status || 0) }];
      integration.pages = [{ id: pageId, name: page.name || `Página ${pageId}` }]; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save();
      return this.safeIntegration(integration);
    }
    try {
      const assets = await this.assets(token); integration.externalUserId = String(assets.me.id || ''); integration.externalUserName = assets.me.name || ''; integration.scopes = assets.scopes; integration.adAccounts = assets.adAccounts; integration.pages = assets.pages;
      const activeAccounts = assets.adAccounts.filter(activeAdAccount);
      if (!activeAccounts.length) throw new AppError('Facebook no devolvió ninguna cuenta publicitaria activa para esta conexión.', 422, 'FACEBOOK_NO_ACTIVE_AD_ACCOUNTS');
      if (!activeAccounts.some(item => item.id === integration.selectedAdAccountId)) integration.selectedAdAccountId = activeAccounts.length === 1 ? activeAccounts[0].id : '';
      if (!assets.pages.some(item => item.id === integration.selectedPageId)) integration.selectedPageId = assets.pages.length === 1 ? assets.pages[0].id : '';
      integration.status = 'connected'; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save(); return this.safeIntegration(integration);
    } catch (error) { integration.status = 'error'; integration.lastError = error.message; await integration.save(); throw error; }
  }
  async selectAssets(storeId, { adAccountId, pageId }) {
    const integration = await this.integration(storeId);
    if (!integration) throw new AppError('Conectá Facebook antes de elegir los activos.', 404, 'FACEBOOK_NOT_CONNECTED');
    const accountId = normalizeAdAccountId(adAccountId), normalizedPageId = normalizePageId(pageId);
    const account = (integration.adAccounts || []).find(item => item.id === accountId);
    if (!account) throw new AppError('La cuenta publicitaria no pertenece a la conexión actual.', 422, 'FACEBOOK_AD_ACCOUNT_NOT_AVAILABLE');
    if (!activeAdAccount(account)) throw new AppError('La cuenta publicitaria seleccionada no está activa.', 422, 'FACEBOOK_AD_ACCOUNT_INACTIVE');
    if (!(integration.pages || []).some(item => item.id === normalizedPageId)) throw new AppError('La Página no pertenece a la conexión actual.', 422, 'FACEBOOK_PAGE_NOT_AVAILABLE');
    integration.selectedAdAccountId = accountId; integration.selectedPageId = normalizedPageId; await integration.save(); return this.safeIntegration(integration);
  }
  async disconnect(storeId) { await SocialIntegration.deleteOne({ storeId, provider: 'facebook' }); return { connected: false }; }
  async products(store) {
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, '');
    const rows = await Product.find({ storeId: store._id, archived: { $ne: true }, active: true }).select('name description images price').sort({ name: 1 }).limit(500).lean();
    return rows.map(item => ({ _id: item._id, name: item.name, description: item.description, price: item.price, imageUrl: (item.images || [])[0] || '', destinationUrl: `${base}/producto/${item._id}` }));
  }
  currencyScale(currency) {
    try { return 10 ** new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).resolvedOptions().maximumFractionDigits; }
    catch { return 100; }
  }
  async assertPublicDestinationUrl(rawUrl) {
    return this.assetPolicy.destination(rawUrl);
  }
  async assertPublicImageUrl(rawUrl) {
    return this.assetPolicy.image(rawUrl);
  }
  async createTrafficAd(store, user, { productId, name, primaryText, headline, dailyBudget, countryCode = 'AR' }) {
    const integration = await this.integration(store._id, { withToken: true });
    if (!integration || integration.status !== 'connected') throw new AppError('Conectá Facebook antes de crear un anuncio.', 422, 'FACEBOOK_NOT_CONNECTED');
    if (!integration.selectedAdAccountId || !integration.selectedPageId) throw new AppError('Elegí una cuenta publicitaria y una Página de Facebook antes de crear anuncios.', 422, 'FACEBOOK_ASSETS_REQUIRED');
    const product = await Product.findOne({ _id: productId, storeId: store._id, archived: { $ne: true }, active: true }).lean();
    if (!product) throw new AppError('El producto seleccionado no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const imageUrl = (product.images || [])[0]; if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) throw new AppError('El producto necesita una primera imagen pública HTTP/HTTPS para anunciarlo en Facebook.', 422, 'FACEBOOK_PRODUCT_IMAGE_REQUIRED');
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, ''); const destinationUrl = await this.assertPublicDestinationUrl(`${base}/producto/${product._id}`);
    const image = await this.assertPublicImageUrl(imageUrl); const token = decryptSecret(integration.accessToken); const graph = this.graph(token); const accountId = normalizeAdAccountId(integration.selectedAdAccountId);
    const account = (integration.adAccounts || []).find(item => item.id === accountId); const currency = account?.currency || 'ARS'; const scale = this.currencyScale(currency); const budgetMinor = Math.round(Number(dailyBudget) * scale);
    if (account && !activeAdAccount(account)) throw new AppError('La cuenta publicitaria de Facebook seleccionada no está activa.', 422, 'FACEBOOK_AD_ACCOUNT_INACTIVE');
    if (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0) throw new AppError('Ingresá un presupuesto diario válido.', 422, 'FACEBOOK_BUDGET_INVALID');
    let campaignId='';
    try {
      const campaign = await graph.post(`${accountId}/campaigns`, { name, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', buying_type: 'AUCTION', special_ad_categories: [] }); campaignId = campaign.id;
      const adSet = await graph.post(`${accountId}/adsets`, { name: `${name} · Público`, campaign_id: campaign.id, daily_budget: String(budgetMinor), billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', targeting: { geo_locations: { countries: [countryCode] }, age_min: 18, age_max: 65, publisher_platforms: ['facebook'] }, status: 'PAUSED' });
      const uploaded = await graph.post(`${accountId}/adimages`, { bytes: image.bytes }); const imageRecord = Object.values(uploaded.images || {})[0]; if (!imageRecord?.hash) throw new AppError('Facebook recibió la imagen pero no devolvió su identificador.', 422, 'FACEBOOK_IMAGE_UPLOAD_FAILED');
      const creative = await graph.post(`${accountId}/adcreatives`, { name: `${name} · Creativo`, object_story_spec: { page_id: integration.selectedPageId, link_data: { link: destinationUrl, message: primaryText, name: headline || product.name, image_hash: imageRecord.hash, call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } } } } });
      const ad = await graph.post(`${accountId}/ads`, { name, adset_id: adSet.id, creative: { creative_id: creative.id }, status: 'PAUSED' });
      return SocialAd.create({ storeId: store._id, provider: 'facebook', createdBy: user._id, productId: product._id, name, primaryText, headline, destinationUrl, imageUrl: image.url, dailyBudget: Number(dailyBudget), currency, countryCode, status: 'paused', external: { adAccountId: accountId, pageId: integration.selectedPageId, campaignId: campaign.id, adSetId: adSet.id, creativeId: creative.id, adId: ad.id, imageHash: imageRecord.hash } });
    } catch (error) {
      if (campaignId) await graph.delete(campaignId).catch(() => {});
      throw error;
    }
  }
}

export const facebookAdsService = new FacebookAdsService();

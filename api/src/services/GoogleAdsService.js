import { config } from '../config.js';
import { Product, SocialAd, SocialIntegration, SocialOAuthState, Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret, encryptSecret, hashToken, randomToken } from '../utils/crypto.js';
import { domainService } from './DomainService.js';
import { PublicAdAssetPolicy } from './FacebookAdsService.js';

const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const cleanId = value => {
  const raw = String(value || '').trim().replace(/^customers\//, '').replace(/-/g, '');
  if (!/^\d+$/.test(raw)) throw new AppError('Seleccioná una cuenta de Google Ads válida.', 422, 'GOOGLE_ADS_CUSTOMER_INVALID');
  return raw;
};
const textSlice = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const errorMessage = payload => {
  const error = payload?.error || {};
  const detail = Array.isArray(error.details) ? error.details.flatMap(item => item?.errors || []).find(Boolean) : null;
  return String(detail?.message || error.message || payload?.message || 'Google Ads rechazó la operación.').slice(0, 700);
};
const resourceId = (resourceName, marker = '/') => {
  const value = String(resourceName || '');
  const tail = value.split(marker).at(-1) || '';
  return tail.includes('~') ? tail.split('~').at(-1) : tail;
};

export class GoogleAdsApiClient {
  constructor(accessToken = '', { fetchImpl = globalThis.fetch, baseUrl = 'https://googleads.googleapis.com', apiVersion = config.googleAds.apiVersion, timeoutMs = 20000 } = {}) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl || 'https://googleads.googleapis.com').replace(/\/$/, '');
    this.apiVersion = apiVersion;
    this.timeoutMs = timeoutMs;
  }
  url(path) { return `${this.baseUrl}/${this.apiVersion}/${String(path).replace(/^\//, '')}`; }
  async request(path, { method = 'GET', body, loginCustomerId = '' } = {}) {
    let response;
    try {
      response = await this.fetch(this.url(path), {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(loginCustomerId ? { 'login-customer-id': cleanId(loginCustomerId) } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AppError(`No se pudo conectar con Google Ads${error?.name === 'TimeoutError' ? ': la solicitud tardó demasiado.' : '.'}`, 503, 'GOOGLE_ADS_UNAVAILABLE');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) throw new AppError(errorMessage(payload), response.status >= 500 ? 503 : 422, 'GOOGLE_ADS_API_ERROR', { googleStatus: payload?.error?.status, googleCode: payload?.error?.code });
    return payload;
  }
  listAccessibleCustomers() { return this.request('customers:listAccessibleCustomers'); }
  search(customerId, query, loginCustomerId = '') { return this.request(`customers/${cleanId(customerId)}/googleAds:search`, { method: 'POST', body: { query }, loginCustomerId }); }
  mutate(customerId, mutateOperations, loginCustomerId = '') { return this.request(`customers/${cleanId(customerId)}/googleAds:mutate`, { method: 'POST', body: { mutateOperations, partialFailure: false, validateOnly: false }, loginCustomerId }); }
  suggestGeo(countryCode, locationName) { return this.request('geoTargetConstants:suggest', { method: 'POST', body: { locale: 'en', countryCode, locationNames: { names: [locationName] } } }); }
}

export class GoogleAdsService {
  constructor({
    provider = 'google',
    fetchImpl = globalThis.fetch,
    apiBaseUrl = 'https://googleads.googleapis.com',
    oauthTokenUrl = 'https://oauth2.googleapis.com/token',
    oauthAuthorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth',
    apiClientFactory = null,
    assetPolicy = null,
    timeoutMs = 20000,
  } = {}) {
    this.provider = provider;
    this.fetch = fetchImpl;
    this.apiBaseUrl = String(apiBaseUrl || 'https://googleads.googleapis.com').replace(/\/$/, '');
    this.oauthTokenUrl = oauthTokenUrl;
    this.oauthAuthorizeUrl = oauthAuthorizeUrl;
    this.timeoutMs = timeoutMs;
    this.apiClientFactory = apiClientFactory || (token => new GoogleAdsApiClient(token, { fetchImpl: this.fetch, baseUrl: this.apiBaseUrl, timeoutMs: this.timeoutMs }));
    this.assetPolicy = assetPolicy || new PublicAdAssetPolicy({ fetchImpl: this.fetch });
  }
  api(accessToken) { return this.apiClientFactory(accessToken); }
  redirectUri() { return this.provider === 'youtube' ? config.googleAds.youtubeRedirectUri : config.googleAds.redirectUri; }
  label() { return this.provider === 'youtube' ? 'YouTube Ads' : 'Google Ads'; }
  prefix() { return this.provider === 'youtube' ? 'YOUTUBE_ADS' : 'GOOGLE_ADS'; }
  oauthConfigured() { return Boolean(config.googleAds.clientId && config.googleAds.clientSecret); }
  safeIntegration(integration) {
    if (!integration) return null;
    const data = integration.toObject ? integration.toObject() : { ...integration };
    delete data.accessToken; delete data.refreshToken;
    return {
      _id: data._id, provider: data.provider, connectionMode: data.connectionMode, status: data.status,
      externalUserId: data.externalUserId || '', externalUserName: data.externalUserName || '', scopes: data.scopes || [],
      selectedAdAccountId: data.selectedAdAccountId || '', selectedManagerCustomerId: data.selectedManagerCustomerId || '',
      adAccounts: data.adAccounts || [], tokenExpiresAt: data.tokenExpiresAt || null,
      lastValidatedAt: data.lastValidatedAt || null, lastError: data.lastError || '',
    };
  }
  async integration(storeId, { withToken = false } = {}) {
    const query = SocialIntegration.findOne({ storeId, provider: this.provider });
    if (withToken) query.select('+accessToken +refreshToken');
    return query;
  }
  async status(storeId) {
    const [integration, ads] = await Promise.all([
      this.integration(storeId),
      SocialAd.find({ storeId, provider: this.provider }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return {
      provider: this.provider, available: true, oauthConfigured: this.oauthConfigured(), apiVersion: config.googleAds.apiVersion,
      redirectUri: this.redirectUri(), requiredScopes: [GOOGLE_ADS_SCOPE], integration: this.safeIntegration(integration), ads,
    };
  }
  async createOAuthUrl(store, user) {
    if (!this.oauthConfigured()) throw new AppError(`${this.label()} todavía no está disponible. Contactá a la administración.`, 503, `${this.prefix()}_NOT_CONFIGURED`);
    const rawState = randomToken();
    await SocialOAuthState.create({ tokenHash: hashToken(rawState), provider: this.provider, storeId: store._id, userId: user._id, expiresAt: new Date(Date.now() + 10 * 60000) });
    const url = new URL(this.oauthAuthorizeUrl);
    url.searchParams.set('client_id', config.googleAds.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_ADS_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', rawState);
    url.searchParams.set('include_granted_scopes', 'true');
    return { authUrl: url.toString(), redirectUri: this.redirectUri() };
  }
  async tokenRequest(params) {
    let response;
    try {
      response = await this.fetch(this.oauthTokenUrl, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch { throw new AppError(`No se pudo completar la autorización con ${this.label()}.`, 503, `${this.prefix()}_UNAVAILABLE`); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new AppError(String(payload.error_description || payload.error || 'Google rechazó la autorización.').slice(0, 700), 422, `${this.prefix()}_OAUTH_FAILED`);
    return payload;
  }
  async exchangeCode(code) {
    const payload = await this.tokenRequest({ client_id: config.googleAds.clientId, client_secret: config.googleAds.clientSecret, code, grant_type: 'authorization_code', redirect_uri: this.redirectUri() });
    return { accessToken: payload.access_token, refreshToken: payload.refresh_token || '', expiresIn: Number(payload.expires_in || 3600), scopes: String(payload.scope || GOOGLE_ADS_SCOPE).split(/\s+/).filter(Boolean) };
  }
  async refreshAccessToken(refreshToken) {
    const payload = await this.tokenRequest({ client_id: config.googleAds.clientId, client_secret: config.googleAds.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    return { accessToken: payload.access_token, expiresIn: Number(payload.expires_in || 3600) };
  }
  async tokenFor(integration) {
    let token = decryptSecret(integration.accessToken);
    if (!integration.tokenExpiresAt || integration.tokenExpiresAt.getTime() > Date.now() + 60000) return token;
    const refreshToken = decryptSecret(integration.refreshToken || '');
    if (!refreshToken) throw new AppError(`Volvé a conectar ${this.label()} para renovar la autorización.`, 422, `${this.prefix()}_REAUTH_REQUIRED`);
    const refreshed = await this.refreshAccessToken(refreshToken);
    token = refreshed.accessToken;
    integration.accessToken = encryptSecret(token);
    integration.tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
    await integration.save();
    return token;
  }
  accountFromCustomer(customer, managerCustomerId = '') {
    const id = cleanId(customer?.id || customer?.resourceName || '');
    return {
      id, accountId: id, name: customer?.descriptiveName || `Google Ads ${id}`, currency: customer?.currencyCode || '',
      accountStatus: String(customer?.status || '') === 'ENABLED' ? 1 : 0,
      managerCustomerId: managerCustomerId ? cleanId(managerCustomerId) : '', manager: Boolean(customer?.manager), testAccount: Boolean(customer?.testAccount),
    };
  }
  async discoverAccounts(accessToken) {
    const api = this.api(accessToken);
    const accessible = await api.listAccessibleCustomers();
    const roots = (accessible.resourceNames || []).map(cleanId);
    const accounts = [];
    for (const rootId of roots.slice(0, 50)) {
      let own;
      try {
        const result = await api.search(rootId, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status, customer.manager, customer.test_account FROM customer LIMIT 1');
        own = result.results?.[0]?.customer;
      } catch { continue; }
      if (!own) continue;
      if (!own.manager) { const account = this.accountFromCustomer(own); if (account.accountStatus === 1) accounts.push(account); continue; }
      try {
        const children = await api.search(rootId, 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status, customer_client.manager, customer_client.level, customer_client.test_account FROM customer_client WHERE customer_client.level <= 1');
        for (const row of children.results || []) {
          const child = row.customerClient;
          if (!child || child.manager || String(child.id) === rootId) continue;
          const account = this.accountFromCustomer(child, rootId); if (account.accountStatus === 1) accounts.push(account);
        }
      } catch { /* una cuenta manager sin acceso a sus hijos no invalida otros activos */ }
    }
    return [...new Map(accounts.map(item => [item.id, item])).values()];
  }
  async completeOAuth({ state, code, user }) {
    const pending = await SocialOAuthState.findOneAndDelete({ tokenHash: hashToken(state || ''), provider: this.provider, userId: user._id, expiresAt: { $gt: new Date() } });
    if (!pending) throw new AppError(`La autorización de ${this.label()} venció o no corresponde a esta sesión.`, 400, `${this.prefix()}_OAUTH_STATE_INVALID`);
    const store = await Store.findOne({ _id: pending.storeId, archived: { $ne: true } });
    if (!store || (user.role !== 'admin' && String(store.ownerId) !== String(user._id))) throw new AppError('La tienda ya no está disponible.', 404, 'STORE_NOT_FOUND');
    const token = await this.exchangeCode(code);
    if (!token.refreshToken) throw new AppError(`Google no devolvió permiso de acceso sin conexión. Volvé a conectar ${this.label()} y aceptá el acceso solicitado.`, 422, `${this.prefix()}_REFRESH_TOKEN_REQUIRED`);
    const accounts = await this.discoverAccounts(token.accessToken);
    if (!accounts.length) throw new AppError('No encontramos ninguna cuenta publicitaria activa de Google Ads para esta conexión.', 422, `${this.prefix()}_NO_ACTIVE_ACCOUNTS`);
    const existing = await this.integration(store._id);
    const selected = accounts.find(item => item.id === existing?.selectedAdAccountId) || (accounts.length === 1 ? accounts[0] : null);
    const integration = await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: this.provider }, { $set: {
      connectionMode: 'oauth', status: 'connected', accessToken: encryptSecret(token.accessToken), refreshToken: encryptSecret(token.refreshToken),
      tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000), externalUserName: 'Google Ads', scopes: token.scopes,
      adAccounts: accounts, selectedAdAccountId: selected?.id || '', selectedManagerCustomerId: selected?.managerCustomerId || '',
      connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return store;
  }
  async refresh(storeId) {
    const integration = await this.integration(storeId, { withToken: true });
    if (!integration) throw new AppError(`Conectá ${this.label()} antes de actualizar las cuentas.`, 404, `${this.prefix()}_NOT_CONNECTED`);
    try {
      const accessToken = await this.tokenFor(integration);
      const accounts = await this.discoverAccounts(accessToken);
      if (!accounts.length) throw new AppError('No encontramos ninguna cuenta publicitaria activa de Google Ads.', 422, `${this.prefix()}_NO_ACTIVE_ACCOUNTS`);
      integration.adAccounts = accounts;
      const selected = accounts.find(item => item.id === integration.selectedAdAccountId) || (accounts.length === 1 ? accounts[0] : null);
      integration.selectedAdAccountId = selected?.id || '';
      integration.selectedManagerCustomerId = selected?.managerCustomerId || '';
      integration.status = 'connected'; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save();
      return this.safeIntegration(integration);
    } catch (error) { integration.status = 'error'; integration.lastError = error.message; integration.lastValidatedAt = new Date(); await integration.save(); throw error; }
  }
  async selectAssets(storeId, { adAccountId }) {
    const integration = await this.integration(storeId);
    if (!integration) throw new AppError(`Conectá ${this.label()} antes de elegir la cuenta.`, 404, `${this.prefix()}_NOT_CONNECTED`);
    const customerId = cleanId(adAccountId);
    const account = (integration.adAccounts || []).find(item => item.id === customerId && Number(item.accountStatus) === 1);
    if (!account) throw new AppError('La cuenta publicitaria no pertenece a la conexión actual o no está activa.', 422, `${this.prefix()}_ACCOUNT_NOT_AVAILABLE`);
    integration.selectedAdAccountId = customerId; integration.selectedManagerCustomerId = account.managerCustomerId || ''; await integration.save();
    return this.safeIntegration(integration);
  }
  async disconnect(storeId) { await SocialIntegration.deleteOne({ storeId, provider: this.provider }); return { connected: false }; }
  async products(store) {
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, '');
    const rows = await Product.find({ storeId: store._id, archived: { $ne: true }, active: true }).select('name description images price').sort({ name: 1 }).limit(500).lean();
    return rows.map(item => ({ _id: item._id, name: item.name, description: item.description, price: item.price, imageUrl: (item.images || [])[0] || '', destinationUrl: `${base}/producto/${item._id}` }));
  }
  async publicDestination(rawUrl) {
    try { return await this.assetPolicy.destination(rawUrl); }
    catch (error) { throw new AppError(String(error.message || 'La ficha del producto no es accesible públicamente.').replace(/Meta/g, this.label()), error.status || 422, `${this.prefix()}_DESTINATION_INVALID`); }
  }
  async publicImage(rawUrl) {
    try { return await this.assetPolicy.image(rawUrl); }
    catch (error) { throw new AppError(String(error.message || 'La imagen no es accesible públicamente.').replace(/Meta/g, this.label()), error.status || 422, `${this.prefix()}_IMAGE_INVALID`); }
  }
  async geoTarget(api, countryCode) {
    const code = String(countryCode || 'AR').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new AppError('Ingresá un código de país ISO de dos letras.', 422, `${this.prefix()}_COUNTRY_INVALID`);
    let countryName = code;
    try { countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { /* conserva el código */ }
    const response = await api.suggestGeo(code, countryName);
    const suggestions = response.geoTargetConstantSuggestions || response.geo_target_constant_suggestions || [];
    const match = suggestions.map(item => item.geoTargetConstant || item.geo_target_constant).find(item => item && String(item.countryCode || item.country_code || '').toUpperCase() === code && String(item.targetType || item.target_type || '').toUpperCase() === 'COUNTRY' && String(item.status || '').toUpperCase() === 'ENABLED');
    if (!match?.resourceName && !match?.resource_name) throw new AppError(`Google Ads no devolvió un destino geográfico utilizable para ${code}.`, 422, `${this.prefix()}_COUNTRY_NOT_TARGETABLE`);
    return String(match.resourceName || match.resource_name);
  }
  resultResource(response, key) {
    const rows = response?.mutateOperationResponses || response?.mutate_operation_responses || [];
    const row = rows.find(item => item?.[key]?.resourceName || item?.[key]?.resource_name);
    return row?.[key]?.resourceName || row?.[key]?.resource_name || '';
  }
  async createTrafficAd(store, user, { productId, name, primaryText, headline, dailyBudget, countryCode = 'AR' }) {
    const integration = await this.integration(store._id, { withToken: true });
    if (!integration || integration.status !== 'connected') throw new AppError('Conectá Google Ads antes de crear un anuncio.', 422, 'GOOGLE_ADS_NOT_CONNECTED');
    if (!integration.selectedAdAccountId) throw new AppError('Elegí una cuenta publicitaria de Google Ads antes de crear anuncios.', 422, 'GOOGLE_ADS_ACCOUNT_REQUIRED');
    const product = await Product.findOne({ _id: productId, storeId: store._id, archived: { $ne: true }, active: true }).lean();
    if (!product) throw new AppError('El producto seleccionado no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, '');
    const destinationUrl = await this.publicDestination(`${base}/producto/${product._id}`);
    const account = (integration.adAccounts || []).find(item => item.id === integration.selectedAdAccountId);
    if (!account || Number(account.accountStatus) !== 1) throw new AppError('La cuenta publicitaria de Google Ads seleccionada no está activa.', 422, 'GOOGLE_ADS_ACCOUNT_INACTIVE');
    const amountMicros = Math.round(Number(dailyBudget) * 1_000_000);
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) throw new AppError('Ingresá un presupuesto diario válido.', 422, 'GOOGLE_ADS_BUDGET_INVALID');
    const accessToken = await this.tokenFor(integration); const api = this.api(accessToken); const customerId = cleanId(account.id); const managerId = account.managerCustomerId || integration.selectedManagerCustomerId || '';
    const geo = await this.geoTarget(api, countryCode);
    const budgetRn = `customers/${customerId}/campaignBudgets/-1`; const campaignRn = `customers/${customerId}/campaigns/-2`; const adGroupRn = `customers/${customerId}/adGroups/-3`;
    const h1 = textSlice(headline || product.name, 30) || 'Conocé este producto';
    const h2 = textSlice(`${product.name} online`, 30) || 'Comprá online';
    const h3 = textSlice(`Visitá ${store.name}`, 30) || 'Visitá nuestra tienda';
    const d1 = textSlice(primaryText || product.description || `Conocé ${product.name} en nuestra tienda.`, 90) || 'Conocé este producto en nuestra tienda online.';
    const d2 = textSlice(`Encontrá ${product.name} y más productos en ${store.name}.`, 90) || 'Conocé nuestros productos online.';
    const keyword = textSlice(product.name, 80) || textSlice(store.name, 80);
    const operations = [
      { campaignBudgetOperation: { create: { resourceName: budgetRn, name: `${name} · Presupuesto`, amountMicros: String(amountMicros), explicitlyShared: false } } },
      { campaignOperation: { create: { resourceName: campaignRn, name, status: 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: budgetRn, targetSpend: {}, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false }, containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' } } },
      { campaignCriterionOperation: { create: { campaign: campaignRn, location: { geoTargetConstant: geo } } } },
      { adGroupOperation: { create: { resourceName: adGroupRn, name: `${name} · Grupo`, campaign: campaignRn, status: 'PAUSED', type: 'SEARCH_STANDARD' } } },
      { adGroupCriterionOperation: { create: { adGroup: adGroupRn, status: 'PAUSED', keyword: { text: keyword, matchType: 'PHRASE' } } } },
      { adGroupAdOperation: { create: { adGroup: adGroupRn, status: 'PAUSED', ad: { name: `${name} · Anuncio`, finalUrls: [destinationUrl], responsiveSearchAd: { headlines: [{ text: h1 }, { text: h2 }, { text: h3 }], descriptions: [{ text: d1 }, { text: d2 }] } } } } },
    ];
    const response = await api.mutate(customerId, operations, managerId);
    const campaignResource = this.resultResource(response, 'campaignResult'); const adGroupResource = this.resultResource(response, 'adGroupResult'); const adResource = this.resultResource(response, 'adGroupAdResult'); const budgetResource = this.resultResource(response, 'campaignBudgetResult'); const criterionResource = this.resultResource(response, 'adGroupCriterionResult') || this.resultResource(response, 'campaignCriterionResult');
    if (!campaignResource || !adResource) throw new AppError('Google Ads creó una respuesta incompleta para la campaña.', 502, 'GOOGLE_ADS_MUTATE_INCOMPLETE');
    return SocialAd.create({ storeId: store._id, provider: 'google', createdBy: user._id, productId: product._id, name, primaryText, headline, destinationUrl, imageUrl: '', dailyBudget: Number(dailyBudget), currency: account.currency || '', countryCode: String(countryCode).toUpperCase(), status: 'paused', external: { customerId, managerCustomerId: managerId, budgetId: resourceId(budgetResource), campaignId: resourceId(campaignResource), adGroupId: resourceId(adGroupResource), criterionId: resourceId(criterionResource), adId: resourceId(adResource, '~') } });
  }
}

export const googleAdsService = new GoogleAdsService();

import { config } from '../config.js';
import { Product, SocialAd, SocialIntegration, SocialOAuthState, Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret, encryptSecret, hashToken, randomToken } from '../utils/crypto.js';
import { domainService } from './DomainService.js';
import { PublicAdAssetPolicy } from './FacebookAdsService.js';

const normalizeAdvertiserId = value => {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) throw new AppError('Seleccioná una cuenta publicitaria válida de TikTok.', 422, 'TIKTOK_ADVERTISER_INVALID');
  return id;
};
const textSlice = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const responseData = payload => payload?.data || {};
const tiktokError = payload => String(payload?.message || payload?.msg || payload?.data?.message || 'TikTok Ads rechazó la operación.').slice(0, 700);
const listFrom = (value, ...keys) => {
  for (const key of keys) { const candidate = value?.[key]; if (Array.isArray(candidate)) return candidate; }
  return [];
};

export class TikTokMarketingClient {
  constructor(accessToken = '', { fetchImpl = globalThis.fetch, baseUrl = 'https://business-api.tiktok.com/open_api', apiVersion = config.tiktokAds.apiVersion, timeoutMs = 20000 } = {}) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl || 'https://business-api.tiktok.com/open_api').replace(/\/$/, '');
    this.apiVersion = apiVersion;
    this.timeoutMs = timeoutMs;
  }
  url(path) { return `${this.baseUrl}/${this.apiVersion}/${String(path).replace(/^\//, '')}`; }
  async request(path, { method = 'GET', params = {}, auth = true } = {}) {
    const url = new URL(this.url(path));
    let body;
    if (method === 'GET') {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      });
    } else body = JSON.stringify(params);
    let response;
    try {
      response = await this.fetch(url, {
        method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && this.accessToken ? { 'Access-Token': this.accessToken } : {}) },
        body, signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AppError(`No se pudo conectar con TikTok Ads${error?.name === 'TimeoutError' ? ': la solicitud tardó demasiado.' : '.'}`, 503, 'TIKTOK_UNAVAILABLE');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || Number(payload?.code ?? 0) !== 0) throw new AppError(tiktokError(payload), response.status >= 500 ? 503 : 422, 'TIKTOK_API_ERROR', { tiktokCode: payload?.code, requestId: payload?.request_id });
    return payload;
  }
  get(path, params) { return this.request(path, { params }); }
  post(path, params, auth = true) { return this.request(path, { method: 'POST', params, auth }); }
  accessToken(authCode) { return this.post('oauth2/access_token/', { app_id: config.tiktokAds.appId, secret: config.tiktokAds.appSecret, auth_code: authCode }, false); }
  refreshToken(refreshToken) { return this.post('oauth/token/', { app_id: config.tiktokAds.appId, secret: config.tiktokAds.appSecret, grant_type: 'refresh_token', refresh_token: refreshToken }, false); }
  authorizedAdvertisers() { return this.get('oauth2/advertiser/get/', { app_id: config.tiktokAds.appId, secret: config.tiktokAds.appSecret }); }
  advertiserInfo(ids) { return this.get('advertiser/info/', { advertiser_ids: ids }); }
  identities(advertiserId) { return this.get('identity/get/', { advertiser_id: advertiserId, page: 1, page_size: 100 }); }
  videos(advertiserId) { return this.get('file/video/ad/search/', { advertiser_id: advertiserId, page: 1, page_size: 100 }); }
  targeting(advertiserId, countryCode, countryName) { return this.post('tool/targeting/search/', { advertiser_id: advertiserId, objective_type: 'TRAFFIC', promotion_type: 'WEBSITE', placements: ['PLACEMENT_TIKTOK'], search_type: 'BATCH_REGION_SEARCH', keywords: [countryName], region_codes: [countryCode] }); }
}

/**
 * Integración de TikTok Ads. Mantiene OAuth/autorización, activos y anuncios por tienda.
 * El transporte es inyectable para que el mismo flujo productivo pueda validarse contra un mock HTTP.
 */
export class TikTokAdsService {
  constructor({ fetchImpl = globalThis.fetch, apiBaseUrl = 'https://business-api.tiktok.com/open_api', clientFactory = null, assetPolicy = null, timeoutMs = 20000 } = {}) {
    this.fetch = fetchImpl; this.apiBaseUrl = String(apiBaseUrl || 'https://business-api.tiktok.com/open_api').replace(/\/$/, ''); this.timeoutMs = timeoutMs;
    this.clientFactory = clientFactory || (token => new TikTokMarketingClient(token, { fetchImpl: this.fetch, baseUrl: this.apiBaseUrl, timeoutMs: this.timeoutMs }));
    this.assetPolicy = assetPolicy || new PublicAdAssetPolicy({ fetchImpl: this.fetch });
  }
  api(token) { return this.clientFactory(token); }
  oauthConfigured() { return Boolean(config.tiktokAds.appId && config.tiktokAds.appSecret && config.tiktokAds.authorizationUrl); }
  safeIntegration(integration) {
    if (!integration) return null;
    const data = integration.toObject ? integration.toObject() : { ...integration };
    delete data.accessToken; delete data.refreshToken;
    return {
      _id: data._id, provider: data.provider, connectionMode: data.connectionMode, status: data.status,
      externalUserId: data.externalUserId || '', externalUserName: data.externalUserName || '', scopes: data.scopes || [],
      selectedAdAccountId: data.selectedAdAccountId || '', selectedIdentityId: data.selectedIdentityId || '', selectedIdentityType: data.selectedIdentityType || '',
      adAccounts: data.adAccounts || [], identities: data.identities || [], videos: data.videos || [], tokenExpiresAt: data.tokenExpiresAt || null,
      lastValidatedAt: data.lastValidatedAt || null, lastError: data.lastError || '',
    };
  }
  async integration(storeId, { withToken = false } = {}) {
    const query = SocialIntegration.findOne({ storeId, provider: 'tiktok' }); if (withToken) query.select('+accessToken +refreshToken'); return query;
  }
  async status(storeId) {
    const [integration, ads] = await Promise.all([this.integration(storeId), SocialAd.find({ storeId, provider: 'tiktok' }).sort({ createdAt: -1 }).limit(30).lean()]);
    return { provider: 'tiktok', available: true, oauthConfigured: this.oauthConfigured(), apiVersion: config.tiktokAds.apiVersion, redirectUri: config.tiktokAds.redirectUri, integration: this.safeIntegration(integration), ads };
  }
  async createOAuthUrl(store, user) {
    if (!this.oauthConfigured()) throw new AppError('TikTok Ads todavía no está disponible. Contactá a la administración.', 503, 'TIKTOK_NOT_CONFIGURED');
    const rawState = randomToken();
    await SocialOAuthState.create({ tokenHash: hashToken(rawState), provider: 'tiktok', storeId: store._id, userId: user._id, expiresAt: new Date(Date.now() + 10 * 60000) });
    let url;
    try { url = new URL(config.tiktokAds.authorizationUrl); }
    catch { throw new AppError('La autorización de TikTok Ads no está configurada correctamente.', 503, 'TIKTOK_AUTH_URL_INVALID'); }
    url.searchParams.set('state', rawState);
    if (!url.searchParams.has('redirect_uri')) url.searchParams.set('redirect_uri', config.tiktokAds.redirectUri);
    return { authUrl: url.toString(), redirectUri: config.tiktokAds.redirectUri };
  }
  async exchangeCode(code) {
    const payload = await this.api('').accessToken(code); const data = responseData(payload);
    const accessToken = data.access_token || payload.access_token; const refreshToken = data.refresh_token || payload.refresh_token || '';
    if (!accessToken) throw new AppError('TikTok no devolvió un token de acceso.', 422, 'TIKTOK_OAUTH_FAILED');
    return { accessToken, refreshToken, expiresIn: Number(data.expires_in || payload.expires_in || 0), refreshExpiresIn: Number(data.refresh_token_expires_in || payload.refresh_token_expires_in || 0), scopes: String(data.scope || data.scopes || '').split(/[\s,]+/).filter(Boolean) };
  }
  async tokenFor(integration) {
    let token = decryptSecret(integration.accessToken);
    if (!integration.tokenExpiresAt || integration.tokenExpiresAt.getTime() > Date.now() + 60000) return token;
    const refreshToken = decryptSecret(integration.refreshToken || '');
    if (!refreshToken) throw new AppError('Volvé a conectar TikTok Ads para renovar la autorización.', 422, 'TIKTOK_REAUTH_REQUIRED');
    const payload = await this.api('').refreshToken(refreshToken); const data = responseData(payload); const accessToken = data.access_token || payload.access_token;
    if (!accessToken) throw new AppError('TikTok no pudo renovar la autorización.', 422, 'TIKTOK_REFRESH_FAILED');
    token = accessToken; integration.accessToken = encryptSecret(token); if (data.refresh_token) integration.refreshToken = encryptSecret(data.refresh_token); integration.tokenExpiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null; await integration.save(); return token;
  }
  normalizeAdvertisers(payload) {
    const data = responseData(payload); const list = listFrom(data, 'list', 'advertisers', 'advertiser_list');
    return list.map(item => { const rawStatus = item.status ?? item.operation_status ?? 'STATUS_ENABLE'; const normalized = String(rawStatus).toUpperCase(); const active = Number(rawStatus) === 1 || ['STATUS_ENABLE','ENABLE','ENABLED','ACTIVE'].includes(normalized); return { id: normalizeAdvertiserId(item.advertiser_id || item.id), accountId: String(item.advertiser_id || item.id), name: item.advertiser_name || item.name || `TikTok Ads ${item.advertiser_id || item.id}`, currency: item.currency || '', accountStatus: active ? 1 : 0 }; });
  }
  async advertisers(token) {
    const api = this.api(token); const granted = await api.authorizedAdvertisers(); const grantedAccounts = this.normalizeAdvertisers(granted); const ids = grantedAccounts.map(item => item.id);
    if (!ids.length) return [];
    try {
      const details = await api.advertiserInfo(ids); const enriched = this.normalizeAdvertisers(details); if (enriched.length) return enriched;
    } catch { /* los datos de oauth siguen siendo suficientes si advertiser/info no está disponible */ }
    return grantedAccounts;
  }
  normalizeIdentities(payload) {
    const data = responseData(payload); const list = listFrom(data, 'identity_list', 'list', 'identities');
    // Este flujo usa videos de la biblioteca publicitaria (no-Spark). TikTok documenta
    // CUSTOMIZED_USER para video_id; las identidades Spark usan tiktok_item_id.
    return list
      .map(item => ({ id: String(item.identity_id || item.id || ''), type: String(item.identity_type || item.type || '').toUpperCase(), name: item.display_name || item.name || item.username || 'Identidad TikTok', username: item.username || '', availableStatus: item.status || item.available_status || 'AVAILABLE' }))
      .filter(item => item.id && item.type === 'CUSTOMIZED_USER');
  }
  normalizeVideos(payload) {
    const data = responseData(payload); const list = listFrom(data, 'list', 'videos', 'video_list');
    return list.map(item => ({ id: String(item.video_id || item.id || ''), name: item.file_name || item.video_name || item.name || `Video ${item.video_id || item.id}`, previewUrl: item.preview_url || item.previewUrl || '', coverUrl: item.video_cover_url || item.cover_url || item.coverUrl || '' })).filter(item => item.id);
  }
  async selectedAssets(token, advertiserId) {
    const api = this.api(token); const [identitiesPayload, videosPayload] = await Promise.all([api.identities(advertiserId), api.videos(advertiserId)]);
    return { identities: this.normalizeIdentities(identitiesPayload), videos: this.normalizeVideos(videosPayload) };
  }
  async completeOAuth({ state, authCode, code, user }) {
    const pending = await SocialOAuthState.findOneAndDelete({ tokenHash: hashToken(state || ''), provider: 'tiktok', userId: user._id, expiresAt: { $gt: new Date() } });
    if (!pending) throw new AppError('La autorización de TikTok Ads venció o no corresponde a esta sesión.', 400, 'TIKTOK_OAUTH_STATE_INVALID');
    const store = await Store.findOne({ _id: pending.storeId, archived: { $ne: true } });
    if (!store || (user.role !== 'admin' && String(store.ownerId) !== String(user._id))) throw new AppError('La tienda ya no está disponible.', 404, 'STORE_NOT_FOUND');
    const token = await this.exchangeCode(authCode || code);
    const accounts = (await this.advertisers(token.accessToken)).filter(item => Number(item.accountStatus) === 1);
    if (!accounts.length) throw new AppError('No encontramos cuentas publicitarias de TikTok autorizadas para esta conexión.', 422, 'TIKTOK_NO_ADVERTISERS');
    const existing = await this.integration(store._id);
    const selected = accounts.find(item => item.id === existing?.selectedAdAccountId) || (accounts.length === 1 ? accounts[0] : null);
    let identities = [], videos = [], selectedIdentityId = '', selectedIdentityType = '';
    if (selected) {
      const assets = await this.selectedAssets(token.accessToken, selected.id); identities = assets.identities; videos = assets.videos;
      const identity = identities.find(item => item.id === existing?.selectedIdentityId && item.type === existing?.selectedIdentityType) || (identities.length === 1 ? identities[0] : null);
      selectedIdentityId = identity?.id || ''; selectedIdentityType = identity?.type || '';
    }
    await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: 'tiktok' }, { $set: {
      connectionMode: 'oauth', status: 'connected', accessToken: encryptSecret(token.accessToken), refreshToken: encryptSecret(token.refreshToken || ''),
      tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null, externalUserName: 'TikTok for Business', scopes: token.scopes,
      adAccounts: accounts, selectedAdAccountId: selected?.id || '', identities, videos, selectedIdentityId, selectedIdentityType,
      connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return store;
  }
  async refresh(storeId) {
    const integration = await this.integration(storeId, { withToken: true });
    if (!integration) throw new AppError('Conectá TikTok Ads antes de actualizar los activos.', 404, 'TIKTOK_NOT_CONNECTED');
    try {
      const token = await this.tokenFor(integration); const accounts = (await this.advertisers(token)).filter(item => Number(item.accountStatus) === 1);
      if (!accounts.length) throw new AppError('No encontramos cuentas publicitarias de TikTok activas.', 422, 'TIKTOK_NO_ADVERTISERS');
      integration.adAccounts = accounts; const selected = accounts.find(item => item.id === integration.selectedAdAccountId) || (accounts.length === 1 ? accounts[0] : null); integration.selectedAdAccountId = selected?.id || '';
      if (selected) {
        const assets = await this.selectedAssets(token, selected.id); integration.identities = assets.identities; integration.videos = assets.videos;
        if (!assets.identities.some(item => item.id === integration.selectedIdentityId && item.type === integration.selectedIdentityType)) { const identity = assets.identities.length === 1 ? assets.identities[0] : null; integration.selectedIdentityId = identity?.id || ''; integration.selectedIdentityType = identity?.type || ''; }
      } else { integration.identities = []; integration.videos = []; integration.selectedIdentityId = ''; integration.selectedIdentityType = ''; }
      integration.status = 'connected'; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save(); return this.safeIntegration(integration);
    } catch (error) { integration.status = 'error'; integration.lastError = error.message; integration.lastValidatedAt = new Date(); await integration.save(); throw error; }
  }
  async selectAssets(storeId, { adAccountId, identityId = '', identityType = '' }) {
    const integration = await this.integration(storeId, { withToken: true });
    if (!integration) throw new AppError('Conectá TikTok Ads antes de elegir los activos.', 404, 'TIKTOK_NOT_CONNECTED');
    const advertiserId = normalizeAdvertiserId(adAccountId); const account = (integration.adAccounts || []).find(item => item.id === advertiserId && Number(item.accountStatus) === 1);
    if (!account) throw new AppError('La cuenta publicitaria no pertenece a la conexión actual o no está activa.', 422, 'TIKTOK_ADVERTISER_NOT_AVAILABLE');
    const token = await this.tokenFor(integration); const assets = await this.selectedAssets(token, advertiserId);
    const requestedIdentity = identityId && identityType ? assets.identities.find(item => item.id === String(identityId) && item.type === String(identityType)) : null;
    if ((identityId || identityType) && !requestedIdentity) throw new AppError('La identidad publicitaria seleccionada no está disponible en esa cuenta.', 422, 'TIKTOK_IDENTITY_NOT_AVAILABLE');
    const currentIdentity = assets.identities.find(item => item.id === integration.selectedIdentityId && item.type === integration.selectedIdentityType);
    const identity = requestedIdentity || currentIdentity || (assets.identities.length === 1 ? assets.identities[0] : null);
    integration.selectedAdAccountId = advertiserId; integration.identities = assets.identities; integration.videos = assets.videos; integration.selectedIdentityId = identity?.id || ''; integration.selectedIdentityType = identity?.type || ''; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save();
    return this.safeIntegration(integration);
  }
  async disconnect(storeId) { await SocialIntegration.deleteOne({ storeId, provider: 'tiktok' }); return { connected: false }; }
  async products(store) {
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, '');
    const rows = await Product.find({ storeId: store._id, archived: { $ne: true }, active: true }).select('name description images price').sort({ name: 1 }).limit(500).lean();
    return rows.map(item => ({ _id: item._id, name: item.name, description: item.description, price: item.price, imageUrl: (item.images || [])[0] || '', destinationUrl: `${base}/producto/${item._id}` }));
  }
  async publicDestination(rawUrl) {
    try { return await this.assetPolicy.destination(rawUrl); }
    catch (error) { throw new AppError(String(error.message || 'La ficha del producto no es accesible públicamente.').replace(/Meta/g, 'TikTok'), error.status || 422, 'TIKTOK_DESTINATION_INVALID'); }
  }
  async countryLocation(api, advertiserId, countryCode) {
    const code = String(countryCode || 'AR').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(code)) throw new AppError('Ingresá un código de país ISO de dos letras.', 422, 'TIKTOK_COUNTRY_INVALID');
    let name = code; try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { /* conserva código */ }
    const payload = await api.targeting(advertiserId, code, name); const data = responseData(payload); const list = listFrom(data, 'list', 'targeting_tags', 'targeting_list');
    const all = list.flatMap(item => Array.isArray(item) ? item : [item]);
    const hit = all.find(item => String(item.status || '').toUpperCase() === 'ENABLED' && String(item?.geo?.geo_type || item.geo_type || '').toUpperCase() === 'COUNTRY' && String(item?.geo?.region_code || item.region_code || '').toUpperCase() === code);
    const id = hit?.geo?.geo_id || hit?.geo_id || hit?.id; if (!id) throw new AppError(`TikTok Ads no devolvió una ubicación utilizable para ${code}.`, 422, 'TIKTOK_COUNTRY_NOT_TARGETABLE'); return String(id);
  }
  async createTrafficAd(store, user, { productId, name, primaryText, headline, dailyBudget, countryCode = 'AR', videoId }) {
    const integration = await this.integration(store._id, { withToken: true });
    if (!integration || integration.status !== 'connected') throw new AppError('Conectá TikTok Ads antes de crear un anuncio.', 422, 'TIKTOK_NOT_CONNECTED');
    if (!integration.selectedAdAccountId || !integration.selectedIdentityId || !integration.selectedIdentityType) throw new AppError('Elegí una cuenta publicitaria y una identidad de TikTok antes de crear anuncios.', 422, 'TIKTOK_ASSETS_REQUIRED');
    if (integration.selectedIdentityType !== 'CUSTOMIZED_USER') throw new AppError('La identidad seleccionada no es compatible con anuncios creados desde la biblioteca de videos. Elegí una identidad publicitaria disponible.', 422, 'TIKTOK_IDENTITY_TYPE_UNSUPPORTED');
    const product = await Product.findOne({ _id: productId, storeId: store._id, archived: { $ne: true }, active: true }).lean(); if (!product) throw new AppError('El producto seleccionado no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const chosenVideo = (integration.videos || []).find(item => item.id === String(videoId || '')); if (!chosenVideo) throw new AppError('Elegí un video disponible en la biblioteca de TikTok Ads.', 422, 'TIKTOK_VIDEO_NOT_AVAILABLE');
    const account = (integration.adAccounts || []).find(item => item.id === integration.selectedAdAccountId); if (!account || Number(account.accountStatus) !== 1) throw new AppError('La cuenta publicitaria de TikTok seleccionada no está activa.', 422, 'TIKTOK_ADVERTISER_INACTIVE');
    const budget = Number(dailyBudget); if (!Number.isFinite(budget) || budget <= 0) throw new AppError('Ingresá un presupuesto diario válido.', 422, 'TIKTOK_BUDGET_INVALID');
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, ''); const destinationUrl = await this.publicDestination(`${base}/producto/${product._id}`);
    const token = await this.tokenFor(integration); const api = this.api(token); const advertiserId = normalizeAdvertiserId(integration.selectedAdAccountId); const locationId = await this.countryLocation(api, advertiserId, countryCode);
    const scheduleStart = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 19).replace('T', ' ');
    let campaignId = '', adGroupId = '';
    try {
      const campaignPayload = await api.post('campaign/create/', { advertiser_id: advertiserId, campaign_name: textSlice(name, 512), objective_type: 'TRAFFIC', budget_mode: 'BUDGET_MODE_INFINITE', operation_status: 'DISABLE' });
      campaignId = String(responseData(campaignPayload).campaign_id || responseData(campaignPayload).campaignId || ''); if (!campaignId) throw new AppError('TikTok creó una campaña sin devolver su identificador.', 502, 'TIKTOK_CAMPAIGN_INCOMPLETE');
      await api.post('campaign/status/update/', { advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: 'DISABLE' });
      const adGroupPayload = await api.post('adgroup/create/', { advertiser_id: advertiserId, campaign_id: campaignId, adgroup_name: textSlice(`${name} · TikTok`, 512), promotion_type: 'WEBSITE', placement_type: 'PLACEMENT_TYPE_NORMAL', placements: ['PLACEMENT_TIKTOK'], location_ids: [locationId], budget_mode: 'BUDGET_MODE_DAY', budget, schedule_type: 'SCHEDULE_FROM_NOW', schedule_start_time: scheduleStart, optimization_goal: 'CLICK', billing_event: 'CPC', bid_type: 'BID_TYPE_NO_BID', pacing: 'PACING_MODE_SMOOTH', operation_status: 'DISABLE' });
      adGroupId = String(responseData(adGroupPayload).adgroup_id || responseData(adGroupPayload).adgroupId || ''); if (!adGroupId) throw new AppError('TikTok creó el grupo de anuncios sin devolver su identificador.', 502, 'TIKTOK_ADGROUP_INCOMPLETE');
      await api.post('adgroup/status/update/', { advertiser_id: advertiserId, adgroup_ids: [adGroupId], operation_status: 'DISABLE' });
      const adPayload = await api.post('ad/create/', { advertiser_id: advertiserId, adgroup_id: adGroupId, creatives: [{ ad_name: textSlice(name, 512), identity_type: integration.selectedIdentityType, identity_id: integration.selectedIdentityId, ad_format: 'SINGLE_VIDEO', video_id: chosenVideo.id, ad_text: textSlice(primaryText || product.description || product.name, 100), call_to_action: 'SHOP_NOW', landing_page_url: destinationUrl, operation_status: 'DISABLE' }] });
      const adIds = responseData(adPayload).ad_ids || responseData(adPayload).adIds || []; const adId = String(adIds[0] || responseData(adPayload).ad_id || ''); if (!adId) throw new AppError('TikTok creó una respuesta incompleta para el anuncio.', 502, 'TIKTOK_AD_INCOMPLETE');
      await api.post('ad/status/update/', { advertiser_id: advertiserId, ad_ids: [adId], operation_status: 'DISABLE' });
      return SocialAd.create({ storeId: store._id, provider: 'tiktok', createdBy: user._id, productId: product._id, name, primaryText, headline, destinationUrl, imageUrl: chosenVideo.coverUrl || '', dailyBudget: budget, currency: account.currency || '', countryCode: String(countryCode).toUpperCase(), status: 'paused', external: { advertiserId, identityId: integration.selectedIdentityId, identityType: integration.selectedIdentityType, videoId: chosenVideo.id, campaignId, adGroupId, adId } });
    } catch (error) {
      if (campaignId) await api.post('campaign/status/update/', { advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: 'DELETE' }).catch(() => {});
      throw error;
    }
  }
}

export const tiktokAdsService = new TikTokAdsService();

import { config } from '../config.js';
import { Product, SocialAd, SocialIntegration, SocialOAuthState, Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret, encryptSecret, hashToken, randomToken } from '../utils/crypto.js';
import { domainService } from './DomainService.js';
import { FacebookAdsService } from './FacebookAdsService.js';

const OAUTH_SCOPES = Object.freeze(['ads_management', 'ads_read', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads', 'instagram_basic']);
const activeAdAccount = account => Number(account?.accountStatus ?? account?.account_status ?? 0) === 1;
const normalizeAdAccountId = value => {
  const id = String(value || '').trim();
  if (!/^(?:act_)?\d+$/.test(id)) throw new AppError('Ingresá un ID de cuenta publicitaria válido.', 422, 'INSTAGRAM_AD_ACCOUNT_INVALID');
  return id.startsWith('act_') ? id : `act_${id}`;
};
const normalizePageId = value => {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) throw new AppError('Ingresá un ID de Página de Facebook válido.', 422, 'INSTAGRAM_PAGE_INVALID');
  return id;
};
const normalizeInstagramUserId = value => {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) throw new AppError('Ingresá un ID de cuenta profesional de Instagram válido.', 422, 'INSTAGRAM_USER_INVALID');
  return id;
};
const cleanGraphError = payload => {
  const error = payload?.error || {};
  return String(error.error_user_msg || error.error_user_title || error.message || 'Meta rechazó la operación.').slice(0, 700);
};
const pageRecord = item => {
  const ig = item?.instagram_business_account || null;
  return {
    id: String(item?.id || ''),
    name: item?.name || `Página ${item?.id || ''}`,
    instagramUserId: ig?.id ? String(ig.id) : '',
    instagramUsername: ig?.username || ig?.name || '',
  };
};

/**
 * Integración publicitaria de Instagram sobre Meta Marketing API.
 * Reutiliza el transporte, política de recursos públicos y utilidades de FacebookAdsService,
 * pero mantiene su propia conexión, activos y anuncios por tienda.
 */
export class InstagramAdsService extends FacebookAdsService {
  safeIntegration(integration) {
    if (!integration) return null;
    const safe = super.safeIntegration(integration);
    const raw = integration.toObject ? integration.toObject() : integration;
    return { ...safe, selectedInstagramUserId: raw.selectedInstagramUserId || '' };
  }
  async integration(storeId, { withToken = false } = {}) {
    const query = SocialIntegration.findOne({ storeId, provider: 'instagram' });
    if (withToken) query.select('+accessToken');
    return query;
  }
  async status(storeId) {
    const [integration, ads] = await Promise.all([
      this.integration(storeId),
      SocialAd.find({ storeId, provider: 'instagram' }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return {
      provider: 'instagram', available: true, oauthConfigured: this.oauthConfigured(), sandboxAllowed: config.facebookAds.sandboxEnabled,
      apiVersion: config.facebookAds.graphVersion, redirectUri: config.facebookAds.instagramRedirectUri,
      requiredScopes: [...OAUTH_SCOPES], integration: this.safeIntegration(integration), ads,
    };
  }
  async createOAuthUrl(store, user) {
    if (!this.oauthConfigured()) throw new AppError('Instagram todavía no está disponible. Contactá a la administración.', 503, 'INSTAGRAM_NOT_CONFIGURED');
    const rawState = randomToken();
    await SocialOAuthState.create({ tokenHash: hashToken(rawState), provider: 'instagram', storeId: store._id, userId: user._id, expiresAt: new Date(Date.now() + 10 * 60000) });
    const url = new URL(`https://www.facebook.com/${config.facebookAds.graphVersion}/dialog/oauth`);
    url.searchParams.set('client_id', config.facebookAds.appId);
    url.searchParams.set('redirect_uri', config.facebookAds.instagramRedirectUri);
    url.searchParams.set('state', rawState);
    url.searchParams.set('response_type', 'code');
    if (config.facebookAds.loginConfigId) {
      url.searchParams.set('config_id', config.facebookAds.loginConfigId);
      url.searchParams.set('override_default_response_type', 'true');
    } else url.searchParams.set('scope', OAUTH_SCOPES.join(','));
    return { authUrl: url.toString(), redirectUri: config.facebookAds.instagramRedirectUri };
  }
  async exchangeCode(code) {
    const url = new URL(`${this.graphBaseUrl}/${config.facebookAds.graphVersion}/oauth/access_token`);
    url.searchParams.set('client_id', config.facebookAds.appId);
    url.searchParams.set('client_secret', config.facebookAds.appSecret);
    url.searchParams.set('redirect_uri', config.facebookAds.instagramRedirectUri);
    url.searchParams.set('code', code);
    let response;
    try { response = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch { throw new AppError('No se pudo completar la autorización con Instagram.', 503, 'INSTAGRAM_UNAVAILABLE'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new AppError(cleanGraphError(payload), 422, 'INSTAGRAM_OAUTH_FAILED');
    let accessToken = payload.access_token, expiresIn = Number(payload.expires_in || 0);
    try {
      const longUrl = new URL(`${this.graphBaseUrl}/${config.facebookAds.graphVersion}/oauth/access_token`);
      longUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longUrl.searchParams.set('client_id', config.facebookAds.appId);
      longUrl.searchParams.set('client_secret', config.facebookAds.appSecret);
      longUrl.searchParams.set('fb_exchange_token', accessToken);
      const longResponse = await this.fetch(longUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
      const longPayload = await longResponse.json().catch(() => ({}));
      if (longResponse.ok && longPayload.access_token) { accessToken = longPayload.access_token; expiresIn = Number(longPayload.expires_in || expiresIn); }
    } catch { /* El token corto sigue siendo utilizable si el intercambio largo falla. */ }
    return { accessToken, expiresIn };
  }
  async assets(accessToken) {
    const graph = this.graph(accessToken);
    const [me, accounts, pages, permissions] = await Promise.all([
      graph.get('me', { fields: 'id,name' }),
      graph.get('me/adaccounts', { fields: 'id,account_id,name,currency,account_status', limit: 100 }),
      graph.get('me/accounts', { fields: 'id,name,instagram_business_account{id,username,name}', limit: 100 }),
      graph.get('me/permissions').catch(() => ({ data: [] })),
    ]);
    return {
      me,
      adAccounts: (accounts.data || []).map(item => ({ id: normalizeAdAccountId(item.id || item.account_id), accountId: String(item.account_id || '').replace(/^act_/, ''), name: item.name || `Cuenta ${item.account_id || item.id}`, currency: item.currency || '', accountStatus: Number(item.account_status || 0) })),
      pages: (pages.data || []).map(pageRecord).filter(item => item.instagramUserId),
      scopes: (permissions.data || []).filter(item => item.status === 'granted').map(item => item.permission),
    };
  }
  async completeOAuth({ state, code, user }) {
    const pending = await SocialOAuthState.findOneAndDelete({ tokenHash: hashToken(state || ''), provider: 'instagram', userId: user._id, expiresAt: { $gt: new Date() } });
    if (!pending) throw new AppError('La autorización de Instagram venció o no corresponde a esta sesión.', 400, 'INSTAGRAM_OAUTH_STATE_INVALID');
    const store = await Store.findOne({ _id: pending.storeId, archived: { $ne: true } });
    if (!store || (user.role !== 'admin' && String(store.ownerId) !== String(user._id))) throw new AppError('La tienda ya no está disponible.', 404, 'STORE_NOT_FOUND');
    const { accessToken, expiresIn } = await this.exchangeCode(code);
    const assets = await this.assets(accessToken);
    const required = ['ads_management', 'pages_show_list', 'pages_read_engagement', 'instagram_basic'];
    const missing = required.filter(scope => !assets.scopes.includes(scope));
    if (missing.length) throw new AppError(`Instagram no concedió todos los permisos necesarios: ${missing.join(', ')}.`, 422, 'INSTAGRAM_PERMISSIONS_MISSING');
    const activeAccounts = assets.adAccounts.filter(activeAdAccount);
    if (!activeAccounts.length) throw new AppError('La conexión no tiene una cuenta publicitaria activa disponible.', 422, 'INSTAGRAM_NO_ACTIVE_AD_ACCOUNTS');
    if (!assets.pages.length) throw new AppError('No encontramos una cuenta profesional de Instagram vinculada a una Página que administres.', 422, 'INSTAGRAM_NO_PROFESSIONAL_ACCOUNTS');
    const existing = await this.integration(store._id);
    const selectedAdAccountId = activeAccounts.some(item => item.id === existing?.selectedAdAccountId) ? existing.selectedAdAccountId : activeAccounts.length === 1 ? activeAccounts[0].id : '';
    const existingPage = assets.pages.find(item => item.id === existing?.selectedPageId && item.instagramUserId === existing?.selectedInstagramUserId);
    const selectedPage = existingPage || (assets.pages.length === 1 ? assets.pages[0] : null);
    await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: 'instagram' }, { $set: {
      connectionMode: 'oauth', status: 'connected', accessToken: encryptSecret(accessToken), tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      externalUserId: String(assets.me.id || ''), externalUserName: assets.me.name || '', scopes: assets.scopes,
      adAccounts: assets.adAccounts, pages: assets.pages, selectedAdAccountId,
      selectedPageId: selectedPage?.id || '', selectedInstagramUserId: selectedPage?.instagramUserId || '',
      connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return store;
  }
  async connectSandbox(store, user, { accessToken, adAccountId, pageId, instagramUserId }) {
    if (!config.facebookAds.sandboxEnabled) throw new AppError('La conexión manual de Sandbox está deshabilitada en este entorno.', 403, 'INSTAGRAM_SANDBOX_DISABLED');
    const accountId = normalizeAdAccountId(adAccountId), normalizedPageId = normalizePageId(pageId), igId = normalizeInstagramUserId(instagramUserId);
    const graph = this.graph(accessToken);
    const [account, page] = await Promise.all([
      graph.get(accountId, { fields: 'id,account_id,name,currency,account_status' }),
      graph.get(normalizedPageId, { fields: 'id,name,instagram_business_account{id,username,name}' }),
    ]);
    if (!activeAdAccount(account)) throw new AppError('La cuenta publicitaria seleccionada no está activa.', 422, 'INSTAGRAM_AD_ACCOUNT_INACTIVE');
    const pageInfo = pageRecord(page);
    if (!pageInfo.instagramUserId || pageInfo.instagramUserId !== igId) throw new AppError('La cuenta profesional de Instagram no está vinculada a la Página seleccionada.', 422, 'INSTAGRAM_ACCOUNT_NOT_LINKED');
    const integration = await SocialIntegration.findOneAndUpdate({ storeId: store._id, provider: 'instagram' }, { $set: {
      connectionMode: 'sandbox', status: 'connected', accessToken: encryptSecret(accessToken), tokenExpiresAt: null,
      externalUserId: '', externalUserName: 'Marketing API Sandbox', scopes: ['ads_management', 'instagram_basic'],
      adAccounts: [{ id: accountId, accountId: String(account.account_id || accountId).replace(/^act_/, ''), name: account.name || `Sandbox ${accountId}`, currency: account.currency || '', accountStatus: Number(account.account_status || 0) }],
      pages: [pageInfo], selectedAdAccountId: accountId, selectedPageId: normalizedPageId, selectedInstagramUserId: igId,
      connectedBy: user._id, lastValidatedAt: new Date(), lastError: '',
    } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    return this.safeIntegration(integration);
  }
  async refresh(storeId) {
    const integration = await this.integration(storeId, { withToken: true });
    if (!integration) throw new AppError('Conectá Instagram antes de actualizar los activos.', 404, 'INSTAGRAM_NOT_CONNECTED');
    const token = decryptSecret(integration.accessToken);
    if (integration.connectionMode === 'sandbox') {
      const graph = this.graph(token); const accountId = normalizeAdAccountId(integration.selectedAdAccountId); const pageId = normalizePageId(integration.selectedPageId);
      const [account, page] = await Promise.all([
        graph.get(accountId, { fields: 'id,account_id,name,currency,account_status' }),
        graph.get(pageId, { fields: 'id,name,instagram_business_account{id,username,name}' }),
      ]);
      if (!activeAdAccount(account)) { integration.status = 'error'; integration.lastError = 'La cuenta publicitaria seleccionada ya no está activa.'; integration.lastValidatedAt = new Date(); await integration.save(); throw new AppError(integration.lastError, 422, 'INSTAGRAM_AD_ACCOUNT_INACTIVE'); }
      const pageInfo = pageRecord(page);
      if (!pageInfo.instagramUserId || pageInfo.instagramUserId !== integration.selectedInstagramUserId) { integration.status = 'error'; integration.lastError = 'La cuenta profesional de Instagram ya no está vinculada a la Página seleccionada.'; integration.lastValidatedAt = new Date(); await integration.save(); throw new AppError(integration.lastError, 422, 'INSTAGRAM_ACCOUNT_NOT_LINKED'); }
      integration.adAccounts = [{ id: accountId, accountId: String(account.account_id || accountId).replace(/^act_/, ''), name: account.name || `Sandbox ${accountId}`, currency: account.currency || '', accountStatus: Number(account.account_status || 0) }];
      integration.pages = [pageInfo]; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save(); return this.safeIntegration(integration);
    }
    try {
      const assets = await this.assets(token); integration.externalUserId = String(assets.me.id || ''); integration.externalUserName = assets.me.name || ''; integration.scopes = assets.scopes; integration.adAccounts = assets.adAccounts; integration.pages = assets.pages;
      const activeAccounts = assets.adAccounts.filter(activeAdAccount); if (!activeAccounts.length) throw new AppError('No encontramos una cuenta publicitaria activa.', 422, 'INSTAGRAM_NO_ACTIVE_AD_ACCOUNTS');
      if (!activeAccounts.some(item => item.id === integration.selectedAdAccountId)) integration.selectedAdAccountId = activeAccounts.length === 1 ? activeAccounts[0].id : '';
      const selectedPage = assets.pages.find(item => item.id === integration.selectedPageId && item.instagramUserId === integration.selectedInstagramUserId);
      if (!selectedPage) { const fallback = assets.pages.length === 1 ? assets.pages[0] : null; integration.selectedPageId = fallback?.id || ''; integration.selectedInstagramUserId = fallback?.instagramUserId || ''; }
      if (!assets.pages.length) throw new AppError('No encontramos una cuenta profesional de Instagram vinculada a una Página.', 422, 'INSTAGRAM_NO_PROFESSIONAL_ACCOUNTS');
      integration.status = 'connected'; integration.lastValidatedAt = new Date(); integration.lastError = ''; await integration.save(); return this.safeIntegration(integration);
    } catch (error) { integration.status = 'error'; integration.lastError = error.message; await integration.save(); throw error; }
  }
  async selectAssets(storeId, { adAccountId, pageId, instagramUserId }) {
    const integration = await this.integration(storeId);
    if (!integration) throw new AppError('Conectá Instagram antes de elegir los activos.', 404, 'INSTAGRAM_NOT_CONNECTED');
    const accountId = normalizeAdAccountId(adAccountId), normalizedPageId = normalizePageId(pageId), igId = normalizeInstagramUserId(instagramUserId);
    const account = (integration.adAccounts || []).find(item => item.id === accountId);
    if (!account) throw new AppError('La cuenta publicitaria no pertenece a la conexión actual.', 422, 'INSTAGRAM_AD_ACCOUNT_NOT_AVAILABLE');
    if (!activeAdAccount(account)) throw new AppError('La cuenta publicitaria seleccionada no está activa.', 422, 'INSTAGRAM_AD_ACCOUNT_INACTIVE');
    const page = (integration.pages || []).find(item => item.id === normalizedPageId && item.instagramUserId === igId);
    if (!page) throw new AppError('La cuenta profesional de Instagram no pertenece a la Página seleccionada.', 422, 'INSTAGRAM_ACCOUNT_NOT_AVAILABLE');
    integration.selectedAdAccountId = accountId; integration.selectedPageId = normalizedPageId; integration.selectedInstagramUserId = igId; await integration.save(); return this.safeIntegration(integration);
  }
  async disconnect(storeId) { await SocialIntegration.deleteOne({ storeId, provider: 'instagram' }); return { connected: false }; }
  async createTrafficAd(store, user, { productId, name, primaryText, headline, dailyBudget, countryCode = 'AR' }) {
    const integration = await this.integration(store._id, { withToken: true });
    if (!integration || integration.status !== 'connected') throw new AppError('Conectá Instagram antes de crear un anuncio.', 422, 'INSTAGRAM_NOT_CONNECTED');
    if (!integration.selectedAdAccountId || !integration.selectedPageId || !integration.selectedInstagramUserId) throw new AppError('Elegí una cuenta publicitaria y una cuenta profesional de Instagram antes de crear anuncios.', 422, 'INSTAGRAM_ASSETS_REQUIRED');
    const product = await Product.findOne({ _id: productId, storeId: store._id, archived: { $ne: true }, active: true }).lean();
    if (!product) throw new AppError('El producto seleccionado no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const imageUrl = (product.images || [])[0]; if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) throw new AppError('El producto necesita una primera imagen pública para anunciarlo en Instagram.', 422, 'INSTAGRAM_PRODUCT_IMAGE_REQUIRED');
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, ''); const destinationUrl = await this.assertPublicDestinationUrl(`${base}/producto/${product._id}`);
    const image = await this.assertPublicImageUrl(imageUrl); const token = decryptSecret(integration.accessToken); const graph = this.graph(token); const accountId = normalizeAdAccountId(integration.selectedAdAccountId);
    const account = (integration.adAccounts || []).find(item => item.id === accountId); const currency = account?.currency || 'ARS'; const scale = this.currencyScale(currency); const budgetMinor = Math.round(Number(dailyBudget) * scale);
    if (account && !activeAdAccount(account)) throw new AppError('La cuenta publicitaria seleccionada no está activa.', 422, 'INSTAGRAM_AD_ACCOUNT_INACTIVE');
    if (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0) throw new AppError('Ingresá un presupuesto diario válido.', 422, 'INSTAGRAM_BUDGET_INVALID');
    let campaignId = '';
    try {
      const campaign = await graph.post(`${accountId}/campaigns`, { name, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', buying_type: 'AUCTION', special_ad_categories: [] }); campaignId = campaign.id;
      const adSet = await graph.post(`${accountId}/adsets`, { name: `${name} · Público`, campaign_id: campaign.id, daily_budget: String(budgetMinor), billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', targeting: { geo_locations: { countries: [countryCode] }, age_min: 18, age_max: 65, publisher_platforms: ['instagram'] }, status: 'PAUSED' });
      const uploaded = await graph.post(`${accountId}/adimages`, { bytes: image.bytes }); const imageRecord = Object.values(uploaded.images || {})[0]; if (!imageRecord?.hash) throw new AppError('Meta recibió la imagen pero no devolvió su identificador.', 422, 'INSTAGRAM_IMAGE_UPLOAD_FAILED');
      const creative = await graph.post(`${accountId}/adcreatives`, { name: `${name} · Creativo`, object_story_spec: { page_id: integration.selectedPageId, instagram_user_id: integration.selectedInstagramUserId, link_data: { link: destinationUrl, message: primaryText, name: headline || product.name, image_hash: imageRecord.hash, call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } } } } });
      const ad = await graph.post(`${accountId}/ads`, { name, adset_id: adSet.id, creative: { creative_id: creative.id }, status: 'PAUSED' });
      return SocialAd.create({ storeId: store._id, provider: 'instagram', createdBy: user._id, productId: product._id, name, primaryText, headline, destinationUrl, imageUrl: image.url, dailyBudget: Number(dailyBudget), currency, countryCode, status: 'paused', external: { adAccountId: accountId, pageId: integration.selectedPageId, instagramUserId: integration.selectedInstagramUserId, campaignId: campaign.id, adSetId: adSet.id, creativeId: creative.id, adId: ad.id, imageHash: imageRecord.hash } });
    } catch (error) {
      if (campaignId) await graph.delete(campaignId).catch(() => {});
      throw error;
    }
  }
}

export const instagramAdsService = new InstagramAdsService();

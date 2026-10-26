import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.APP_URL ||= 'http://localhost:5000';
process.env.ENCRYPTION_KEY ||= '22'.repeat(32);
process.env.SESSION_SECRET ||= 'mock-session-secret';
process.env.META_APP_ID ||= '123456789012345';
process.env.META_APP_SECRET ||= 'mock-meta-app-secret';
process.env.META_GRAPH_VERSION ||= 'v26.0';
process.env.META_SANDBOX_CONNECT_ENABLED = 'true';

const TOKEN = 'MOCK_META_TOKEN';
const SHORT_TOKEN = 'MOCK_META_SHORT_TOKEN';
const LONG_TOKEN = 'MOCK_META_LONG_TOKEN';
const APP_SECRET = process.env.META_APP_SECRET;
const proofFor = token => crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');
const expectedProof = proofFor(TOKEN);

class MockMetaServer {
  constructor() { this.server = null; this.url = ''; this.reset(); }
  reset() { this.requests = []; this.sequence = { campaign: 0, adset: 0, creative: 0, ad: 0 }; this.failSuffix = ''; this.failStatus = 500; this.omitImageHash = false; this.accountStatus = 1; this.missingPermission = ''; }
  async start() {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${this.server.address().port}`;
  }
  async stop() { if (this.server) await new Promise(resolve => this.server.close(resolve)); }
  json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  async form(req) {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  }
  auth(values) {
    const token = String(values.access_token || '');
    return [TOKEN, SHORT_TOKEN, LONG_TOKEN].includes(token) && values.appsecret_proof === proofFor(token);
  }
  async handle(req, res) {
    const url = new URL(req.url, 'http://mock.local');
    const form = req.method === 'POST' ? await this.form(req) : {};
    const values = req.method === 'POST' ? form : Object.fromEntries(url.searchParams);
    this.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), form });

    if (req.method === 'GET' && url.pathname.endsWith('/oauth/access_token')) {
      if (values.client_id !== process.env.META_APP_ID || values.client_secret !== APP_SECRET) return this.json(res, 401, { error: { message: 'Invalid app credentials.', code: 101 } });
      if (values.grant_type === 'fb_exchange_token') {
        if (values.fb_exchange_token !== SHORT_TOKEN) return this.json(res, 400, { error: { message: 'Invalid short token.', code: 190 } });
        return this.json(res, 200, { access_token: LONG_TOKEN, token_type: 'bearer', expires_in: 5184000 });
      }
      if (values.code !== 'MOCK_OAUTH_CODE') return this.json(res, 400, { error: { message: 'Invalid authorization code.', code: 100 } });
      return this.json(res, 200, { access_token: SHORT_TOKEN, token_type: 'bearer', expires_in: 3600 });
    }

    if (!this.auth(values)) return this.json(res, 401, { error: { message: 'Invalid OAuth access token.', code: 190 } });
    if (this.failSuffix && url.pathname.endsWith(this.failSuffix)) {
      const suffix = this.failSuffix; this.failSuffix = '';
      return this.json(res, this.failStatus, { error: { message: `Mock failure at ${suffix}`, code: this.failStatus >= 500 ? 2 : 100 } });
    }
    if (req.method === 'GET' && url.pathname.endsWith('/act_1001')) return this.json(res, 200, { id: 'act_1001', account_id: '1001', name: 'Mock Ads', currency: 'ARS', account_status: this.accountStatus });
    if (req.method === 'GET' && url.pathname.endsWith('/2001')) return this.json(res, 200, { id: '2001', name: 'Mock Store Page' });
    if (req.method === 'GET' && url.pathname.endsWith('/me/adaccounts')) return this.json(res, 200, { data: [{ id: 'act_1001', account_id: '1001', name: 'Mock Ads', currency: 'ARS', account_status: this.accountStatus }] });
    if (req.method === 'GET' && url.pathname.endsWith('/me/accounts')) return this.json(res, 200, { data: [{ id: '2001', name: 'Mock Store Page' }] });
    if (req.method === 'GET' && url.pathname.endsWith('/me/permissions')) return this.json(res, 200, { data: [
      'ads_management', 'ads_read', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads',
    ].filter(permission => permission !== this.missingPermission).map(permission => ({ permission, status: 'granted' })) });
    if (req.method === 'GET' && url.pathname.endsWith('/me')) return this.json(res, 200, { id: 'facebook_user_1', name: 'Mock Facebook User' });
    if (req.method === 'POST' && url.pathname.endsWith('/act_1001/campaigns')) return this.json(res, 200, { id: `campaign_${++this.sequence.campaign}` });
    if (req.method === 'POST' && url.pathname.endsWith('/act_1001/adsets')) return this.json(res, 200, { id: `adset_${++this.sequence.adset}` });
    if (req.method === 'POST' && url.pathname.endsWith('/act_1001/adimages')) return this.json(res, 200, { images: { 'mock-product.jpg': this.omitImageHash ? {} : { hash: 'mock_image_hash' } } });
    if (req.method === 'POST' && url.pathname.endsWith('/act_1001/adcreatives')) return this.json(res, 200, { id: `creative_${++this.sequence.creative}` });
    if (req.method === 'POST' && url.pathname.endsWith('/act_1001/ads')) return this.json(res, 200, { id: `ad_${++this.sequence.ad}` });
    if (req.method === 'DELETE' && /\/v26\.0\/campaign_\d+$/.test(url.pathname)) return this.json(res, 200, { success: true });
    return this.json(res, 404, { error: { message: `Unhandled ${req.method} ${url.pathname}`, code: 100 } });
  }
}

class MockAssetPolicy {
  async destination(rawUrl) { assert.match(String(rawUrl), /\/producto\//); return 'https://store.example.com/producto/mock'; }
  async image(rawUrl) { assert.equal(rawUrl, 'https://cdn.example.com/product.jpg'); return { bytes: Buffer.from('mock-image-bytes').toString('base64'), url: rawUrl, type: 'image/jpeg' }; }
}

let mongod;
let mock;
let models;
let FacebookAdsService;
let service;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('mitiendaya_facebook_mock'));
  models = await import('../api/src/models/index.js');
  ({ FacebookAdsService } = await import('../api/src/services/FacebookAdsService.js'));
  mock = new MockMetaServer(); await mock.start();
  service = new FacebookAdsService({ graphBaseUrl: mock.url, assetPolicy: new MockAssetPolicy(), timeoutMs: 2000 });
});

after(async () => { await mongoose.disconnect(); await mongod?.stop(); await mock?.stop(); });

beforeEach(async () => {
  mock.reset();
  await Promise.all([models.SocialOAuthState.deleteMany({}), models.SocialAd.deleteMany({}), models.SocialIntegration.deleteMany({}), models.Product.deleteMany({}), models.Store.deleteMany({}), models.User.deleteMany({})]);
});

async function fixture({ token = TOKEN } = {}) {
  const user = await models.User.create({ role: 'vendedor', name: 'Facebook Tester', email: `fb-${crypto.randomUUID()}@example.com` });
  const store = await models.Store.create({ ownerId: user._id, ownerSlot: 0, name: 'Mock Store', slug: `mock-${crypto.randomUUID().slice(0, 8)}`, active: true });
  const product = await models.Product.create({ storeId: store._id, quotaSlot: 0, name: 'Remera Mock', description: 'Producto de prueba', images: ['https://cdn.example.com/product.jpg'], price: 25000, stock: 10, active: true });
  const integration = await service.connectSandbox(store, user, { accessToken: token, adAccountId: 'act_1001', pageId: '2001' });
  return { user, store, product, integration };
}

async function createAd(fx, overrides = {}) {
  return service.createTrafficAd(fx.store, fx.user, {
    productId: fx.product._id, name: 'Campaña Mock', primaryText: 'Probando MiTiendaYa sin gastar dinero', headline: 'Remera Mock', dailyBudget: 1500, countryCode: 'AR', ...overrides,
  });
}

test('conexión sandbox valida cuenta y Página contra el servidor mock y cifra el token', async () => {
  const fx = await fixture();
  assert.equal(fx.integration.status, 'connected'); assert.equal(fx.integration.selectedAdAccountId, 'act_1001'); assert.equal(fx.integration.selectedPageId, '2001');
  const stored = await models.SocialIntegration.findOne({ storeId: fx.store._id, provider: 'facebook' }).select('+accessToken').lean();
  assert.notEqual(stored.accessToken, TOKEN); assert.match(stored.accessToken, /^v1:/);
  const safe = await service.status(fx.store._id); assert.equal(Object.hasOwn(safe.integration || {}, 'accessToken'), false);
  assert.deepEqual(mock.requests.slice(0, 2).map(item => item.path).sort(), ['/v26.0/2001', '/v26.0/act_1001'].sort());
});

test('OAuth de producción usa App ID/Secret, intercambia por token largo y descubre activos sin credenciales manuales', async () => {
  const user = await models.User.create({ role: 'vendedor', name: 'OAuth Tester', email: `oauth-${crypto.randomUUID()}@example.com` });
  const store = await models.Store.create({ ownerId: user._id, ownerSlot: 0, name: 'OAuth Store', slug: `oauth-${crypto.randomUUID().slice(0, 8)}`, active: true });
  const started = await service.createOAuthUrl(store, user);
  const authUrl = new URL(started.authUrl);
  const state = authUrl.searchParams.get('state');
  assert.ok(state); assert.equal(authUrl.searchParams.get('client_id'), process.env.META_APP_ID);

  await service.completeOAuth({ state, code: 'MOCK_OAUTH_CODE', user });
  const stored = await models.SocialIntegration.findOne({ storeId: store._id, provider: 'facebook' }).select('+accessToken');
  assert.equal(stored.connectionMode, 'oauth'); assert.equal(stored.externalUserId, 'facebook_user_1'); assert.equal(stored.selectedAdAccountId, 'act_1001'); assert.equal(stored.selectedPageId, '2001');
  assert.notEqual(stored.accessToken, LONG_TOKEN); assert.match(stored.accessToken, /^v1:/);
  assert.deepEqual([...stored.scopes].sort(), ['ads_management', 'ads_read', 'pages_manage_ads', 'pages_read_engagement', 'pages_show_list'].sort());
  assert.equal(await models.SocialOAuthState.countDocuments({}), 0, 'el state OAuth debe consumirse una sola vez');

  const oauthRequests = mock.requests.filter(item => item.path.endsWith('/oauth/access_token'));
  assert.equal(oauthRequests.length, 2); assert.equal(oauthRequests[0].query.code, 'MOCK_OAUTH_CODE'); assert.equal(oauthRequests[1].query.fb_exchange_token, SHORT_TOKEN);
  for (const request of mock.requests.filter(item => ['/v26.0/me', '/v26.0/me/adaccounts', '/v26.0/me/accounts', '/v26.0/me/permissions'].includes(item.path))) {
    assert.equal(request.query.access_token, LONG_TOKEN); assert.equal(request.query.appsecret_proof, proofFor(LONG_TOKEN));
  }
});

test('creación completa envía campaña -> adset -> imagen -> creativo -> anuncio y todo queda PAUSED sólo en Facebook', async () => {
  const fx = await fixture(); mock.requests = [];
  const result = await createAd(fx);
  const writes = mock.requests.filter(item => item.method === 'POST');
  assert.deepEqual(writes.map(item => item.path), [
    '/v26.0/act_1001/campaigns', '/v26.0/act_1001/adsets', '/v26.0/act_1001/adimages', '/v26.0/act_1001/adcreatives', '/v26.0/act_1001/ads',
  ]);
  const campaign = writes[0].form; assert.equal(campaign.objective, 'OUTCOME_TRAFFIC'); assert.equal(campaign.status, 'PAUSED'); assert.deepEqual(JSON.parse(campaign.special_ad_categories), []);
  const adset = writes[1].form; assert.equal(adset.status, 'PAUSED'); assert.equal(adset.destination_type, 'WEBSITE'); assert.equal(adset.daily_budget, String(Math.round(1500 * service.currencyScale('ARS'))));
  const targeting = JSON.parse(adset.targeting); assert.deepEqual(targeting.geo_locations.countries, ['AR']); assert.deepEqual(targeting.publisher_platforms, ['facebook']);
  const creative = JSON.parse(writes[3].form.object_story_spec); assert.equal(creative.page_id, '2001'); assert.equal(creative.link_data.image_hash, 'mock_image_hash'); assert.equal(creative.link_data.call_to_action.type, 'SHOP_NOW');
  const ad = writes[4].form; assert.equal(ad.status, 'PAUSED'); assert.deepEqual(JSON.parse(ad.creative), { creative_id: 'creative_1' });
  assert.equal(result.status, 'paused'); assert.equal(result.external.campaignId, 'campaign_1'); assert.equal(result.external.adId, 'ad_1');
  assert.equal(await models.SocialAd.countDocuments({ storeId: fx.store._id }), 1);
  for (const request of mock.requests) {
    const values = request.method === 'POST' ? request.form : request.query;
    assert.equal(values.access_token, TOKEN); assert.equal(values.appsecret_proof, expectedProof);
  }
});

test('si Meta falla después de crear la campaña, MiTiendaYa intenta borrar la campaña parcial y no persiste un anuncio', async () => {
  const fx = await fixture(); mock.requests = []; mock.failSuffix = '/act_1001/adcreatives';
  await assert.rejects(() => createAd(fx), error => error.code === 'FACEBOOK_API_ERROR' && error.status === 503);
  const cleanup = mock.requests.find(item => item.method === 'DELETE' && item.path === '/v26.0/campaign_1'); assert.ok(cleanup, 'debe ejecutar rollback de la campaña');
  assert.equal(await models.SocialAd.countDocuments({ storeId: fx.store._id }), 0);
});

test('si Meta falla antes de crear la campaña, no intenta borrar un ID inexistente', async () => {
  const fx = await fixture(); mock.requests = []; mock.failSuffix = '/act_1001/campaigns';
  await assert.rejects(() => createAd(fx), error => error.code === 'FACEBOOK_API_ERROR' && error.status === 503);
  assert.equal(mock.requests.some(item => item.method === 'DELETE'), false); assert.equal(await models.SocialAd.countDocuments({}), 0);
});

test('si Meta acepta la imagen pero no devuelve hash, aborta y limpia la campaña', async () => {
  const fx = await fixture(); mock.requests = []; mock.omitImageHash = true;
  await assert.rejects(() => createAd(fx), error => error.code === 'FACEBOOK_IMAGE_UPLOAD_FAILED');
  assert.ok(mock.requests.some(item => item.method === 'DELETE' && item.path === '/v26.0/campaign_1')); assert.equal(await models.SocialAd.countDocuments({}), 0);
});

test('un token inválido no crea integración local', async () => {
  const user = await models.User.create({ role: 'vendedor', name: 'Bad Token', email: `bad-${crypto.randomUUID()}@example.com` });
  const store = await models.Store.create({ ownerId: user._id, ownerSlot: 0, name: 'Bad Store', slug: `bad-${crypto.randomUUID().slice(0, 8)}` });
  await assert.rejects(() => service.connectSandbox(store, user, { accessToken: 'INVALID_TOKEN', adAccountId: 'act_1001', pageId: '2001' }), error => error.code === 'FACEBOOK_API_ERROR');
  assert.equal(await models.SocialIntegration.countDocuments({ storeId: store._id }), 0);
});

test('una cuenta publicitaria inactiva se rechaza antes de persistir la integración', async () => {
  mock.accountStatus = 2;
  const user = await models.User.create({ role: 'vendedor', name: 'Inactive Ads', email: `inactive-${crypto.randomUUID()}@example.com` });
  const store = await models.Store.create({ ownerId: user._id, ownerSlot: 0, name: 'Inactive Store', slug: `inactive-${crypto.randomUUID().slice(0, 8)}` });
  await assert.rejects(() => service.connectSandbox(store, user, { accessToken: TOKEN, adAccountId: 'act_1001', pageId: '2001' }), error => error.code === 'FACEBOOK_AD_ACCOUNT_INACTIVE');
  assert.equal(await models.SocialIntegration.countDocuments({ storeId: store._id }), 0);
});

test('OAuth rechaza permisos incompletos y no crea una integración parcial', async () => {
  mock.missingPermission = 'ads_management';
  const user = await models.User.create({ role: 'vendedor', name: 'Missing Scope', email: `scope-${crypto.randomUUID()}@example.com` });
  const store = await models.Store.create({ ownerId: user._id, ownerSlot: 0, name: 'Scope Store', slug: `scope-${crypto.randomUUID().slice(0, 8)}` });
  const { authUrl } = await service.createOAuthUrl(store, user); const state = new URL(authUrl).searchParams.get('state');
  await assert.rejects(() => service.completeOAuth({ state, code: 'MOCK_OAUTH_CODE', user }), error => error.code === 'FACEBOOK_PERMISSIONS_MISSING');
  assert.equal(await models.SocialIntegration.countDocuments({ storeId: store._id }), 0);
});

test('refresh de Sandbox vuelve a validar los activos contra Graph y conserva la selección', async () => {
  const fx = await fixture(); mock.requests = [];
  const refreshed = await service.refresh(fx.store._id);
  assert.equal(refreshed.selectedAdAccountId, 'act_1001'); assert.equal(refreshed.selectedPageId, '2001'); assert.equal(refreshed.lastError, '');
  assert.equal(mock.requests.filter(item => item.method === 'GET').length, 2);
});

test('si la cuenta publicitaria deja de estar activa, refresh marca la integración con error', async () => {
  const fx = await fixture(); mock.requests = []; mock.accountStatus = 2;
  await assert.rejects(() => service.refresh(fx.store._id), error => error.code === 'FACEBOOK_AD_ACCOUNT_INACTIVE');
  const stored = await models.SocialIntegration.findOne({ storeId: fx.store._id, provider: 'facebook' });
  assert.equal(stored.status, 'error'); assert.match(stored.lastError, /ya no está activa/i);
});

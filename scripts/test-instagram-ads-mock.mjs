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
process.env.META_INSTAGRAM_REDIRECT_URI ||= 'http://localhost:5000/api/social/instagram/callback';
process.env.META_SANDBOX_CONNECT_ENABLED = 'true';

const TOKEN = 'MOCK_META_INSTAGRAM_TOKEN';
const SHORT_TOKEN = 'MOCK_META_INSTAGRAM_SHORT';
const LONG_TOKEN = 'MOCK_META_INSTAGRAM_LONG';
const APP_SECRET = process.env.META_APP_SECRET;
const proofFor = token => crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex');

class MockMetaInstagramServer {
  constructor() { this.server = null; this.url = ''; this.reset(); }
  reset() { this.requests = []; this.sequence = { campaign: 0, adset: 0, creative: 0, ad: 0 }; this.failSuffix = ''; this.failStatus = 500; this.omitImageHash = false; this.accountStatus = 1; this.missingPermission = ''; this.instagramLinked = true; this.instagramUserId = '17841400000000001'; }
  async start() { this.server = http.createServer((req, res) => this.handle(req, res)); await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve)); this.url = `http://127.0.0.1:${this.server.address().port}`; }
  async stop() { if (this.server) await new Promise(resolve => this.server.close(resolve)); }
  json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  async form(req) { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))); }
  auth(values) { const token=String(values.access_token||''); return [TOKEN,SHORT_TOKEN,LONG_TOKEN].includes(token) && values.appsecret_proof===proofFor(token); }
  page() { return { id:'2001', name:'Mock Store Page', ...(this.instagramLinked ? { instagram_business_account:{ id:this.instagramUserId, username:'mock_store', name:'Mock Store' } } : {}) }; }
  async handle(req,res) {
    const url=new URL(req.url,'http://mock.local'); const form=req.method==='POST'?await this.form(req):{}; const values=req.method==='POST'?form:Object.fromEntries(url.searchParams);
    this.requests.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),form});
    if(req.method==='GET'&&url.pathname.endsWith('/oauth/access_token')){
      if(values.client_id!==process.env.META_APP_ID||values.client_secret!==APP_SECRET)return this.json(res,401,{error:{message:'Invalid app credentials.',code:101}});
      if(values.grant_type==='fb_exchange_token'){if(values.fb_exchange_token!==SHORT_TOKEN)return this.json(res,400,{error:{message:'Invalid short token.',code:190}});return this.json(res,200,{access_token:LONG_TOKEN,token_type:'bearer',expires_in:5184000});}
      if(values.code!=='MOCK_IG_OAUTH_CODE')return this.json(res,400,{error:{message:'Invalid authorization code.',code:100}});
      return this.json(res,200,{access_token:SHORT_TOKEN,token_type:'bearer',expires_in:3600});
    }
    if(!this.auth(values))return this.json(res,401,{error:{message:'Invalid OAuth access token.',code:190}});
    if(this.failSuffix&&url.pathname.endsWith(this.failSuffix)){const suffix=this.failSuffix;this.failSuffix='';return this.json(res,this.failStatus,{error:{message:`Mock failure at ${suffix}`,code:this.failStatus>=500?2:100}});}
    if(req.method==='GET'&&url.pathname.endsWith('/act_1001'))return this.json(res,200,{id:'act_1001',account_id:'1001',name:'Mock Ads',currency:'ARS',account_status:this.accountStatus});
    if(req.method==='GET'&&url.pathname.endsWith('/2001'))return this.json(res,200,this.page());
    if(req.method==='GET'&&url.pathname.endsWith('/me/adaccounts'))return this.json(res,200,{data:[{id:'act_1001',account_id:'1001',name:'Mock Ads',currency:'ARS',account_status:this.accountStatus}]});
    if(req.method==='GET'&&url.pathname.endsWith('/me/accounts'))return this.json(res,200,{data:[this.page()]});
    if(req.method==='GET'&&url.pathname.endsWith('/me/permissions'))return this.json(res,200,{data:['ads_management','ads_read','pages_show_list','pages_read_engagement','pages_manage_ads','instagram_basic'].filter(p=>p!==this.missingPermission).map(permission=>({permission,status:'granted'}))});
    if(req.method==='GET'&&url.pathname.endsWith('/me'))return this.json(res,200,{id:'meta_user_1',name:'Mock Meta User'});
    if(req.method==='POST'&&url.pathname.endsWith('/act_1001/campaigns'))return this.json(res,200,{id:`campaign_${++this.sequence.campaign}`});
    if(req.method==='POST'&&url.pathname.endsWith('/act_1001/adsets'))return this.json(res,200,{id:`adset_${++this.sequence.adset}`});
    if(req.method==='POST'&&url.pathname.endsWith('/act_1001/adimages'))return this.json(res,200,{images:{'mock-product.jpg':this.omitImageHash?{}:{hash:'mock_ig_image_hash'}}});
    if(req.method==='POST'&&url.pathname.endsWith('/act_1001/adcreatives'))return this.json(res,200,{id:`creative_${++this.sequence.creative}`});
    if(req.method==='POST'&&url.pathname.endsWith('/act_1001/ads'))return this.json(res,200,{id:`ad_${++this.sequence.ad}`});
    if(req.method==='DELETE'&&/\/v26\.0\/campaign_\d+$/.test(url.pathname))return this.json(res,200,{success:true});
    return this.json(res,404,{error:{message:`Unhandled ${req.method} ${url.pathname}`,code:100}});
  }
}

class MockAssetPolicy {
  async destination(rawUrl){assert.match(String(rawUrl),/\/producto\//);return 'https://store.example.com/producto/mock';}
  async image(rawUrl){assert.equal(rawUrl,'https://cdn.example.com/product.jpg');return {bytes:Buffer.from('mock-image-bytes').toString('base64'),url:rawUrl,type:'image/jpeg'};}
}

let mongod,mock,models,InstagramAdsService,service;
before(async()=>{mongod=await MongoMemoryServer.create();await mongoose.connect(mongod.getUri('mitiendaya_instagram_mock'));models=await import('../api/src/models/index.js');({InstagramAdsService}=await import('../api/src/services/InstagramAdsService.js'));mock=new MockMetaInstagramServer();await mock.start();service=new InstagramAdsService({graphBaseUrl:mock.url,assetPolicy:new MockAssetPolicy(),timeoutMs:2000});});
after(async()=>{await mongoose.disconnect();await mongod?.stop();await mock?.stop();});
beforeEach(async()=>{mock.reset();await Promise.all([models.SocialOAuthState.deleteMany({}),models.SocialAd.deleteMany({}),models.SocialIntegration.deleteMany({}),models.Product.deleteMany({}),models.Store.deleteMany({}),models.User.deleteMany({})]);});

async function fixture(){const user=await models.User.create({role:'vendedor',name:'Instagram Tester',email:`ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'Mock Store',slug:`mock-${crypto.randomUUID().slice(0,8)}`,active:true});const product=await models.Product.create({storeId:store._id,quotaSlot:0,name:'Remera Mock',description:'Producto de prueba',images:['https://cdn.example.com/product.jpg'],price:25000,stock:10,active:true});const integration=await service.connectSandbox(store,user,{accessToken:TOKEN,adAccountId:'act_1001',pageId:'2001',instagramUserId:mock.instagramUserId});return {user,store,product,integration};}
async function createAd(fx,overrides={}){return service.createTrafficAd(fx.store,fx.user,{productId:fx.product._id,name:'Campaña Instagram Mock',primaryText:'Probando Instagram Ads sin gastar dinero',headline:'Remera Mock',dailyBudget:1500,countryCode:'AR',...overrides});}

test('sandbox valida cuenta publicitaria, Página e identidad profesional de Instagram y cifra el token',async()=>{const fx=await fixture();assert.equal(fx.integration.selectedInstagramUserId,mock.instagramUserId);const stored=await models.SocialIntegration.findOne({storeId:fx.store._id,provider:'instagram'}).select('+accessToken').lean();assert.match(stored.accessToken,/^v1:/);assert.notEqual(stored.accessToken,TOKEN);assert.equal(stored.pages[0].instagramUsername,'mock_store');const safe=await service.status(fx.store._id);assert.equal(Object.hasOwn(safe.integration||{},'accessToken'),false);});

test('OAuth usa la app Meta, solicita instagram_basic y descubre la cuenta profesional vinculada a la Página',async()=>{const user=await models.User.create({role:'vendedor',name:'OAuth IG',email:`oauth-ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'OAuth IG Store',slug:`oauth-ig-${crypto.randomUUID().slice(0,8)}`,active:true});const started=await service.createOAuthUrl(store,user);const authUrl=new URL(started.authUrl);assert.match(authUrl.searchParams.get('scope')||'',/instagram_basic/);assert.equal(authUrl.searchParams.get('redirect_uri'),process.env.META_INSTAGRAM_REDIRECT_URI);const state=authUrl.searchParams.get('state');await service.completeOAuth({state,code:'MOCK_IG_OAUTH_CODE',user});const stored=await models.SocialIntegration.findOne({storeId:store._id,provider:'instagram'}).select('+accessToken');assert.equal(stored.selectedAdAccountId,'act_1001');assert.equal(stored.selectedPageId,'2001');assert.equal(stored.selectedInstagramUserId,mock.instagramUserId);assert.equal(stored.pages[0].instagramUsername,'mock_store');assert.match(stored.accessToken,/^v1:/);for(const request of mock.requests.filter(item=>['/v26.0/me','/v26.0/me/adaccounts','/v26.0/me/accounts','/v26.0/me/permissions'].includes(item.path))){assert.equal(request.query.access_token,LONG_TOKEN);assert.equal(request.query.appsecret_proof,proofFor(LONG_TOKEN));}});

test('OAuth rechaza una cuenta sin Instagram profesional vinculado',async()=>{mock.instagramLinked=false;const user=await models.User.create({role:'vendedor',name:'No IG',email:`noig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'No IG Store',slug:`noig-${crypto.randomUUID().slice(0,8)}`});const {authUrl}=await service.createOAuthUrl(store,user);await assert.rejects(()=>service.completeOAuth({state:new URL(authUrl).searchParams.get('state'),code:'MOCK_IG_OAUTH_CODE',user}),e=>e.code==='INSTAGRAM_NO_PROFESSIONAL_ACCOUNTS');assert.equal(await models.SocialIntegration.countDocuments({storeId:store._id,provider:'instagram'}),0);});

test('OAuth rechaza permisos incompletos y no deja una integración parcial',async()=>{mock.missingPermission='instagram_basic';const user=await models.User.create({role:'vendedor',name:'Missing IG Scope',email:`scope-ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'Scope IG Store',slug:`scope-ig-${crypto.randomUUID().slice(0,8)}`});const {authUrl}=await service.createOAuthUrl(store,user);await assert.rejects(()=>service.completeOAuth({state:new URL(authUrl).searchParams.get('state'),code:'MOCK_IG_OAUTH_CODE',user}),e=>e.code==='INSTAGRAM_PERMISSIONS_MISSING');assert.equal(await models.SocialIntegration.countDocuments({storeId:store._id,provider:'instagram'}),0);});

test('creación completa usa sólo placements de Instagram, instagram_user_id y deja todo PAUSED',async()=>{const fx=await fixture();mock.requests=[];const result=await createAd(fx);const writes=mock.requests.filter(item=>item.method==='POST');assert.deepEqual(writes.map(item=>item.path),['/v26.0/act_1001/campaigns','/v26.0/act_1001/adsets','/v26.0/act_1001/adimages','/v26.0/act_1001/adcreatives','/v26.0/act_1001/ads']);assert.equal(writes[0].form.status,'PAUSED');const targeting=JSON.parse(writes[1].form.targeting);assert.deepEqual(targeting.publisher_platforms,['instagram']);assert.equal(writes[1].form.status,'PAUSED');const creative=JSON.parse(writes[3].form.object_story_spec);assert.equal(creative.page_id,'2001');assert.equal(creative.instagram_user_id,mock.instagramUserId);assert.equal(creative.link_data.image_hash,'mock_ig_image_hash');assert.equal(writes[4].form.status,'PAUSED');assert.equal(result.provider,'instagram');assert.equal(result.external.instagramUserId,mock.instagramUserId);assert.equal(await models.SocialAd.countDocuments({storeId:fx.store._id,provider:'instagram'}),1);});

test('si Meta falla después de crear la campaña hace rollback y no persiste el anuncio',async()=>{const fx=await fixture();mock.requests=[];mock.failSuffix='/act_1001/adcreatives';await assert.rejects(()=>createAd(fx));assert.ok(mock.requests.some(item=>item.method==='DELETE'&&item.path==='/v26.0/campaign_1'));assert.equal(await models.SocialAd.countDocuments({provider:'instagram'}),0);});

test('si Meta falla antes de crear la campaña no intenta borrar un ID inexistente',async()=>{const fx=await fixture();mock.requests=[];mock.failSuffix='/act_1001/campaigns';await assert.rejects(()=>createAd(fx));assert.equal(mock.requests.some(item=>item.method==='DELETE'),false);});

test('si Meta no devuelve hash de imagen aborta y limpia la campaña',async()=>{const fx=await fixture();mock.requests=[];mock.omitImageHash=true;await assert.rejects(()=>createAd(fx),e=>e.code==='INSTAGRAM_IMAGE_UPLOAD_FAILED');assert.ok(mock.requests.some(item=>item.method==='DELETE'&&item.path==='/v26.0/campaign_1'));});

test('un token inválido no crea integración local',async()=>{const user=await models.User.create({role:'vendedor',name:'Bad IG Token',email:`bad-ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'Bad IG Store',slug:`bad-ig-${crypto.randomUUID().slice(0,8)}`});await assert.rejects(()=>service.connectSandbox(store,user,{accessToken:'INVALID',adAccountId:'act_1001',pageId:'2001',instagramUserId:mock.instagramUserId}));assert.equal(await models.SocialIntegration.countDocuments({storeId:store._id}),0);});

test('una cuenta publicitaria inactiva se rechaza antes de persistir Instagram',async()=>{mock.accountStatus=2;const user=await models.User.create({role:'vendedor',name:'Inactive IG',email:`inactive-ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'Inactive IG Store',slug:`inactive-ig-${crypto.randomUUID().slice(0,8)}`});await assert.rejects(()=>service.connectSandbox(store,user,{accessToken:TOKEN,adAccountId:'act_1001',pageId:'2001',instagramUserId:mock.instagramUserId}),e=>e.code==='INSTAGRAM_AD_ACCOUNT_INACTIVE');});

test('Sandbox rechaza un Instagram User ID que no está vinculado a la Página',async()=>{const user=await models.User.create({role:'vendedor',name:'Wrong IG',email:`wrong-ig-${crypto.randomUUID()}@example.com`});const store=await models.Store.create({ownerId:user._id,ownerSlot:0,name:'Wrong IG Store',slug:`wrong-ig-${crypto.randomUUID().slice(0,8)}`});await assert.rejects(()=>service.connectSandbox(store,user,{accessToken:TOKEN,adAccountId:'act_1001',pageId:'2001',instagramUserId:'17841400000000999'}),e=>e.code==='INSTAGRAM_ACCOUNT_NOT_LINKED');assert.equal(await models.SocialIntegration.countDocuments({storeId:store._id}),0);});

test('refresh vuelve a validar la relación Página-Instagram y conserva los activos',async()=>{const fx=await fixture();mock.requests=[];const refreshed=await service.refresh(fx.store._id);assert.equal(refreshed.selectedInstagramUserId,mock.instagramUserId);assert.equal(refreshed.lastError,'');assert.equal(mock.requests.filter(item=>item.method==='GET').length,2);});

test('si Instagram se desvincula de la Página, refresh marca la integración con error',async()=>{const fx=await fixture();mock.requests=[];mock.instagramLinked=false;await assert.rejects(()=>service.refresh(fx.store._id),e=>e.code==='INSTAGRAM_ACCOUNT_NOT_LINKED');const stored=await models.SocialIntegration.findOne({storeId:fx.store._id,provider:'instagram'});assert.equal(stored.status,'error');assert.match(stored.lastError,/ya no está vinculada/i);});

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { auth } from '../../services/auth.js';
import { notify } from '../../services/notifications.js';
import { money, date } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';

const providers=['facebook','instagram','youtube','tiktok','google'];
const labels={facebook:'Facebook',instagram:'Instagram',youtube:'YouTube Ads',tiktok:'TikTok Ads',google:'Google Ads'};
const route=useRoute(),router=useRouter();
const loading=ref(true),working=ref(false),error=ref(''),data=ref(null),activeNetwork=ref('facebook');
const products=reactive(Object.fromEntries(providers.map(key=>[key,[]])));
const sandbox=reactive({facebook:{accessToken:'',adAccountId:'',pageId:''},instagram:{accessToken:'',adAccountId:'',pageId:'',instagramUserId:''}});
const assets=reactive({
  facebook:{adAccountId:'',pageId:''},instagram:{adAccountId:'',pageId:'',instagramUserId:''},
  google:{adAccountId:''},youtube:{adAccountId:''},tiktok:{adAccountId:'',identityKey:''},
});
const baseAd=()=>({productId:'',name:'',primaryText:'',headline:'',dailyBudget:1000,countryCode:'AR'});
const ads=reactive({facebook:baseAd(),instagram:baseAd(),google:baseAd(),youtube:{...baseAd(),youtubeVideo:'',logoUrl:''},tiktok:{...baseAd(),videoId:''}});
const facebook=computed(()=>data.value?.facebook||{}),instagram=computed(()=>data.value?.instagram||{});
const current=computed(()=>data.value?.[activeNetwork.value]||{});
const integration=computed(()=>current.value.integration||null);
const connected=computed(()=>Boolean(integration.value));
const isAdmin=computed(()=>auth.user?.role==='admin');
const connectionReady=computed(()=>integration.value?.status==='connected');
const selectedAccount=computed(()=>integration.value?.adAccounts?.find(item=>item.id===integration.value?.selectedAdAccountId));
const currentProducts=computed(()=>products[activeNetwork.value]||[]);
const eligibleProducts=computed(()=>['facebook','instagram'].includes(activeNetwork.value)?currentProducts.value.filter(item=>/^https?:\/\//i.test(item.imageUrl||'')):currentProducts.value);
const currentAd=computed(()=>ads[activeNetwork.value]);
const providerLabel=computed(()=>labels[activeNetwork.value]||activeNetwork.value);
const tiktokIdentityOptions=computed(()=>(integration.value?.identities||[]).map(item=>({value:`${item.type}::${item.id}`,label:item.username?`@${item.username} · ${item.name}`:item.name||item.id})));
const canCreate=computed(()=>{
  if(!connectionReady.value||!integration.value?.selectedAdAccountId||!eligibleProducts.value.length)return false;
  if(activeNetwork.value==='facebook')return Boolean(integration.value.selectedPageId);
  if(activeNetwork.value==='instagram')return Boolean(integration.value.selectedPageId&&integration.value.selectedInstagramUserId);
  if(activeNetwork.value==='youtube')return Boolean(currentAd.value.youtubeVideo);
  if(activeNetwork.value==='tiktok')return Boolean(integration.value.selectedIdentityId&&currentAd.value.videoId);
  return true;
});
const networkDescription={
  facebook:'Conectá tu Página y cuenta publicitaria para promocionar productos.',
  instagram:'Usá tu cuenta profesional de Instagram para crear anuncios.',
  youtube:'Creá campañas de video en YouTube mediante Google Ads.',
  tiktok:'Promocioná productos usando tus videos e identidad de TikTok.',
  google:'Creá anuncios de búsqueda que llevan a tus productos.',
};
const budget=value=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value||0));

function providerStatus(key){const item=data.value?.[key];if(!item?.integration)return 'Disponible';return item.integration.status==='connected'?'Conectado':'Revisar conexión';}
function syncAssets(provider){
  const item=data.value?.[provider]?.integration;
  assets[provider].adAccountId=item?.selectedAdAccountId||'';
  if(provider==='facebook'||provider==='instagram')assets[provider].pageId=item?.selectedPageId||'';
  if(provider==='instagram')assets.instagram.instagramUserId=item?.selectedInstagramUserId||'';
  if(provider==='tiktok')assets.tiktok.identityKey=item?.selectedIdentityId&&item?.selectedIdentityType?`${item.selectedIdentityType}::${item.selectedIdentityId}`:'';
}
function syncInstagramIdentity(){const page=instagram.value?.integration?.pages?.find(item=>item.id===assets.instagram.pageId);assets.instagram.instagramUserId=page?.instagramUserId||'';}
function tiktokIdentityPayload(){const [identityType='',...rest]=String(assets.tiktok.identityKey||'').split('::');return {identityType,identityId:rest.join('::')};}
async function loadProducts(provider){if(!data.value?.[provider]?.integration){products[provider]=[];return;}products[provider]=await api.get(`/stores/${workspace.activeStoreId}/social/${provider}/products`);}
async function load(){loading.value=true;error.value='';try{data.value=await api.get(`/stores/${workspace.activeStoreId}/social`);const allowed=(data.value?.networks||[]).map(item=>item.key);if(!allowed.includes(activeNetwork.value))activeNetwork.value=allowed[0]||'facebook';providers.forEach(provider=>{syncAssets(provider);if(!allowed.includes(provider))products[provider]=[]});await Promise.all(allowed.map(loadProducts));}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(async()=>{
  if(providers.includes(String(route.query.network||'')))activeNetwork.value=String(route.query.network);
  for(const provider of providers){if(route.query[provider]==='connected')notify.success(`${labels[provider]} quedó conectado a esta tienda.`);if(route.query[provider]==='error')notify.error(String(route.query.message||`No se pudo conectar ${labels[provider]}.`));}
  if(providers.some(provider=>route.query[provider])||route.query.network)await router.replace({path:route.path,query:{}});
  await load();
});
async function connect(provider=activeNetwork.value){working.value=true;try{const result=await api.post(`/stores/${workspace.activeStoreId}/social/${provider}/connect`,{});window.location.assign(result.authUrl)}catch(e){notify.error(e.message);working.value=false}}
async function connectSandbox(provider=activeNetwork.value){working.value=true;try{await api.post(`/stores/${workspace.activeStoreId}/social/${provider}/sandbox`,sandbox[provider]);sandbox[provider].accessToken='';notify.success(`Sandbox de ${labels[provider]} conectado.`);await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function saveAssets(provider=activeNetwork.value){
  working.value=true;try{
    let payload={...assets[provider]};
    if(provider==='instagram')syncInstagramIdentity();
    if(provider==='tiktok')payload={adAccountId:assets.tiktok.adAccountId,...tiktokIdentityPayload()};
    await api.put(`/stores/${workspace.activeStoreId}/social/${provider}/assets`,payload);notify.success(`Selección de ${labels[provider]} actualizada.`);await load();
  }catch(e){notify.error(e.message)}finally{working.value=false}
}
async function loadTikTokAssets(){working.value=true;try{await api.put(`/stores/${workspace.activeStoreId}/social/tiktok/assets`,{adAccountId:assets.tiktok.adAccountId});notify.success('Activos de TikTok actualizados.');await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function refreshAssets(provider=activeNetwork.value){working.value=true;try{await api.post(`/stores/${workspace.activeStoreId}/social/${provider}/refresh`,{});notify.success(`Activos de ${labels[provider]} actualizados.`);await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function disconnect(provider=activeNetwork.value){working.value=true;try{await api.delete(`/stores/${workspace.activeStoreId}/social/${provider}`);products[provider]=[];notify.success(`${labels[provider]} fue desconectado de esta tienda.`);await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
function productChanged(provider=activeNetwork.value){const form=ads[provider];const product=products[provider].find(item=>item._id===form.productId);if(!product)return;if(!form.name)form.name=`${product.name} · MiTiendaYa`;if(!form.headline)form.headline=product.name;if(!form.primaryText)form.primaryText=product.description||`Conocé ${product.name} en nuestra tienda.`;}
async function createAd(provider=activeNetwork.value){working.value=true;try{const created=await api.post(`/stores/${workspace.activeStoreId}/social/${provider}/ads`,ads[provider]);notify.success(`Anuncio creado en ${labels[provider]} en estado pausado (${created.external?.adId||'OK'}).`);ads[provider].name='';ads[provider].primaryText='';ads[provider].headline='';await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">DIFUSIÓN DE TU TIENDA</p><h1>Redes sociales y anuncios</h1><p>Conectá los canales de esta tienda y administrá sus integraciones publicitarias desde un solo lugar.</p></div></header>
  <div v-if="error" class="p-error">{{error}} <button class="btn btn-text" type="button" @click="load">Reintentar</button></div>
  <div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Preparando integraciones...</div>
  <template v-else-if="data">
    <section class="network-grid" aria-label="Redes publicitarias disponibles">
      <button v-for="network in data.networks" :key="network.key" type="button" class="network-card" :class="{'network-card-active':activeNetwork===network.key}" @click="activeNetwork=network.key">
        <div class="network-mark">{{network.label.slice(0,1)}}</div><div><strong>{{network.label}}</strong><p>{{networkDescription[network.key]}}</p></div><span class="badge" :class="providerStatus(network.key)==='Conectado'?'badge-success':''">{{providerStatus(network.key)}}</span>
      </button>
    </section>

    <section class="p-section-card connection-card">
      <div class="p-section-title"><div><h2>{{providerLabel}}</h2><p v-if="activeNetwork==='facebook'">{{isAdmin?`Marketing API ${current.apiVersion} · Los anuncios nacen pausados.`:'Creá anuncios para tus productos y revisalos antes de activarlos en Facebook.'}}</p><p v-else-if="activeNetwork==='instagram'">{{isAdmin?`Marketing API ${current.apiVersion} · Cuenta profesional vinculada a Meta.`:'Promocioná productos desde tu cuenta profesional de Instagram.'}}</p><p v-else-if="activeNetwork==='youtube'">{{isAdmin?'Creá campañas Demand Gen limitadas a YouTube. Todos los anuncios nacen pausados.':'Creá anuncios de video para tus productos y revisalos antes de activarlos en YouTube.'}}</p><p v-else-if="activeNetwork==='tiktok'">Usá una cuenta publicitaria, una identidad y un video de tu biblioteca de TikTok Ads.</p><p v-else>Creá campañas de búsqueda de Google que lleven directamente a tus productos.</p></div><span class="badge" :class="connectionReady?'badge-success':'badge-warning'">{{connected?(connectionReady?'Conectado':'Revisar conexión'):'Sin conectar'}}</span></div>

      <template v-if="!connected">
        <div v-if="['facebook','instagram'].includes(activeNetwork)" class="facebook-connect-grid" :class="{'facebook-connect-grid-seller':!isAdmin}">
          <div class="connect-option"><h3>Conexión normal</h3><p>Iniciá sesión, autorizá MiTiendaYa y elegí los activos publicitarios de esta tienda.</p><button class="btn btn-primary" type="button" :disabled="working||!current.oauthConfigured" @click="connect(activeNetwork)"><Icon name="link" :size="15"/>{{working?'Conectando…':`Conectar con ${providerLabel}`}}</button><small v-if="!current.oauthConfigured">{{isAdmin?'Falta completar la configuración general de esta integración.':`La conexión con ${providerLabel} todavía no está disponible. Contactá a la administración.`}}</small></div>
          <details v-if="isAdmin&&current.sandboxAllowed" class="connect-option sandbox-option"><summary>Prueba sin gasto · Sandbox</summary><div class="p-form-grid compact-grid"><div class="p-field full"><label>Token de prueba</label><input v-model.trim="sandbox[activeNetwork].accessToken" type="password" autocomplete="off"/></div><div class="p-field"><label>Cuenta publicitaria</label><input v-model.trim="sandbox[activeNetwork].adAccountId"/></div><div class="p-field"><label>Página</label><input v-model.trim="sandbox[activeNetwork].pageId"/></div><div v-if="activeNetwork==='instagram'" class="p-field full"><label>Instagram User ID</label><input v-model.trim="sandbox.instagram.instagramUserId"/></div></div><button class="btn btn-secondary" type="button" :disabled="working" @click="connectSandbox(activeNetwork)">Conectar Sandbox</button></details>
        </div>
        <div v-else class="connect-option full-connect"><h3>Conectar {{providerLabel}}</h3><p v-if="activeNetwork==='tiktok'">Autorizá MiTiendaYa desde TikTok for Business y luego elegí la cuenta publicitaria e identidad de esta tienda.</p><p v-else>Iniciá sesión con Google, autorizá MiTiendaYa y después elegí la cuenta publicitaria de esta tienda.</p><button class="btn btn-primary" type="button" :disabled="working||!current.oauthConfigured" @click="connect(activeNetwork)"><Icon name="link" :size="15"/>{{working?'Conectando…':`Conectar con ${providerLabel}`}}</button><small v-if="!current.oauthConfigured">{{isAdmin?'Falta completar la configuración general de esta integración.':`La conexión con ${providerLabel} todavía no está disponible. Contactá a la administración.`}}</small></div>
      </template>

      <template v-else>
        <div class="connection-summary"><div><span>Conexión</span><strong>{{isAdmin?(integration.connectionMode==='sandbox'?'Sandbox':'OAuth'):providerLabel}}</strong></div><div><span>Cuenta</span><strong>{{integration.externalUserName||providerLabel}}</strong></div><div><span>Última validación</span><strong>{{integration.lastValidatedAt?date(integration.lastValidatedAt):'—'}}</strong></div></div>
        <div v-if="integration.lastError" class="p-error">{{integration.lastError}}</div>

        <div v-if="activeNetwork==='facebook'||activeNetwork==='instagram'" class="p-form-grid asset-form">
          <div class="p-field"><label>Cuenta publicitaria</label><select v-model="assets[activeNetwork].adAccountId"><option value="">Elegí una cuenta</option><option v-for="account in integration.adAccounts" :key="account.id" :value="account.id">{{account.name}} · {{account.id}} · {{account.currency}}</option></select></div>
          <div class="p-field"><label>{{activeNetwork==='instagram'?'Cuenta profesional de Instagram':'Página de Facebook'}}</label><select v-model="assets[activeNetwork].pageId" @change="activeNetwork==='instagram'&&syncInstagramIdentity()"><option value="">Elegí una opción</option><option v-for="page in integration.pages" :key="page.id+(page.instagramUserId||'')" :value="page.id">{{activeNetwork==='instagram'?(page.instagramUsername?'@'+page.instagramUsername:'Instagram '+page.instagramUserId):page.name}} · {{page.name}}</option></select><small v-if="activeNetwork==='instagram'">Debe ser Business o Creator y estar vinculada a la Página.</small></div>
        </div>

        <div v-else-if="activeNetwork==='google'||activeNetwork==='youtube'" class="p-form-grid asset-form"><div class="p-field full"><label>Cuenta de Google Ads</label><select v-model="assets[activeNetwork].adAccountId"><option value="">Elegí una cuenta</option><option v-for="account in integration.adAccounts" :key="account.id" :value="account.id">{{account.name}} · {{account.id}} · {{account.currency}}{{account.managerCustomerId?' · vía '+account.managerCustomerId:''}}</option></select></div></div>

        <div v-else-if="activeNetwork==='tiktok'" class="p-form-grid asset-form">
          <div class="p-field"><label>Cuenta publicitaria</label><select v-model="assets.tiktok.adAccountId"><option value="">Elegí una cuenta</option><option v-for="account in integration.adAccounts" :key="account.id" :value="account.id">{{account.name}} · {{account.id}} · {{account.currency}}</option></select><small>Cambiá la cuenta y cargá sus identidades/videos antes de guardar la identidad.</small></div>
          <div class="p-field"><label>Identidad publicitaria</label><select v-model="assets.tiktok.identityKey"><option value="">Elegí una identidad</option><option v-for="identity in tiktokIdentityOptions" :key="identity.value" :value="identity.value">{{identity.label}}</option></select><small v-if="assets.tiktok.adAccountId&&!tiktokIdentityOptions.length">No encontramos una identidad compatible para crear anuncios con videos de tu biblioteca. Creala o autorizala en TikTok Ads Manager y actualizá los activos.</small></div>
        </div>

        <div class="p-inline connection-actions">
          <button v-if="activeNetwork==='tiktok'" class="btn btn-secondary" type="button" :disabled="working||!assets.tiktok.adAccountId" @click="loadTikTokAssets">Cargar activos de la cuenta</button>
          <button class="btn btn-primary" type="button" :disabled="working||!assets[activeNetwork].adAccountId||(activeNetwork==='facebook'&&!assets.facebook.pageId)||(activeNetwork==='instagram'&&(!assets.instagram.pageId||!assets.instagram.instagramUserId))||(activeNetwork==='tiktok'&&!assets.tiktok.identityKey)" @click="saveAssets(activeNetwork)">Guardar selección</button>
          <button class="btn btn-secondary" type="button" :disabled="working" @click="refreshAssets(activeNetwork)"><Icon name="refresh" :size="15"/>Actualizar activos</button>
          <button class="btn btn-text" type="button" :disabled="working" @click="disconnect(activeNetwork)">Desconectar</button>
        </div>
      </template>
    </section>

    <section v-if="connected" class="p-section-card">
      <div class="p-section-title"><div><h2>Crear anuncio de producto</h2><p>Se crea pausado para que puedas revisarlo antes de activarlo desde {{providerLabel}}.</p></div><Icon name="megaphone"/></div>
      <div v-if="!canCreate" class="p-info"><strong>Antes de crear:</strong> completá la conexión y selección de activos de {{providerLabel}}. También necesitás al menos un producto activo.</div>
      <form class="p-form" @submit.prevent="createAd(activeNetwork)"><div class="p-form-grid">
        <div class="p-field full"><label :for="activeNetwork+'-product'">Producto</label><select :id="activeNetwork+'-product'" v-model="currentAd.productId" required @change="productChanged(activeNetwork)"><option value="">Elegí el producto a promocionar</option><option v-for="product in eligibleProducts" :key="product._id" :value="product._id">{{product.name}} · {{money(product.price)}}</option></select><small>El anuncio enlaza a la ficha pública del producto.</small></div>
        <div class="p-field full"><label :for="activeNetwork+'-ad-name'">Nombre interno del anuncio</label><input :id="activeNetwork+'-ad-name'" v-model.trim="currentAd.name" required maxlength="120" placeholder="Remera Naruto · Octubre"/></div>
        <div class="p-field full"><label :for="activeNetwork+'-primary-text'">Texto principal</label><textarea :id="activeNetwork+'-primary-text'" v-model.trim="currentAd.primaryText" required maxlength="1000" rows="4"/></div>
        <div v-if="activeNetwork!=='tiktok'" class="p-field full"><label :for="activeNetwork+'-headline'">Título</label><input :id="activeNetwork+'-headline'" v-model.trim="currentAd.headline" required maxlength="255"/></div>
        <div v-if="activeNetwork==='youtube'" class="p-field full"><label for="youtube-video">Video de YouTube</label><input id="youtube-video" v-model.trim="currentAd.youtubeVideo" required maxlength="2048" placeholder="https://www.youtube.com/watch?v=..."/><small>Podés pegar la URL del video o su ID de 11 caracteres.</small></div>
        <div v-if="activeNetwork==='youtube'" class="p-field full"><label for="youtube-logo">Logo opcional</label><input id="youtube-logo" v-model.trim="currentAd.logoUrl" maxlength="2048" placeholder="https://..."/><small>Si lo dejás vacío se intenta usar el icono de la tienda o la imagen del producto.</small></div>
        <div v-if="activeNetwork==='tiktok'" class="p-field full"><label for="tiktok-video">Video de TikTok Ads</label><select id="tiktok-video" v-model="currentAd.videoId" required><option value="">Elegí un video de la biblioteca</option><option v-for="video in integration.videos||[]" :key="video.id" :value="video.id">{{video.name}}</option></select></div>
        <div class="p-field"><label :for="activeNetwork+'-budget'">Presupuesto diario</label><input :id="activeNetwork+'-budget'" v-model.number="currentAd.dailyBudget" type="number" min="1" step="0.01" required/><small>{{selectedAccount?.currency||'Moneda de la cuenta'}}. No se consume mientras permanezca pausado.</small></div>
        <div class="p-field"><label :for="activeNetwork+'-country'">País objetivo</label><input :id="activeNetwork+'-country'" v-model.trim="currentAd.countryCode" required maxlength="2" pattern="[A-Za-z]{2}"/><small>Código ISO de dos letras. Por defecto AR.</small></div>
      </div><div class="p-form-actions"><button class="btn btn-primary" :disabled="working||!canCreate">{{working?`Creando en ${providerLabel}…`:'Crear anuncio pausado'}}</button></div></form>
    </section>

    <section v-if="connected" class="p-section-card"><div class="p-section-title"><div><h2>Anuncios creados desde MiTiendaYa</h2><p>Últimos anuncios registrados para {{providerLabel}} en esta tienda.</p></div><Icon name="chart"/></div><div v-if="!current.ads?.length" class="social-empty">Todavía no creaste anuncios de {{providerLabel}} desde MiTiendaYa.</div><div v-else class="ads-list"><article v-for="row in current.ads" :key="row._id"><div><strong>{{row.name}}</strong><small>{{date(row.createdAt)}} · {{row.external?.adId?'Ad '+row.external.adId:'Sin ID externo'}}</small></div><div><span>{{budget(row.dailyBudget)}} {{row.currency}}</span><span class="badge badge-warning">Pausado</span></div></article></div></section>

    <section v-if="isAdmin" class="p-section-card setup-help"><div class="p-section-title"><div><h2>Qué necesita {{providerLabel}}</h2><p>Recordatorio técnico visible únicamente para administración.</p></div><Icon name="info"/></div>
      <dl v-if="activeNetwork==='facebook'||activeNetwork==='instagram'"><div><dt>META_APP_ID / SECRET</dt><dd>Aplicación de Meta usada para autorizar vendedores.</dd></div><div><dt>Redirect</dt><dd>{{current.redirectUri}}</dd></div><div><dt>Permisos</dt><dd><code>{{current.requiredScopes?.join(', ')}}</code></dd></div></dl>
      <dl v-else-if="activeNetwork==='google'||activeNetwork==='youtube'"><div><dt>Google Cloud / OAuth</dt><dd>Configurá GOOGLE_ADS_CLIENT_ID y GOOGLE_ADS_CLIENT_SECRET en administración.</dd></div><div><dt>Redirect</dt><dd>{{current.redirectUri}}</dd></div><div><dt>API</dt><dd>Google Ads {{current.apiVersion}} · scope <code>{{current.requiredScopes?.join(', ')}}</code></dd></div><div v-if="activeNetwork==='youtube'"><dt>Tipo de campaña</dt><dd>Demand Gen restringido a ubicaciones de YouTube.</dd></div></dl>
      <dl v-else><div><dt>TikTok for Business</dt><dd>Configurá App ID, App Secret y la URL de autorización de la aplicación.</dd></div><div><dt>Redirect</dt><dd>{{current.redirectUri}}</dd></div><div><dt>API</dt><dd>Marketing API {{current.apiVersion}}</dd></div><div><dt>Activos</dt><dd>Cada vendedor debe autorizar un anunciante, disponer de una identidad no-Spark compatible y de un video en su biblioteca publicitaria.</dd></div></dl>
    </section>
  </template>
</div>
</template>

<style scoped>
.network-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin-bottom:22px}.network-card{appearance:none;text-align:left;font:inherit;color:inherit;display:grid;grid-template-columns:44px 1fr;gap:12px;position:relative;padding:18px;border:1px solid var(--line);border-radius:13px;background:var(--surface);opacity:.76;cursor:pointer}.network-card:hover{border-color:var(--line-strong);transform:translateY(-1px)}.network-card-active{opacity:1;border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}.network-card>.badge{grid-column:2;justify-self:start}.network-mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--surface-alt);font-size:18px;font-weight:800}.network-card strong{font-size:13px}.network-card p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.connection-card{margin-top:0}.facebook-connect-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.facebook-connect-grid-seller{grid-template-columns:1fr}.facebook-connect-grid-seller .connect-option,.full-connect{width:100%}.connect-option{border:1px solid var(--line);border-radius:12px;padding:18px}.connect-option h3{margin:0 0 6px}.connect-option p{font-size:12px;color:var(--muted);line-height:1.6}.connect-option>small{display:block;margin-top:10px;color:var(--muted)}.sandbox-option summary{cursor:pointer;font-weight:700;font-size:13px}.sandbox-option[open] summary{margin-bottom:10px}.compact-grid{margin:12px 0}.connection-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.connection-summary>div{display:flex;flex-direction:column;gap:5px;border:1px solid var(--line);border-radius:10px;padding:14px}.connection-summary span{font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:750}.connection-summary strong{font-size:12px;overflow-wrap:anywhere}.asset-form{margin-top:10px}.connection-actions{margin-top:16px;flex-wrap:wrap}.social-empty{padding:24px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12px}.ads-list{display:grid;gap:10px}.ads-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;border:1px solid var(--line);border-radius:10px}.ads-list article>div{display:flex;flex-direction:column;gap:4px}.ads-list small{color:var(--muted);font-size:10px}.ads-list article>div:last-child{align-items:flex-end}.setup-help dl{display:grid;gap:0;margin:0}.setup-help dl>div{display:grid;grid-template-columns:220px 1fr;gap:18px;padding:14px 0;border-bottom:1px solid var(--line)}.setup-help dl>div:last-child{border-bottom:0}.setup-help dt{font-size:12px;font-weight:700}.setup-help dd{margin:0;font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.setup-help code{font-size:10px}@media(max-width:1200px){.network-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1000px){.network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.network-grid,.facebook-connect-grid,.connection-summary{grid-template-columns:1fr}.setup-help dl>div{grid-template-columns:1fr;gap:5px}.ads-list article{align-items:flex-start;flex-direction:column}.ads-list article>div:last-child{align-items:flex-start}}
</style>

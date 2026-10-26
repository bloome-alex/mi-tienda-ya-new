<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { notify } from '../../services/notifications.js';
import { money, date } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';

const route=useRoute(),router=useRouter();
const loading=ref(true),working=ref(false),error=ref(''),data=ref(null),products=ref([]);
const sandbox=reactive({accessToken:'',adAccountId:'',pageId:''});
const assets=reactive({adAccountId:'',pageId:''});
const ad=reactive({productId:'',name:'',primaryText:'',headline:'',dailyBudget:1000,countryCode:'AR'});
const facebook=computed(()=>data.value?.facebook||{});
const integration=computed(()=>facebook.value.integration||null);
const connected=computed(()=>Boolean(integration.value));
const connectionReady=computed(()=>integration.value?.status==='connected');
const selectedAccount=computed(()=>integration.value?.adAccounts?.find(item=>item.id===integration.value?.selectedAdAccountId));
const eligibleProducts=computed(()=>(products.value||[]).filter(item=>/^https?:\/\//i.test(item.imageUrl||'')));
const canCreate=computed(()=>connectionReady.value&&integration.value?.selectedAdAccountId&&integration.value?.selectedPageId&&eligibleProducts.value.length>0);
const networkDescription={facebook:'Conectá una Página y una cuenta publicitaria para crear anuncios desde MiTiendaYa.',instagram:'La integración publicitaria directa con Instagram llegará en una próxima versión.',youtube:'La integración de campañas de YouTube llegará en una próxima versión.',tiktok:'La integración publicitaria con TikTok llegará en una próxima versión.'};
const budget=value=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value||0));

function syncAssets(){assets.adAccountId=integration.value?.selectedAdAccountId||'';assets.pageId=integration.value?.selectedPageId||'';}
async function load(){loading.value=true;error.value='';try{data.value=await api.get(`/stores/${workspace.activeStoreId}/social`);syncAssets();if(connected.value)products.value=await api.get(`/stores/${workspace.activeStoreId}/social/facebook/products`)}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(async()=>{if(route.query.facebook==='connected')notify.success('Facebook quedó conectado a esta tienda.');if(route.query.facebook==='error')notify.error(String(route.query.message||'No se pudo conectar Facebook.'));if(route.query.facebook)await router.replace({path:route.path,query:{}});await load();});
async function connect(){working.value=true;try{const result=await api.post(`/stores/${workspace.activeStoreId}/social/facebook/connect`,{});window.location.assign(result.authUrl)}catch(e){notify.error(e.message);working.value=false}}
async function connectSandbox(){working.value=true;try{await api.post(`/stores/${workspace.activeStoreId}/social/facebook/sandbox`,sandbox);sandbox.accessToken='';notify.success('Sandbox de Facebook conectado.');await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function saveAssets(){working.value=true;try{await api.put(`/stores/${workspace.activeStoreId}/social/facebook/assets`,assets);notify.success('Cuenta publicitaria y Página actualizadas.');await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function refreshAssets(){working.value=true;try{await api.post(`/stores/${workspace.activeStoreId}/social/facebook/refresh`,{});notify.success('Activos de Facebook actualizados.');await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
async function disconnect(){working.value=true;try{await api.delete(`/stores/${workspace.activeStoreId}/social/facebook`);products.value=[];notify.success('Facebook fue desconectado de esta tienda.');await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
function productChanged(){const product=products.value.find(item=>item._id===ad.productId);if(!product)return;if(!ad.name)ad.name=`${product.name} · MiTiendaYa`;if(!ad.headline)ad.headline=product.name;if(!ad.primaryText)ad.primaryText=product.description||`Conocé ${product.name} en nuestra tienda.`;}
async function createAd(){working.value=true;try{const created=await api.post(`/stores/${workspace.activeStoreId}/social/facebook/ads`,ad);notify.success(`Anuncio creado en Facebook en estado pausado (${created.external?.adId||'OK'}).`);ad.name='';ad.primaryText='';ad.headline='';await load()}catch(e){notify.error(e.message)}finally{working.value=false}}
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">DIFUSIÓN DE TU TIENDA</p><h1>Redes sociales y anuncios</h1><p>Conectá los canales de esta tienda y administrá sus integraciones publicitarias desde un solo lugar.</p></div></header>
  <div v-if="error" class="p-error">{{error}} <button class="btn btn-text" type="button" @click="load">Reintentar</button></div>
  <div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Preparando integraciones...</div>
  <template v-else-if="data">
    <section class="network-grid" aria-label="Redes sociales disponibles">
      <article v-for="network in data.networks" :key="network.key" class="network-card" :class="{'network-card-active':network.key==='facebook'}">
        <div class="network-mark">{{network.label.slice(0,1)}}</div><div><strong>{{network.label}}</strong><p>{{networkDescription[network.key]}}</p></div><span class="badge" :class="network.status==='available'?'badge-success':''">{{network.status==='available'?(connected?(connectionReady?'Conectado':'Revisar conexión'):'Disponible'):'Muy pronto'}}</span>
      </article>
    </section>

    <section class="p-section-card facebook-card">
      <div class="p-section-title"><div><h2>Facebook Ads</h2><p>Marketing API {{facebook.apiVersion}} · Los anuncios creados desde esta pantalla nacen siempre pausados.</p></div><span class="badge" :class="connectionReady?'badge-success':'badge-warning'">{{connected?(connectionReady?'Conectado':'Revisar conexión'):'Sin conectar'}}</span></div>
      <div v-if="!connected" class="facebook-connect-grid">
        <div class="connect-option"><h3>Conexión normal</h3><p>Iniciá sesión en Meta, autorizá MiTiendaYa y después elegí la cuenta publicitaria y la Página que va a representar a tu tienda.</p><button class="btn btn-primary" type="button" :disabled="working||!facebook.oauthConfigured" @click="connect"><Icon name="link" :size="15"/>{{working?'Conectando…':'Conectar con Facebook'}}</button><small v-if="!facebook.oauthConfigured">El servidor todavía necesita META_APP_ID y META_APP_SECRET.</small></div>
        <details v-if="facebook.sandboxAllowed" class="connect-option sandbox-option"><summary>Prueba sin gasto · Marketing API Sandbox</summary><p>Usá un Sandbox Ad Account de Meta. El token se envía únicamente al backend y se guarda cifrado.</p><div class="p-form-grid"><div class="p-field full"><label for="sandbox-token">Sandbox Access Token</label><input id="sandbox-token" v-model.trim="sandbox.accessToken" type="password" autocomplete="off" placeholder="EAA..."/></div><div class="p-field"><label for="sandbox-account">Ad Account ID</label><input id="sandbox-account" v-model.trim="sandbox.adAccountId" placeholder="act_123456789"/></div><div class="p-field"><label for="sandbox-page">Facebook Page ID</label><input id="sandbox-page" v-model.trim="sandbox.pageId" placeholder="123456789"/></div></div><button class="btn btn-secondary" type="button" :disabled="working||!sandbox.accessToken||!sandbox.adAccountId||!sandbox.pageId" @click="connectSandbox">Conectar Sandbox</button></details>
      </div>
      <template v-else>
        <div class="connection-summary"><div><span>Conexión</span><strong>{{integration.connectionMode==='sandbox'?'Sandbox (sin entrega)':'OAuth de Facebook'}}</strong></div><div><span>Cuenta</span><strong>{{integration.externalUserName||'Facebook'}}</strong></div><div><span>Última validación</span><strong>{{integration.lastValidatedAt?date(integration.lastValidatedAt):'—'}}</strong></div></div>
        <div v-if="integration.lastError" class="p-error">{{integration.lastError}}</div>
        <div class="p-form-grid asset-form"><div class="p-field"><label for="facebook-ad-account">Cuenta publicitaria</label><select id="facebook-ad-account" v-model="assets.adAccountId"><option value="">Elegí una cuenta</option><option v-for="account in integration.adAccounts" :key="account.id" :value="account.id">{{account.name}} · {{account.id}} · {{account.currency}}</option></select></div><div class="p-field"><label for="facebook-page">Página de Facebook</label><select id="facebook-page" v-model="assets.pageId"><option value="">Elegí una Página</option><option v-for="page in integration.pages" :key="page.id" :value="page.id">{{page.name}}</option></select></div></div>
        <div class="p-inline connection-actions"><button class="btn btn-primary" type="button" :disabled="working||!assets.adAccountId||!assets.pageId" @click="saveAssets">Guardar selección</button><button class="btn btn-secondary" type="button" :disabled="working" @click="refreshAssets"><Icon name="refresh" :size="15"/>Actualizar activos</button><button class="btn btn-text" type="button" :disabled="working" @click="disconnect">Desconectar</button></div>
      </template>
    </section>

    <section v-if="connected" class="p-section-card">
      <div class="p-section-title"><div><h2>Crear anuncio de producto</h2><p>Se crea una campaña de tráfico, su conjunto, el creativo y el anuncio. Todo queda en PAUSED para que lo revises antes de activar desde Meta Ads Manager.</p></div><Icon name="megaphone"/></div>
      <div v-if="!canCreate" class="p-info"><strong>Antes de crear:</strong> elegí la cuenta publicitaria y la Página. Además, necesitás al menos un producto activo con una primera imagen pública HTTP/HTTPS.</div>
      <form class="p-form" @submit.prevent="createAd"><div class="p-form-grid"><div class="p-field full"><label for="facebook-product">Producto</label><select id="facebook-product" v-model="ad.productId" required @change="productChanged"><option value="">Elegí el producto a promocionar</option><option v-for="product in eligibleProducts" :key="product._id" :value="product._id">{{product.name}} · {{money(product.price)}}</option></select><small>El anuncio enlaza directamente a la ficha pública del producto y usa su primera imagen.</small></div><div class="p-field full"><label for="facebook-ad-name">Nombre interno del anuncio</label><input id="facebook-ad-name" v-model.trim="ad.name" required maxlength="120" placeholder="Remera Naruto · Octubre"/></div><div class="p-field full"><label for="facebook-primary-text">Texto principal</label><textarea id="facebook-primary-text" v-model.trim="ad.primaryText" required maxlength="1000" rows="4" placeholder="Contale a tu público por qué debería conocer este producto."/></div><div class="p-field full"><label for="facebook-headline">Título</label><input id="facebook-headline" v-model.trim="ad.headline" required maxlength="255"/></div><div class="p-field"><label for="facebook-budget">Presupuesto diario</label><input id="facebook-budget" v-model.number="ad.dailyBudget" type="number" min="1" step="0.01" required/><small>{{selectedAccount?.currency||'Moneda de la cuenta'}}. No se consume mientras el anuncio permanezca pausado.</small></div><div class="p-field"><label for="facebook-country">País objetivo</label><input id="facebook-country" v-model.trim="ad.countryCode" required maxlength="2" pattern="[A-Za-z]{2}"/><small>Código ISO de dos letras. Por defecto AR.</small></div></div><div class="p-form-actions"><button class="btn btn-primary" :disabled="working||!canCreate">{{working?'Creando en Facebook…':'Crear anuncio pausado'}}</button></div></form>
    </section>

    <section v-if="connected" class="p-section-card">
      <div class="p-section-title"><div><h2>Anuncios creados desde MiTiendaYa</h2><p>Últimos anuncios registrados para esta tienda.</p></div><Icon name="chart"/></div>
      <div v-if="!facebook.ads?.length" class="social-empty">Todavía no creaste anuncios desde MiTiendaYa.</div>
      <div v-else class="ads-list"><article v-for="row in facebook.ads" :key="row._id"><div><strong>{{row.name}}</strong><small>{{date(row.createdAt)}} · {{row.external?.adId?'Ad '+row.external.adId:'Sin ID externo'}}</small></div><div><span>{{budget(row.dailyBudget)}} {{row.currency}}</span><span class="badge badge-warning">PAUSADO</span></div></article></div>
    </section>

    <section class="p-section-card setup-help">
      <div class="p-section-title"><div><h2>Qué necesita Facebook</h2><p>Estos datos se configuran una sola vez en el servidor, no por tienda.</p></div><Icon name="info"/></div>
      <dl><div><dt>META_APP_ID</dt><dd>Identifica tu aplicación de Meta cuando un vendedor inicia la conexión.</dd></div><div><dt>META_APP_SECRET</dt><dd>Permite al backend intercambiar el código OAuth y firmar llamadas. Nunca se envía al navegador.</dd></div><div><dt>META_REDIRECT_URI</dt><dd>Es la URL exacta a la que Meta devuelve al usuario después de autorizar. Debe coincidir con Facebook Login for Business.</dd></div><div><dt>META_FACEBOOK_LOGIN_CONFIG_ID</dt><dd>Opcional. Usa una configuración de Facebook Login for Business con los permisos publicitarios definidos en Meta.</dd></div><div><dt>Permisos</dt><dd><code>{{facebook.requiredScopes?.join(', ')}}</code></dd></div></dl>
    </section>
  </template>
</div>
</template>

<style scoped>
.network-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px}.network-card{display:grid;grid-template-columns:44px 1fr;gap:12px;position:relative;padding:18px;border:1px solid var(--line);border-radius:13px;background:var(--surface);opacity:.7}.network-card-active{opacity:1}.network-card>.badge{grid-column:2;justify-self:start}.network-mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--surface-alt);font-size:18px;font-weight:800}.network-card strong{font-size:13px}.network-card p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.facebook-card{margin-top:0}.facebook-connect-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.connect-option{border:1px solid var(--line);border-radius:12px;padding:18px}.connect-option h3{margin:0 0 6px}.connect-option p{font-size:12px;color:var(--muted);line-height:1.6}.connect-option>small{display:block;margin-top:10px;color:var(--muted)}.sandbox-option summary{cursor:pointer;font-weight:700;font-size:13px}.sandbox-option[open] summary{margin-bottom:10px}.connection-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.connection-summary>div{display:flex;flex-direction:column;gap:5px;border:1px solid var(--line);border-radius:10px;padding:14px}.connection-summary span{font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:750}.connection-summary strong{font-size:12px;overflow-wrap:anywhere}.asset-form{margin-top:10px}.connection-actions{margin-top:16px;flex-wrap:wrap}.social-empty{padding:24px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12px}.ads-list{display:grid;gap:10px}.ads-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;border:1px solid var(--line);border-radius:10px}.ads-list article>div{display:flex;flex-direction:column;gap:4px}.ads-list small{color:var(--muted);font-size:10px}.ads-list article>div:last-child{align-items:flex-end}.setup-help dl{display:grid;gap:0;margin:0}.setup-help dl>div{display:grid;grid-template-columns:220px 1fr;gap:18px;padding:14px 0;border-bottom:1px solid var(--line)}.setup-help dl>div:last-child{border-bottom:0}.setup-help dt{font-size:12px;font-weight:700}.setup-help dd{margin:0;font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.setup-help code{font-size:10px}@media(max-width:1000px){.network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.network-grid,.facebook-connect-grid,.connection-summary{grid-template-columns:1fr}.setup-help dl>div{grid-template-columns:1fr;gap:5px}.ads-list article{align-items:flex-start;flex-direction:column}.ads-list article>div:last-child{align-items:flex-start}}
</style>

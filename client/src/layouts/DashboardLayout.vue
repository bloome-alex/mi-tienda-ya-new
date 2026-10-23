<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, logout, canFeature } from '../services/auth.js';
import { workspace, loadStores, loadTransferSummary, selectStore, ensureWorkspaceCanLeave } from '../services/workspace.js';
import { notify } from '../services/notifications.js';
import { api } from '../services/api.js';
import { money, shortDate } from '../services/panel.js';
import Icon from '../components/Icon.vue';
import ThemeToggle from '../components/ThemeToggle.vue';
import BrandWordmark from '../components/BrandWordmark.vue';
import '../styles/panel.css';
const route=useRoute(),router=useRouter();const open=ref(false),initializing=ref(true),switching=ref(false),exiting=ref(false),subscriptionAlert=ref(null);let touchStart=0;
const isAdmin=computed(()=>auth.user?.role==='admin');
const isDesign=computed(()=>route.matched.some(record=>record.path==='/app/design'));
const store=computed(()=>workspace.stores.find(s=>s._id===workspace.activeStoreId));
const transferSummary=computed(()=>workspace.transferSummary||{});
const pendingTransferStoreIds=computed(()=>new Set(transferSummary.value.pendingOutgoingStoreIds||[]));
const showTransfers=computed(()=>!isAdmin.value&&(canFeature('stores.transfer')||Number(transferSummary.value.pendingIncomingCount||0)>0||(transferSummary.value.pendingOutgoingStoreIds||[]).length>0||(transferSummary.value.history||[]).some(item=>item.canReturn)));
const initials=computed(()=>(auth.user?.name||auth.user?.email||'A').slice(0,2).toUpperCase());
const adminLinks=[['Resumen','/app/dashboard','grid'],['Usuarios','/app/users','users'],['Tiendas','/app/stores','store'],['Emails','/app/emails','mail'],['Configuración','/app/settings','settings'],['Auditoría','/app/audit','shield']];
const sellerLinks=[['Resumen','/app/dashboard','grid',null],['Productos','/app/products','package','section.products'],['Categorías','/app/categories','tag','section.categories'],['Stock','/app/stock','stock','section.stock'],['Pedidos','/app/orders','receipt','section.orders']];
const storeLinks=[['Diseño de la tienda','/app/design','palette','section.design'],['Dominio','/app/domain','globe','section.domain'],['Aplicación PWA','/app/pwa','phone','section.pwa'],['Cobros y entregas','/app/payments','credit','section.payments'],['Contacto','/app/contact','phone','section.contact']];
const visibleSellerLinks=computed(()=>isAdmin.value?sellerLinks:sellerLinks.filter(link=>!link[3]||canFeature(link[3])));
const visibleStoreLinks=computed(()=>isAdmin.value?storeLinks:storeLinks.filter(link=>!link[3]||canFeature(link[3])));
watch(()=>route.fullPath,()=>{open.value=false;});
onMounted(async()=>{try{await loadStores();if(!isAdmin.value){const [data]=await Promise.all([api.get('/me/subscription'),loadTransferSummary()]);if(data.subscription?.periodsDue>0){subscriptionAlert.value=data.subscription;notify.error(`No se pudo acreditar el último pago de tu suscripción. Adeudás ${money(data.subscription.debtAmount)}.`)}}}catch(e){notify.error(e.message)}finally{initializing.value=false}});
async function exit(){
 if(exiting.value||switching.value)return;
 exiting.value=true;
 try{
  if(!await ensureWorkspaceCanLeave())return;
  await logout();
  await router.push('/login');
  workspace.stores=[];workspace.activeStoreId='';
 }catch(e){notify.error(e.message)}finally{exiting.value=false}
}
async function changeStore(event){const target=event.target;if(switching.value){target.value=workspace.activeStoreId;return;}switching.value=true;try{await selectStore(target.value)}catch(e){notify.error(e.message)}finally{target.value=workspace.activeStoreId;switching.value=false;}}
function handleTouch(e){const dx=e.changedTouches[0].clientX-touchStart;if(dx>80&&touchStart<45)open.value=true;if(dx< -80)open.value=false;}
async function exitImpersonation(){try{await api.post('/auth/impersonation/exit',{});window.location.assign('/app/users')}catch(e){notify.error(e.message)}}
</script>
<template>
<div class="p-app" :class="{'p-app-design':isDesign}" @touchstart.passive="touchStart=$event.touches[0].clientX" @touchend.passive="handleTouch">
 <header class="p-navbar">
  <div class="p-brand-area"><button class="p-icon-btn p-mobile-menu" @click="open=!open" :aria-expanded="open" aria-label="Abrir menú"><Icon name="menu"/></button><RouterLink to="/app/dashboard" class="p-brand"><span class="p-logo"><Icon name="store" :size="22"/></span><span><BrandWordmark/><small>{{isAdmin?'Administración':'Panel de ventas'}}</small></span></RouterLink></div>
  <div class="p-navbar-store"><span class="p-navbar-store-icon"><Icon name="store" :size="18"/></span><div><label for="navbar-store-selector">{{isAdmin?'TIENDA A GESTIONAR':'ESTÁS TRABAJANDO EN'}}</label><select id="navbar-store-selector" :value="workspace.activeStoreId" @change="changeStore" :disabled="workspace.loading||switching||exiting||!workspace.stores.length" :aria-busy="switching"><option v-if="!workspace.stores.length" value="">{{workspace.loading?'Cargando tiendas…':'Sin tiendas asignadas'}}</option><option v-for="s in workspace.stores" :key="s._id" :value="s._id">{{s.name}}{{pendingTransferStoreIds.has(s._id)?' · Transferencia pendiente':''}}</option></select></div><span v-if="store" class="p-navbar-store-state" :class="{published:store.active}">{{pendingTransferStoreIds.has(store._id)?'Transferencia pendiente':store.active?'Publicada':'Borrador'}}</span></div>
  <div class="p-navbar-right"><RouterLink v-if="showTransfers" to="/app/transfers" class="p-icon-btn p-transfer-nav" title="Transferencias de tiendas"><Icon name="transfer" :size="17"/><span v-if="transferSummary.pendingIncomingCount" class="p-transfer-badge">{{transferSummary.pendingIncomingCount}}</span></RouterLink><a v-if="store" :href="store.publicUrl || `/t/${store.slug}`" class="p-visit-store" target="_blank" rel="noopener"><Icon name="external" :size="16"/><span>Ver tienda</span></a><ThemeToggle/><span class="p-avatar">{{initials}}</span><div class="p-user-label"><strong>{{auth.user?.name||auth.user?.username||'Mi cuenta'}}</strong><small>{{isAdmin?'Administrador':'Vendedor'}}</small></div></div>
 </header>
 <button v-if="open" class="p-sidebar-overlay" @click="open=false" aria-label="Cerrar menú"/>
 <aside class="p-sidebar" :class="{'p-sidebar-open':open}">

  <nav aria-label="Navegación principal"><p class="p-nav-label">{{isAdmin?'PLATAFORMA':'ADMINISTRAR'}}</p><RouterLink v-for="link in (isAdmin?adminLinks:visibleSellerLinks)" :key="link[1]" :to="link[1]" class="p-nav-link"><Icon :name="link[2]"/><span>{{link[0]}}</span></RouterLink><template v-if="isAdmin&&store"><p class="p-nav-label">CONTENIDO DE {{store.name}}</p><RouterLink v-for="link in sellerLinks.slice(1)" :key="link[1]" :to="link[1]" class="p-nav-link"><Icon :name="link[2]"/><span>{{link[0]}}</span></RouterLink></template><template v-if="store"><p class="p-nav-label">TU TIENDA</p><RouterLink v-for="link in visibleStoreLinks" :key="link[1]" :to="link[1]" class="p-nav-link"><Icon :name="link[2]"/><span>{{link[0]}}</span></RouterLink></template><RouterLink v-if="!isAdmin" to="/app/subscription" class="p-nav-link"><Icon name="crown"/><span>Mi suscripción</span></RouterLink></nav>
  <div class="p-sidebar-bottom"><div v-if="!isAdmin" class="p-growth-card"><Icon name="sparkles" :size="22"/><strong>Tu próxima gran idea empieza acá.</strong><RouterLink to="/app/subscription">Gestioná tu suscripción <Icon name="arrow" :size="15"/></RouterLink></div><button class="p-nav-link p-logout" :disabled="exiting||switching" :aria-busy="exiting" @click="exit"><Icon name="logout"/><span>Cerrar sesión</span></button><small>MiTiendaYa · Hecho para emprender</small></div>
 </aside>
 <main id="main-content" class="p-main" :class="{'p-main-design':isDesign}"><div v-if="auth.impersonation.active" class="p-info p-impersonation-alert"><strong>Modo prueba:</strong> estás personificando a {{auth.user?.name||auth.user?.email}}. <button type="button" class="btn btn-secondary btn-small" @click="exitImpersonation">Volver a Administración</button></div><div v-if="subscriptionAlert && !isAdmin" class="p-info p-warning p-subscription-alert"><strong>No se pudo acreditar el último pago de tu suscripción.</strong> Adeudás {{money(subscriptionAlert.debtAmount)}} por {{subscriptionAlert.periodsDue}} {{subscriptionAlert.periodsDue===1?'período':'períodos'}}.<template v-if="subscriptionAlert.inGrace"> Tenés servicio hasta {{shortDate(subscriptionAlert.graceUntil)}} durante el período de cortesía.</template><template v-else-if="subscriptionAlert.graceExpired"> El período de cortesía finalizó.</template> <RouterLink to="/app/subscription">Ver Mi suscripción →</RouterLink></div><div v-if="initializing" class="p-loading-page"><span class="p-spinner"/>Preparando tu espacio...</div><RouterView v-else :key="`${route.path}-${workspace.activeStoreId}`"/></main>
</div>
</template>

<style scoped>
.p-transfer-nav{position:relative}.p-transfer-badge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--danger);color:#fff;display:grid;place-items:center;font-size:9px;font-weight:800;border:2px solid var(--surface)}
</style>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../../services/api.js';
import { workspace, loadStores, loadTransferSummary } from '../../services/workspace.js';
import { notify, confirmDialog } from '../../services/notifications.js';
import Icon from '../../components/Icon.vue';

const data=ref(null),loading=ref(true),busy=ref(''),error=ref('');
const storeId=ref(''),recipientEmail=ref('');
const stores=computed(()=>workspace.stores.filter(store=>!(data.value?.pendingOutgoingStoreIds||[]).includes(store._id)));
const eligibility=computed(()=>data.value?.eligibility||{});
const statusLabel=status=>({pending:'Pendiente',accepted:'Transferida',cancelled:'Cancelada'}[status]||status);
const date=value=>value?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';

async function load(){loading.value=true;error.value='';try{data.value=await loadTransferSummary();await loadStores();if(!storeId.value&&stores.value[0])storeId.value=stores.value[0]._id}catch(e){error.value=e.message}finally{loading.value=false}}
async function createTransfer(){if(!storeId.value||!recipientEmail.value.trim())return;busy.value='create';try{data.value=await api.post('/me/store-transfers',{storeId:storeId.value,recipientEmail:recipientEmail.value.trim()});workspace.transferSummary=data.value;recipientEmail.value='';storeId.value='';await loadStores();if(stores.value[0])storeId.value=stores.value[0]._id;notify.success('Transferencia creada. La tienda sigue siendo tuya hasta que la acepten.')}catch(e){notify.error(e.message)}finally{busy.value=''}}
async function cancel(item){if(!await confirmDialog({title:'Cancelar transferencia',message:`La tienda ${item.store.name} seguirá siendo tuya y la invitación dejará de estar disponible.`,confirmText:'Cancelar transferencia'}))return;busy.value=`cancel:${item._id}`;try{data.value=await api.post(`/me/store-transfers/${item._id}/cancel`,{});workspace.transferSummary=data.value;await loadStores();notify.success('Transferencia cancelada.')}catch(e){notify.error(e.message)}finally{busy.value=''}}
async function accept(item){const warning=eligibility.value.allowed?`La tienda ${item.store.name} pasará a tu cuenta y ocupará uno de tus cupos disponibles.`:eligibility.value.reason;if(!await confirmDialog({title:'Aceptar tienda',message:warning,confirmText:'Aceptar transferencia'}))return;busy.value=`accept:${item._id}`;try{data.value=await api.post(`/me/store-transfers/${item._id}/accept`,{});workspace.transferSummary=data.value;await loadStores();notify.success('La tienda ya forma parte de tu cuenta.')}catch(e){notify.error(e.message)}finally{busy.value=''}}
async function returnStore(item){if(!await confirmDialog({title:'Devolver tienda',message:`Se iniciará una nueva transferencia de ${item.store.name} hacia ${item.from.email}. La tienda seguirá siendo tuya hasta que la otra persona la acepte.`,confirmText:'Iniciar devolución'}))return;busy.value=`return:${item._id}`;try{data.value=await api.post(`/me/store-transfers/${item._id}/return`,{});workspace.transferSummary=data.value;await loadStores();notify.success('Devolución iniciada.')}catch(e){notify.error(e.message)}finally{busy.value=''}}
onMounted(load);
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">CAMBIO DE PROPIETARIO</p><h1>Transferencias de tiendas</h1><p>Transferí una tienda a otra persona sin perderla hasta que acepte.</p></div><button type="button" class="btn btn-secondary" :disabled="loading" @click="load"><Icon name="refresh" :size="15"/>Actualizar</button></header>
  <div v-if="error" class="p-error">{{error}}</div>
  <div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Cargando transferencias...</div>
  <template v-else-if="data">
    <section v-if="data.pendingIncoming.length" class="p-section-card transfer-highlight">
      <div class="p-section-title"><div><h2>Tiendas esperando tu aceptación</h2><p>Para aceptar necesitás una suscripción vigente y un cupo libre de tienda.</p></div><span class="p-badge orange">{{data.pendingIncoming.length}} pendiente{{data.pendingIncoming.length===1?'':'s'}}</span></div>
      <div class="p-info" :class="eligibility.allowed?'':'p-warning'"><template v-if="eligibility.allowed">Tenés {{eligibility.availableStores}} cupo{{eligibility.availableStores===1?'':'s'}} disponible{{eligibility.availableStores===1?'':'s'}}.</template><template v-else>{{eligibility.reason}} <RouterLink to="/app/subscription">Ver Mi suscripción →</RouterLink></template></div>
      <div class="transfer-list"><article v-for="item in data.pendingIncoming" :key="item._id" class="p-nested-card"><header><div><strong>{{item.store.name}}</strong><small>De {{item.from.name||item.from.email}} · {{date(item.createdAt)}}</small></div><span class="p-badge orange">Pendiente</span></header><div class="p-inline"><button type="button" class="btn btn-primary btn-small" :disabled="busy||!eligibility.allowed" @click="accept(item)"><Icon name="transfer" :size="14"/>Aceptar tienda</button></div></article></div>
    </section>

    <section v-if="data.canTransfer" class="p-section-card">
      <div class="p-section-title"><div><h2>Transferir una tienda</h2><p>El destinatario deberá ingresar con ese mismo email, tener una suscripción vigente y disponer de cupo.</p></div><Icon name="transfer" :size="19"/></div>
      <form class="p-form-grid" @submit.prevent="createTransfer"><div class="p-field"><label for="transfer-store">Tienda</label><select id="transfer-store" v-model="storeId" required><option disabled value="">Seleccionar tienda</option><option v-for="store in stores" :key="store._id" :value="store._id">{{store.name}}</option></select><small>Las tiendas con una transferencia pendiente no pueden iniciar otra.</small></div><div class="p-field"><label for="transfer-email">Email de la persona destinataria</label><input id="transfer-email" v-model.trim="recipientEmail" type="email" required maxlength="254" placeholder="persona@correo.com"/></div><div class="p-field full"><button class="btn btn-primary" :disabled="busy==='create'||!stores.length"><Icon name="transfer" :size="15"/>{{busy==='create'?'Creando...':'Iniciar transferencia'}}</button></div></form>
    </section>
    <section v-else class="p-info"><strong>Tu plan no incluye transferencias de tiendas.</strong> Igualmente podés aceptar una tienda que otra persona te haya enviado o devolver una que hayas recibido.</section>

    <section class="p-section-card">
      <div class="p-section-title"><div><h2>Transferencias pendientes que enviaste</h2><p>Hasta que la otra persona acepte, la tienda sigue perteneciendo a tu cuenta y podés seguir administrándola.</p></div></div>
      <div v-if="!data.pendingOutgoing.length" class="p-muted">No tenés transferencias salientes pendientes.</div>
      <div v-else class="transfer-list"><article v-for="item in data.pendingOutgoing" :key="item._id" class="p-nested-card"><header><div><strong>{{item.store.name}}</strong><small>Para {{item.recipientEmail}} · {{date(item.createdAt)}}</small></div><span class="p-badge orange">Pendiente</span></header><div class="p-inline"><button type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="cancel(item)">Cancelar transferencia</button></div></article></div>
    </section>

    <section class="p-section-card">
      <div class="p-section-title"><div><h2>Historial</h2><p>Las tiendas que ya transferiste dejan de aparecer entre tus tiendas y quedan registradas acá.</p></div></div>
      <div v-if="!data.history.length" class="p-muted">Todavía no hay transferencias finalizadas.</div>
      <div v-else class="transfer-list"><article v-for="item in data.history" :key="item._id" class="p-nested-card"><header><div><strong>{{item.store.name}}</strong><small>{{item.from.email}} → {{item.to.email||item.recipientEmail}} · {{date(item.acceptedAt||item.cancelledAt||item.createdAt)}}</small></div><span class="p-badge" :class="item.status==='accepted'?'green':'orange'">{{statusLabel(item.status)}}</span></header><div v-if="item.canReturn" class="p-inline"><button type="button" class="btn btn-secondary btn-small" :disabled="busy" @click="returnStore(item)"><Icon name="back" :size="14"/>Devolver al dueño anterior</button></div></article></div>
    </section>
  </template>
</div>
</template>

<style scoped>
.transfer-list{display:grid;gap:12px}.transfer-highlight{border-color:color-mix(in srgb,var(--primary) 42%,var(--line))}.p-nested-card header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.p-nested-card header small{display:block;margin-top:4px;color:var(--muted)}
</style>

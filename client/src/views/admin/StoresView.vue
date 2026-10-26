<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { auth, canFeature } from '../../services/auth.js';
import { notify,confirmDialog } from '../../services/notifications.js';
import { useCollection } from '../../services/panel.js';
import { workspace, loadStores, loadTransferSummary, selectStore } from '../../services/workspace.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';

const router=useRouter();
const isAdmin=computed(()=>auth.user?.role==='admin');
const endpoint=computed(()=>isAdmin.value?'/admin/stores':'/me/stores');
const {rows,loading,error,meta,load,updateQuery}=useCollection(endpoint);
const transferStore=ref(null),recipientEmail=ref(''),transferBusy=ref('');
const maxStores=computed(()=>Number(auth.entitlement?.maxStores||1));
const canCreateStore=computed(()=>isAdmin.value||workspace.stores.length<maxStores.value);
const canTransfer=computed(()=>!isAdmin.value&&canFeature('stores.transfer'));
const pendingTransfers=computed(()=>new Map((workspace.transferSummary?.pendingOutgoing||[]).map(item=>[String(item.store?.id||''),item])));
const columns=computed(()=>isAdmin.value
  ? [{key:'name',label:'Tienda'},{key:'ownerId',label:'Vendedor'},{key:'active',label:'Estado'}]
  : [{key:'name',label:'Tienda'},{key:'active',label:'Estado'},{key:'transfer',label:'Transferencia'}]);

onMounted(async()=>{if(!isAdmin.value){try{await loadTransferSummary()}catch(e){notify.error(e.message)}}});

function pendingFor(row){return pendingTransfers.value.get(String(row._id));}
async function refreshSellerState(summary){if(summary)workspace.transferSummary=summary;await Promise.all([loadStores(),load()]);}
async function design(row){await loadStores();if(await selectStore(row._id))router.push('/app/design')}
async function domain(row){await loadStores();if(await selectStore(row._id))router.push('/app/domain')}
function beginTransfer(row){transferStore.value=row;recipientEmail.value='';requestAnimationFrame(()=>document.getElementById('seller-transfer-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'}));}
function closeTransfer(){if(transferBusy.value)return;transferStore.value=null;recipientEmail.value='';}
async function createTransfer(){
  if(!transferStore.value||!recipientEmail.value.trim())return;
  transferBusy.value='create';
  try{
    const summary=await api.post('/me/store-transfers',{storeId:transferStore.value._id,recipientEmail:recipientEmail.value.trim()});
    await refreshSellerState(summary);transferStore.value=null;recipientEmail.value='';notify.success('Transferencia creada. La tienda sigue siendo tuya hasta que la acepten.');
  }catch(e){notify.error(e.message)}finally{transferBusy.value=''}
}
async function cancelTransfer(row){
  const transfer=pendingFor(row);if(!transfer)return;
  if(!await confirmDialog({title:'Cancelar transferencia',message:`La tienda ${row.name} seguirá siendo tuya y la invitación para ${transfer.recipientEmail} dejará de estar disponible.`,confirmText:'Cancelar transferencia'}))return;
  transferBusy.value=`cancel:${transfer._id}`;
  try{const summary=await api.post(`/me/store-transfers/${transfer._id}/cancel`,{});await refreshSellerState(summary);notify.success('Transferencia cancelada.')}catch(e){notify.error(e.message)}finally{transferBusy.value=''}
}
async function remove(row){
  if(!await confirmDialog({title:'Archivar tienda',message:`La tienda ${row.name} dejará de estar disponible. Se conservarán pedidos y registros de ventas.`,confirmText:'Archivar tienda',danger:true}))return;
  try{await api.delete(`${isAdmin.value?'/admin/stores':'/me/stores'}/${row._id}`);notify.success('Tienda archivada.');await Promise.all([loadStores(),load()])}catch(e){notify.error(e.message)}
}
</script>

<template><div>
<header class="p-page-header"><div><p class="p-eyebrow">{{isAdmin?'LOS NEGOCIOS DE TU COMUNIDAD':'TUS NEGOCIOS'}}</p><h1>Tiendas</h1><p>{{isAdmin?'Creá, asigná y personalizá cada tienda desde un mismo lugar.':'Creá y administrá tus tiendas desde un mismo lugar. Las transferencias salientes también se gestionan desde este ABM.'}}</p></div><RouterLink v-if="canCreateStore" to="/app/stores/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Crear tienda</RouterLink><button v-else-if="!isAdmin" class="btn btn-secondary" disabled title="Alcanzaste el límite de tiendas de tu plan"><Icon name="store" :size="16"/>Cupo completo</button></header>
<div v-if="!isAdmin" class="p-info store-quota"><strong>{{workspace.stores.length}} / {{maxStores}} tiendas utilizadas.</strong><span v-if="workspace.stores.length>=maxStores"> Alcanzaste el límite de tu plan.</span><span v-else> Podés crear {{maxStores-workspace.stores.length}} tienda{{maxStores-workspace.stores.length===1?'':'s'}} más.</span></div>
<div v-if="error" class="p-error">{{error}}</div>

<section v-if="!isAdmin&&transferStore" id="seller-transfer-panel" class="p-section-card transfer-panel">
  <div class="p-section-title"><div><h2>Transferir {{transferStore.name}}</h2><p>La tienda seguirá perteneciendo a tu cuenta hasta que la otra persona acepte.</p></div><button type="button" class="p-icon-btn" :disabled="!!transferBusy" title="Cerrar" @click="closeTransfer"><Icon name="close" :size="16"/></button></div>
  <form class="p-form-grid" @submit.prevent="createTransfer"><div class="p-field"><label for="transfer-store-name">Tienda</label><input id="transfer-store-name" :value="transferStore.name" readonly/></div><div class="p-field"><label for="transfer-email">Email de la persona destinataria</label><input id="transfer-email" v-model.trim="recipientEmail" type="email" required maxlength="254" placeholder="persona@correo.com" autofocus/><small>El destinatario deberá usar este email y tener una suscripción vigente con cupo disponible.</small></div><div class="p-field full"><div class="p-inline"><button class="btn btn-primary" :disabled="transferBusy==='create'"><Icon name="transfer" :size="15"/>{{transferBusy==='create'?'Creando...':'Iniciar transferencia'}}</button><button type="button" class="btn btn-secondary" :disabled="!!transferBusy" @click="closeTransfer">Cancelar</button></div></div></form>
</section>

<DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" @query-change="updateQuery" search-placeholder="Buscar tiendas...">
  <template #cell-name="{row}"><div class="p-product-cell"><span class="p-product-thumb"><Icon name="store"/></span><span><strong>{{row.name}}</strong><small>{{row.publicUrl||('/t/'+row.slug)}}</small></span></div></template>
  <template #cell-ownerId="{row}"><strong>{{row.ownerId?.name||row.owner?.name||'Vendedor asignado'}}</strong><small>{{row.ownerId?.email||row.owner?.email||''}}</small></template>
  <template #cell-active="{row}"><span class="p-badge dot" :class="row.active?'green':'orange'">{{row.active?'Publicada':'En preparación'}}</span></template>
  <template #cell-transfer="{row}"><template v-if="pendingFor(row)"><span class="p-badge orange">Pendiente de aceptación</span><small class="transfer-recipient">Para {{pendingFor(row).recipientEmail}}</small></template><span v-else class="p-muted">Sin transferencia pendiente</span></template>
  <template #actions="{row}">
    <button v-if="isAdmin||canFeature('design.limited')" class="btn btn-secondary btn-small" @click="design(row)"><Icon name="palette" :size="13"/>Personalizar</button>
    <button  class="p-icon-btn" title="Configurar dominio" @click="domain(row)"><Icon name="globe" :size="14"/></button>
    <RouterLink :to="`/app/stores/${row._id}`" class="p-icon-btn" title="Editar tienda"><Icon name="edit" :size="14"/></RouterLink>
    <a :href="row.publicUrl||`/t/${row.slug}`" class="p-icon-btn" target="_blank" rel="noopener" title="Abrir tienda"><Icon name="external" :size="14"/></a>
    <button v-if="!isAdmin&&pendingFor(row)" class="btn btn-secondary btn-small" :disabled="!!transferBusy" @click="cancelTransfer(row)"><Icon name="close" :size="13"/>Cancelar transferencia</button>
    <button v-else-if="!isAdmin&&canTransfer" class="btn btn-secondary btn-small" :disabled="!!transferBusy" @click="beginTransfer(row)"><Icon name="transfer" :size="13"/>Transferir</button>
    <button class="p-icon-btn danger" title="Archivar tienda" @click="remove(row)"><Icon name="trash" :size="14"/></button>
  </template>
</DataTable>
</div></template>

<style scoped>
.store-quota{margin-bottom:18px}.transfer-panel{margin-bottom:18px}.transfer-recipient{display:block;margin-top:5px;color:var(--muted);font-size:10px}
</style>

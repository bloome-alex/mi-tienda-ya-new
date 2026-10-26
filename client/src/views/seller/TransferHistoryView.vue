<script setup>
import { useCollection } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';

const columns=[
  {key:'store',label:'Tienda transferida'},
  {key:'recipient',label:'Destinatario'},
  {key:'acceptedAt',label:'Fecha de transferencia'},
];
const {rows,loading,error,meta,load,updateQuery}=useCollection('/me/store-transfers/history');
const date=value=>value?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">TRANSFERENCIAS COMPLETADAS</p><h1>Historial de Transferencias</h1><p>Tiendas que transferiste y ya fueron aceptadas por la persona destinataria.</p></div><button type="button" class="btn btn-secondary" :disabled="loading" @click="load"><Icon name="refresh" :size="15"/>Actualizar</button></header>
  <div v-if="error" class="p-error">{{error}}</div>
  <DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" empty-text="Todavía no transferiste tiendas." search-placeholder="Buscar tiendas transferidas..." @query-change="updateQuery">
    <template #cell-store="{row}"><div class="p-product-cell"><span class="p-product-thumb"><Icon name="store"/></span><span><strong>{{row.store.name}}</strong><small v-if="row.store.slug">{{row.store.slug}}</small></span></div></template>
    <template #cell-recipient="{row}"><strong>{{row.to.name||row.to.email||row.recipientEmail}}</strong><small v-if="row.to.name&&row.to.email">{{row.to.email}}</small></template>
    <template #cell-acceptedAt="{row}">{{date(row.acceptedAt)}}</template>
  </DataTable>
</div>
</template>

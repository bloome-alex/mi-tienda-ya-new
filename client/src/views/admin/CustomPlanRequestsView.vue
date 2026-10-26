<script setup>
import { useCollection, date } from '../../services/panel.js';
import { whatsappUrl } from '../../services/format.js';
import DataTable from '../../components/DataTable.vue';
import Icon from '../../components/Icon.vue';

const { rows, loading, error, meta, load, updateQuery } = useCollection('/admin/custom-plan-requests');
const columns = [
  { key: 'createdAt', label: 'Recibida' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'description', label: 'Necesidad' },
];
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">PLANES A MEDIDA</p><h1>Solicitudes de planes</h1><p>Formularios enviados desde la comparación pública para pedir una propuesta personalizada.</p></div></header>
  <div v-if="error" class="p-error">{{error}} <button class="btn btn-text" type="button" @click="load">Reintentar</button></div>
  <DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" @query-change="updateQuery" search-placeholder="Buscar email, WhatsApp o descripción..." empty-text="Todavía no recibiste solicitudes de planes personalizados.">
    <template #cell-createdAt="{value}"><span class="request-date">{{date(value)}}</span></template>
    <template #cell-email="{value}"><a class="request-contact" :href="`mailto:${value}`"><Icon name="mail" :size="14"/>{{value}}</a></template>
    <template #cell-whatsapp="{value}"><a class="request-contact" :href="whatsappUrl(value,'Hola, te contacto por tu solicitud de un plan personalizado en MiTiendaYa.')" target="_blank" rel="noopener"><Icon name="phone" :size="14"/>{{value}}</a></template>
    <template #cell-description="{value}"><p class="request-description">{{value}}</p></template>
    <template #actions="{row}"><RouterLink class="btn btn-secondary btn-small" :to="`/app/custom-plan-requests/${row._id}`"><Icon name="eye" :size="14"/>Visualizar</RouterLink></template>
  </DataTable>
</div>
</template>

<style scoped>
.request-date{white-space:nowrap;font-size:11px}.request-contact{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:650;color:var(--text);overflow-wrap:anywhere}.request-contact:hover{color:var(--primary)}.request-description{margin:0;min-width:260px;max-width:560px;white-space:pre-wrap;line-height:1.55;font-size:11px;color:var(--text-secondary)}
</style>

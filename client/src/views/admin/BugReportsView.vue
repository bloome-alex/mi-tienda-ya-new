<script setup>
import { ref } from 'vue';
import { useCollection, date } from '../../services/panel.js';
import DataTable from '../../components/DataTable.vue';
import Icon from '../../components/Icon.vue';

const status=ref('');
const { rows, loading, error, meta, load, updateQuery }=useCollection('/admin/bug-reports',()=>({status:status.value}));
const columns=[{key:'createdAt',label:'Fecha'},{key:'reporter',label:'Vendedor'},{key:'store',label:'Tienda'},{key:'status',label:'Estado'},{key:'comment',label:'Reporte'},{key:'attachments',label:'Adjuntos'}];
const statusLabel=value=>({new:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',closed:'Cerrado'}[value]||value);
const statusClass=value=>({new:'orange',reviewing:'blue',resolved:'green',closed:''}[value]||'');
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">CALIDAD Y SOPORTE</p><h1>Reportes de errores</h1><p>Revisá los problemas informados por vendedores, consultá sus evidencias y registrá el avance de resolución.</p></div></header>
  <div v-if="error" class="p-error">{{error}} <button type="button" class="btn btn-text" @click="load">Reintentar</button></div>
  <DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" @query-change="updateQuery" search-placeholder="Buscar vendedor, tienda o contenido del reporte..." empty-text="Todavía no hay reportes de errores.">
    <template #toolbar><label class="report-filter"><span>Estado</span><select v-model="status"><option value="">Todos</option><option value="new">Nuevos</option><option value="reviewing">En revisión</option><option value="resolved">Resueltos</option><option value="closed">Cerrados</option></select></label></template>
    <template #cell-createdAt="{value}"><span class="report-date">{{date(value)}}</span></template>
    <template #cell-reporter="{row}"><div class="report-user"><strong>{{row.reporterId?.name||'Vendedor'}}</strong><small>{{row.reporterId?.email||'Sin email'}}</small></div></template>
    <template #cell-store="{row}"><span>{{row.storeId?.name||'Sin tienda asociada'}}</span></template>
    <template #cell-status="{value}"><span class="p-badge" :class="statusClass(value)">{{statusLabel(value)}}</span></template>
    <template #cell-comment="{value}"><p class="report-comment">{{value}}</p></template>
    <template #cell-attachments="{row}"><span class="p-badge"><Icon name="image" :size="12"/>{{row.attachments?.length||0}}</span></template>
    <template #actions="{row}"><RouterLink class="btn btn-secondary btn-small" :to="`/app/error-reports/${row._id}`"><Icon name="eye" :size="14"/>Revisar</RouterLink></template>
  </DataTable>
</div>
</template>

<style scoped>
.report-filter{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--muted)}.report-filter select{min-width:150px;padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--text)}.report-date{font-size:10px;white-space:nowrap}.report-user strong,.report-user small{display:block}.report-user small{font-size:9px;color:var(--muted);margin-top:2px}.report-comment{margin:0;max-width:480px;min-width:260px;white-space:pre-wrap;line-height:1.5;font-size:10px;color:var(--text-secondary)}
</style>

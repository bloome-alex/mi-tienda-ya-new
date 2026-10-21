<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../services/api.js';
import { date } from '../../services/panel.js';
import { auditAction, auditActor, auditValue } from '../../services/audit.js';
import DataTable from '../../components/DataTable.vue';
import Icon from '../../components/Icon.vue';
const route=useRoute(),entry=ref(null),loading=ref(true),error=ref('');
let run=0;
watch(()=>route.params.id,async id=>{
 const current=++run;loading.value=true;error.value='';entry.value=null;
 try{const result=await api.get('/admin/audit/'+id);if(current===run)entry.value=result}catch(e){if(current===run)error.value=e.message}finally{if(current===run)loading.value=false}
},{immediate:true});
const stock=computed(()=>entry.value?.facts?.find(fact=>fact.key==='adjustments')?.value||[]);
const facts=computed(()=>entry.value?.facts?.filter(fact=>fact.key!=='adjustments')||[]);
const columns=[{key:'label',label:'Campo'},{key:'before',label:'Antes'},{key:'after',label:'Después'}];
const stockColumns=[{key:'productName',label:'Producto'},{key:'variantName',label:'Variante'},{key:'before',label:'Antes'},{key:'after',label:'Después'},{key:'delta',label:'Diferencia'}];
</script>
<template>
<div>
 <RouterLink :to="{path:'/app/audit',query:route.query}" class="p-back-link"><Icon name="back" :size="14"/>Volver a auditoría</RouterLink>
 <header class="p-page-header"><div><p class="p-eyebrow">DETALLE DEL REGISTRO</p><h1>{{entry?auditAction(entry):'Detalle de auditoría'}}</h1><p>El contexto y los valores que se conservaron al realizar esta operación.</p></div></header>
 <div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Cargando registro...</div>
 <div v-else-if="error" class="p-error" role="alert">{{error}}</div>
 <template v-else-if="entry">
  <section class="p-section-card audit-context" aria-label="Contexto de la operación">
   <div><span>Fecha</span><strong>{{date(entry.createdAt)}}</strong></div>
   <div><span>Realizada por</span><strong>{{auditActor(entry)}}</strong><small v-if="entry.actor?.email">{{entry.actor.email}}</small><small v-if="entry.actor?.role">{{auditValue(entry.actor.role,'role')}}</small><small v-else-if="entry.actor?.type==='customer'">Cliente · datos del pedido</small><small v-else-if="entry.actor?.type==='integration'">Integración</small></div>
   <div><span>Tienda</span><strong>{{entry.store?.name||'No asociada a una tienda'}}</strong><small v-if="entry.store?.slug">{{entry.store.slug}}</small></div>
   <div><span>Recurso</span><strong>{{entry.entityLabel}}</strong><small v-if="entry.entityName">{{entry.entityName}}</small></div>
  </section>
  <section v-if="entry.changes?.length" class="audit-section"><div class="p-section-title"><div><h2>Valores modificados</h2><p>{{entry.changes.length}} campos con información de cambio.</p></div></div>
   <DataTable :rows="entry.changes" :columns="columns" :searchable="false" :limit="200">
    <template #cell-label="{value}"><strong class="audit-field-name">{{value}}</strong></template>
    <template #cell-before="{row}"><pre class="audit-value">{{row.beforeRecorded?auditValue(row.before,row.field):'No registrado'}}</pre></template>
    <template #cell-after="{row}"><pre class="audit-value">{{row.afterRecorded?auditValue(row.after,row.field):'No registrado'}}</pre></template>
   </DataTable>
  </section>
  <div v-else class="p-info">{{entry.detailNotice||'Este evento no registró valores anteriores y posteriores.'}}</div>
  <section v-if="stock.length" class="audit-section"><div class="p-section-title"><h2>Cantidades ajustadas</h2></div><DataTable :rows="stock" :columns="stockColumns" :searchable="false" :limit="25"><template #cell-variantName="{value}">{{value||'General'}}</template><template #cell-delta="{value}"><strong>{{value>0?'+':''}}{{auditValue(value)}}</strong></template></DataTable></section>
  <section v-if="facts.length" class="p-section-card audit-section"><div class="p-section-title"><h2>Información registrada</h2></div><dl class="audit-facts"><div v-for="fact in facts" :key="fact.key"><dt>{{fact.label}}</dt><dd><pre class="audit-value">{{auditValue(fact.value,fact.key)}}</pre></dd></div></dl></section>
  <p v-if="!entry.hasDetails" class="p-muted">No se guardaron datos adicionales para este evento. No se reconstruyen valores que el registro original no contiene.</p>
  <details class="p-section-card audit-technical"><summary>Identificadores del registro</summary><dl class="audit-facts"><div><dt>Registro</dt><dd>{{entry._id}}</dd></div><div><dt>Código de acción</dt><dd>{{entry.action||'No registrado'}}</dd></div><div><dt>Recurso</dt><dd>{{entry.entityId||'No registrado'}}</dd></div><div v-if="entry.actor?.id"><dt>Usuario</dt><dd>{{entry.actor.id}}</dd></div><div v-if="entry.store?.id"><dt>Tienda</dt><dd>{{entry.store.id}}</dd></div></dl></details>
 </template>
</div>
</template>
<style scoped>
.audit-context{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}.audit-context span{display:block;color:var(--muted);font-size:11px;margin-bottom:7px}.audit-context strong{display:block;font-size:13px;overflow-wrap:anywhere}.audit-context small{display:block;color:var(--muted);font-size:11px;margin-top:5px;overflow-wrap:anywhere}.audit-section{margin:26px 0}.audit-field-name{display:block;max-width:220px;min-width:130px;font-size:12px;white-space:normal}.audit-value{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:12px;line-height:1.7;max-height:420px;overflow:auto;min-width:130px;max-width:640px}.audit-facts{display:grid;gap:18px;margin:0}.audit-facts>div{display:grid;grid-template-columns:minmax(140px,1fr) minmax(0,3fr);gap:16px;padding-bottom:16px;border-bottom:1px solid var(--line)}.audit-facts>div:last-child{padding:0;border:0}.audit-facts dt{font-size:12px;font-weight:600;color:var(--muted)}.audit-facts dd{font-size:12px;margin:0;overflow-wrap:anywhere}.audit-technical{margin-top:24px}.audit-technical summary{cursor:pointer;font-weight:600;font-size:12px}.audit-technical[open] summary{margin-bottom:22px}@media(max-width:1050px){.audit-context{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.audit-context{grid-template-columns:1fr}.audit-facts>div{grid-template-columns:1fr;gap:6px}}
</style>

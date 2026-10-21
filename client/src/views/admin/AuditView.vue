<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCollection, date, fetchAll } from '../../services/panel.js';
import { auth } from '../../services/auth.js';
import { auditAction, auditActor } from '../../services/audit.js';
import DataTable from '../../components/DataTable.vue';
import Icon from '../../components/Icon.vue';
const route = useRoute(), router = useRouter();
const filterKeys = ['action','entity','actorId','storeId','from','to'];
const filters = reactive(Object.fromEntries(filterKeys.map(key => [key, typeof route.query[key] === 'string' ? route.query[key] : ''])));
const { rows, loading, error, meta, query, updateQuery } = useCollection('/admin/audit', () => filters);
query.page = Math.max(1, parseInt(route.query.page, 10) || 1);
query.search = typeof route.query.search === 'string' ? route.query.search : '';
const searchText = ref(query.search); let searchTimer;
watch(searchText, value => { clearTimeout(searchTimer); searchTimer = setTimeout(()=>updateQuery({search:value,page:1}),300); });
onBeforeUnmount(()=>clearTimeout(searchTimer));
const users = ref([]), stores = ref([]), filterError = ref('');
const actions = computed(() => Object.entries(meta.actions || {}));
const entities = computed(() => Object.entries(meta.entities || {}));
const actors = computed(() => auth.user ? [auth.user, ...users.value.filter(user => user._id !== auth.user._id)] : users.value);
const columns = [{key:'createdAt',label:'Fecha'},{key:'action',label:'Acción'},{key:'actor',label:'Realizada por'},{key:'store',label:'Tienda'},{key:'entity',label:'Recurso'}];
watch(filters, () => updateQuery({page:1}), {deep:true});
watch([filters, query], () => {
  const next = Object.fromEntries(Object.entries({...filters,...query}).filter(([,value])=>value!=='' && value!==undefined && value!==1).map(([key,value])=>[key,String(value)]));
  router.replace({query:next});
}, {deep:true});
async function loadFilters() {
  filterError.value = '';
  const result = await Promise.allSettled([fetchAll('/admin/users'), fetchAll('/admin/stores')]);
  if (result[0].status === 'fulfilled') users.value = result[0].value;
  if (result[1].status === 'fulfilled') stores.value = result[1].value;
  if (result.some(item=>item.status==='rejected')) filterError.value = 'No se pudieron cargar todas las opciones de usuario y tienda.';
}
onMounted(loadFilters);
function resetFilters(){ for(const key of filterKeys)filters[key]=''; }
</script>
<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">TRAZABILIDAD</p><h1>Auditoría</h1><p>Consultá quién hizo cada cambio, en qué tienda y qué valores quedaron registrados.</p></div></header>
  <section class="p-section-card audit-filters" aria-label="Filtros de auditoría">
    <div class="p-field"><label for="audit-action">Acción</label><select id="audit-action" v-model="filters.action"><option value="">Todas las acciones</option><option v-for="[code,label] in actions" :key="code" :value="code">{{label}}</option></select></div>
    <div class="p-field"><label for="audit-entity">Recurso</label><select id="audit-entity" v-model="filters.entity"><option value="">Todos los recursos</option><option v-for="[code,label] in entities" :key="code" :value="code">{{label}}</option></select></div>
    <div class="p-field"><label for="audit-user">Usuario</label><select id="audit-user" v-model="filters.actorId"><option value="">Todos los actores</option><option v-for="user in actors" :key="user._id" :value="user._id">{{user.name || user.email}}</option></select></div>
    <div class="p-field"><label for="audit-store">Tienda</label><select id="audit-store" v-model="filters.storeId"><option value="">Todas las tiendas</option><option v-for="store in stores" :key="store._id" :value="store._id">{{store.name}}</option></select></div>
    <div class="p-field"><label for="audit-from">Desde (UTC)</label><input id="audit-from" v-model="filters.from" type="date" :max="filters.to || undefined"/></div>
    <div class="p-field"><label for="audit-to">Hasta (UTC)</label><input id="audit-to" v-model="filters.to" type="date" :min="filters.from || undefined"/></div>
    <div class="audit-filter-footer"><span>Los eventos anteriores conservan únicamente el detalle que se registró en su momento.</span><button class="btn btn-text" type="button" @click="resetFilters">Limpiar filtros</button></div>
    <p v-if="filterError" class="p-error">{{filterError}} <button type="button" class="btn btn-text" @click="loadFilters">Reintentar</button></p>
  </section>
  <div v-if="error" class="p-error" role="alert">{{error}}</div>
  <DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" :searchable="false" @query-change="value=>updateQuery({page:value.page})" empty-text="No hay eventos para esta búsqueda.">
    <template #toolbar><label class="p-search"><Icon name="search" :size="18"/><input v-model="searchText" type="search" placeholder="Buscar acción, persona, tienda o recurso..." aria-label="Buscar en auditoría"/></label></template>
    <template #cell-createdAt="{value}"><span class="audit-date">{{date(value)}}</span></template>
    <template #cell-action="{row}"><strong class="audit-label">{{auditAction(row)}}</strong><small class="audit-secondary">{{row.changesCount ? row.changesCount + ' campos modificados' : row.hasDetails ? 'Detalle registrado' : 'Sin detalle adicional'}}</small></template>
    <template #cell-actor="{row}"><span>{{auditActor(row)}}</span><small v-if="row.actor?.email" class="audit-secondary">{{row.actor.email}}</small></template>
    <template #cell-store="{row}"><span>{{row.store?.name || 'No asociada a una tienda'}}</span><small v-if="row.store?.slug" class="audit-secondary">{{row.store.slug}}</small></template>
    <template #cell-entity="{row}"><span class="p-badge">{{row.entityLabel}}</span><small v-if="row.entityName" class="audit-secondary">{{row.entityName}}</small></template>
    <template #actions="{row}"><RouterLink class="btn btn-secondary btn-small" :to="{path:'/app/audit/'+row._id,query:route.query}" :aria-label="'Ver detalle: '+auditAction(row)"><Icon name="eye" :size="14"/>Ver detalle</RouterLink></template>
  </DataTable>
</div>
</template>
<style scoped>
.audit-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.audit-filters .p-field{min-width:0}.audit-filter-footer{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:11px}.audit-filters>.p-error{grid-column:1/-1}.audit-label{display:block;min-width:160px;white-space:normal;font-size:12px}.audit-secondary{display:block;margin-top:4px;color:var(--muted);font-size:11px;white-space:normal;overflow-wrap:anywhere;max-width:260px}.audit-date{font-size:11px;white-space:nowrap}@media(max-width:1100px){.audit-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.audit-filters{grid-template-columns:1fr}.audit-filter-footer{align-items:flex-start;flex-direction:column}}
</style>

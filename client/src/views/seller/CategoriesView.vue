<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { notify, confirmDialog } from '../../services/notifications.js';
import { fetchAll } from '../../services/panel.js';
import { CategoryTree } from '../../services/categories.js';
import DataTable from '../../components/DataTable.vue';
import Icon from '../../components/Icon.vue';
const categories = ref([]), loading = ref(false), error = ref(''), search = ref(''), expanded = ref(new Set());
const tree = computed(() => new CategoryTree(categories.value));
const rows = computed(() => tree.value.visibleRows(expanded.value, search.value));
const columns = [{ key: 'name', label: 'Categoría' }, { key: 'type', label: 'Nivel' }, { key: 'parentPath', label: 'Ubicación' }, { key: 'active', label: 'Estado' }];
let requestId = 0;
async function load() {
  const storeId = workspace.activeStoreId, run = ++requestId;
  categories.value = []; expanded.value = new Set(); search.value=''; error.value = ''; loading.value = false;
  if (!storeId) return;
  loading.value = true;
  try {
    const result = await fetchAll(`/stores/${storeId}/categories`);
    if (run === requestId) categories.value = result;
  } catch (e) { if (run === requestId) error.value = e.message; }
  finally { if (run === requestId) loading.value = false; }
}
function toggle(row){
  if(!row.childCount)return;
  const next=new Set(expanded.value),id=CategoryTree.id(row);
  if(next.has(id))next.delete(id);else next.add(id);
  expanded.value=next;
}
function isExpanded(row){return expanded.value.has(CategoryTree.id(row));}
async function remove(row) {
  if (row.childCount) { notify.info('Primero mové o quitá las subcategorías de esta categoría.'); return; }
  if (!await confirmDialog({ title: 'Quitar categoría', message: `¿Querés quitar ${row.name}? Los productos se conservarán.`, confirmText: 'Quitar categoría', danger: true })) return;
  const storeId = workspace.activeStoreId;
  try {
    await api.delete(`/stores/${storeId}/categories/${row._id}`);
    notify.success('Categoría eliminada.');
    if (storeId === workspace.activeStoreId) await load();
  } catch (e) { notify.error(e.message); }
}
watch(() => workspace.activeStoreId, load, { immediate: true });
onUnmounted(() => { requestId++; });
</script>
<template>
  <div>
    <header class="p-page-header">
      <div><p class="p-eyebrow">UN CATÁLOGO BIEN ORGANIZADO</p><h1>Categorías</h1><p>El listado muestra primero las categorías principales. Desplegá cada fila para recorrer todos sus niveles.</p></div>
      <RouterLink v-if="workspace.activeStoreId" to="/app/categories/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Nueva categoría</RouterLink>
    </header>
    <div v-if="error" class="p-error">{{ error }} <button type="button" class="link" @click="load">Reintentar</button></div>
    <DataTable :rows="rows" :columns="columns" :loading="loading" :searchable="false" :limit="Math.max(rows.length,1)" empty-text="Agrupá tus productos con tu primera categoría.">
      <template #toolbar><label class="p-search category-search"><Icon name="search" :size="18"/><input v-model="search" placeholder="Buscar categorías o su ubicación..." aria-label="Buscar categorías" type="search"/></label></template>
      <template #cell-name="{row}">
        <div class="p-product-cell category-name-cell" :style="{'padding-inline-start':Math.min(row.depth,10)*18+'px'}">
          <button v-if="row.childCount" type="button" class="category-expand" :aria-label="`${isExpanded(row)?'Contraer':'Desplegar'} subcategorías de ${row.name}`" :aria-expanded="isExpanded(row)" @click="toggle(row)"><Icon name="chevron-down" :size="15"/></button><span v-else class="category-leaf-space" aria-hidden="true"></span>
          <span v-if="!row.depth" class="p-product-thumb"><Icon name="tag" :size="18"/></span>
          <span><strong>{{ row.name }}</strong><small v-if="row.description" class="category-description">{{ row.description }}</small><small v-else-if="row.childCount">{{ row.childCount }} {{ row.childCount === 1 ? 'subcategoría directa' : 'subcategorías directas' }}</small></span>
        </div>
      </template>
      <template #cell-type="{row}"><span class="p-badge">{{ row.depth ? 'Nivel '+(row.depth+1) : 'Principal' }}</span></template>
      <template #cell-parentPath="{row}"><span class="category-path" :class="{'p-muted': !row.parentPath}">{{ row.parentPath || 'Primer nivel' }}</span></template>
      <template #cell-active="{value}"><span class="p-badge dot" :class="value ? 'green' : 'orange'">{{ value ? 'Visible' : 'Oculta' }}</span></template>
      <template #actions="{row}">
        <RouterLink :to="{path:'/app/categories/new', query:{parentId:row._id}}" class="btn btn-secondary btn-small" :aria-label="`Crear subcategoría en ${row.name}`"><Icon name="plus" :size="13"/>Subcategoría</RouterLink>
        <RouterLink :to="`/app/categories/${row._id}`" class="p-icon-btn" :title="`Editar ${row.name}`" :aria-label="`Editar ${row.name}`"><Icon name="edit" :size="14"/></RouterLink>
        <button type="button" class="p-icon-btn danger" :disabled="Boolean(row.childCount)" :title="row.childCount ? 'Primero mové o quitá sus subcategorías' : `Quitar ${row.name}`" :aria-label="row.childCount ? `${row.name} tiene subcategorías. Movelas o quitalas antes de eliminarla.` : `Quitar ${row.name}`" @click="remove(row)"><Icon name="trash" :size="14"/></button>
      </template>
    </DataTable>
    <p class="p-mobile-card-hint">Deslizá el listado para ver todas las columnas y acciones.</p>
  </div>
</template>
<style scoped>
.category-search{width:min(100%,430px)}.category-name-cell{min-width:270px}.category-expand{width:28px;height:28px;flex:none;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--muted);padding:0}.category-expand:hover{background:var(--surface-alt);color:var(--text)}.category-expand svg{transition:transform .16s ease}.category-expand[aria-expanded=true] svg{transform:rotate(180deg)}.category-leaf-space{width:28px;flex:none}.category-path{display:block;min-width:120px;max-width:320px;white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:1.65}.category-description{max-width:330px;white-space:normal;overflow-wrap:anywhere;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}@media(prefers-reduced-motion:reduce){.category-expand svg{transition:none}}
</style>

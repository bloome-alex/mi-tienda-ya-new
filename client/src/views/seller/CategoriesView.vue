<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { notify, confirmDialog } from '../../services/notifications.js';
import { fetchAll } from '../../services/panel.js';
import { CategoryTree } from '../../services/categories.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';
const categories = ref([]), loading = ref(false), error = ref('');
const rows = computed(() => new CategoryTree(categories.value).rows());
const columns = [{ key: 'name', label: 'Categoría' }, { key: 'type', label: 'Nivel' }, { key: 'parentPath', label: 'Ubicación' }, { key: 'active', label: 'Estado' }];
let requestId = 0;
async function load() {
  const storeId = workspace.activeStoreId, run = ++requestId;
  categories.value = []; error.value = ''; loading.value = false;
  if (!storeId) return;
  loading.value = true;
  try {
    const result = await fetchAll(`/stores/${storeId}/categories`);
    if (run === requestId) categories.value = result;
  } catch (e) { if (run === requestId) error.value = e.message; }
  finally { if (run === requestId) loading.value = false; }
}
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
      <div><p class="p-eyebrow">UN CATÁLOGO BIEN ORGANIZADO</p><h1>Categorías</h1><p>Ordená tus productos en categorías y subcategorías con los niveles que necesites.</p></div>
      <RouterLink v-if="workspace.activeStoreId" to="/app/categories/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Nueva categoría</RouterLink>
    </header>
    <div v-if="error" class="p-error">{{ error }} <button type="button" class="link" @click="load">Reintentar</button></div>
    <DataTable :rows="rows" :columns="columns" :loading="loading" search-placeholder="Buscar categorías o su ubicación..." empty-text="Agrupá tus productos con tu primera categoría.">
      <template #cell-name="{row}">
        <div class="p-product-cell" :class="{'category-child': row.isSubcategory}" :style="{'padding-inline-start':Math.min(row.depth,6)*16+'px'}">
          <Icon v-if="row.isSubcategory" name="chevron-right" :size="15" class="category-branch"/>
          <span v-else class="p-product-thumb"><Icon name="tag" :size="18"/></span>
          <span><strong>{{ row.name }}</strong><small v-if="row.description" class="category-description">{{ row.description }}</small><small v-else-if="row.childCount">{{ row.childCount }} {{ row.childCount === 1 ? 'subcategoría' : 'subcategorías' }}</small></span>
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
.category-path{display:block;min-width:120px;max-width:320px;white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:1.65}.category-branch{color:var(--muted);flex:none}.category-description{max-width:330px;white-space:normal;overflow-wrap:anywhere;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
</style>

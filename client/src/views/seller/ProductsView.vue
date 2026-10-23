<script setup>
import { reactive, ref, watch, computed } from 'vue';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { canFeature } from '../../services/auth.js';
import { notify, confirmDialog } from '../../services/notifications.js';
import { useCollection, money } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';
const featuredFilter = ref(''), savingFeatured = reactive(new Set());
const {rows, loading, error, meta, query, load, updateQuery} = useCollection(() => workspace.activeStoreId ? `/stores/${workspace.activeStoreId}/products` : null, () => featuredFilter.value ? {featured: featuredFilter.value} : {});
const columns = computed(() => [{key:'name',label:'Producto'}, {key:'price',label:'Precio'}, {key:'stock',label:'Stock'}, ...(canFeature('products.featured')?[{key:'featured',label:'Destacado'}]:[]), {key:'active',label:'Estado'}]);
watch(featuredFilter, () => { query.page = 1; });
function stock(product) { if(product.type === 'digital') return 'Digital'; if(product.madeToOrder) return 'A pedido'; return product.variants?.length ? product.variants.reduce((sum,variant) => sum + variant.stock, 0) : product.stock; }
async function refreshRows() {
  await load();
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.limit));
  if (query.page > lastPage) query.page = lastPage;
}
async function toggleFeatured(row) {
  const storeId = workspace.activeStoreId, key = `${storeId}:${row._id}`, next = !row.featured;
  if (savingFeatured.has(key)) return;
  savingFeatured.add(key);
  try {
    const saved = await api.put(`/stores/${storeId}/products/${row._id}`, {featured: next});
    if (storeId === workspace.activeStoreId) {
      const currentRow = rows.value.find(product => product._id === row._id);
      if (currentRow) currentRow.featured = saved.featured;
      if (featuredFilter.value) await refreshRows();
    }
    notify.success(next ? `${row.name} se agregó a destacados.` : `${row.name} dejó de ser destacado.`);
  } catch (e) { notify.error(e.message); }
  finally { savingFeatured.delete(key); }
}
function isSaving(row) { return savingFeatured.has(`${workspace.activeStoreId}:${row._id}`); }
async function remove(row) {
  if (!await confirmDialog({title:'Archivar producto', message:`${row.name} dejará de ofrecerse en tu tienda. Los pedidos realizados conservarán sus datos.`, confirmText:'Archivar producto', danger:true})) return;
  const storeId = workspace.activeStoreId;
  try { await api.delete(`/stores/${storeId}/products/${row._id}`); notify.success('Producto archivado.'); if (storeId === workspace.activeStoreId) await refreshRows(); }
  catch (e) { notify.error(e.message); }
}
</script>
<template>
  <div>
    <header class="p-page-header"><div><p class="p-eyebrow">EL CORAZÓN DE TU TIENDA</p><h1>Productos</h1><p>Todo lo que creás, listo para encontrar a su próximo dueño.</p></div><RouterLink v-if="workspace.activeStoreId" to="/app/products/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Agregar producto</RouterLink></header>
    <div v-if="error" class="p-error">{{error}}</div>
    <DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" @query-change="updateQuery" search-placeholder="Buscar por nombre..." empty-text="No hay productos en este listado.">
      <template v-if="canFeature('products.featured')" #toolbar><label class="featured-filter"><span>Destacados</span><select v-model="featuredFilter" aria-label="Filtrar productos destacados"><option value="">Todos los productos</option><option value="true">Solo destacados</option><option value="false">Sin destacar</option></select></label></template>
      <template #cell-name="{row}"><div class="p-product-cell"><img v-if="row.images?.[0]" :src="row.images[0]" alt="" class="p-product-thumb"/><span v-else class="p-product-thumb"><Icon name="package"/></span><span><strong>{{row.name}}</strong><small>{{row.type==='digital'?'Producto digital':'Producto físico'}}<template v-if="row.variants?.length"> · {{row.variants.length}} variantes</template></small></span></div></template>
      <template #cell-price="{row}"><strong>{{money(row.price)}}</strong><small v-if="row.previousPrice>row.price"><del>{{money(row.previousPrice)}}</del></small></template>
      <template #cell-stock="{row}"><span class="p-badge" :class="typeof stock(row)==='number'&&stock(row)<=5?'orange':''">{{stock(row)}}<template v-if="typeof stock(row)==='number'"> un.</template></span></template>
      <template v-if="canFeature('products.featured')" #cell-featured="{row}"><button type="button" class="featured-toggle" :class="{selected:row.featured}" :aria-pressed="Boolean(row.featured)" :aria-label="`${row.featured?'Quitar de destacados':'Destacar'}: ${row.name}`" :aria-busy="isSaving(row)" :disabled="isSaving(row)" @click="toggleFeatured(row)"><span v-if="isSaving(row)" class="p-spinner"/><Icon v-else name="star" :size="15"/>{{isSaving(row)?'Guardando...':row.featured?'Destacado':'Destacar'}}</button></template>
      <template #cell-active="{value}"><span class="p-badge dot" :class="value?'green':'orange'">{{value?'Visible':'Oculto'}}</span></template>
      <template #actions="{row}"><RouterLink :to="`/app/products/${row._id}`" class="btn btn-secondary btn-small"><Icon name="edit" :size="13"/>Editar</RouterLink><button type="button" class="p-icon-btn danger" :title="`Archivar ${row.name}`" :aria-label="`Archivar ${row.name}`" @click="remove(row)"><Icon name="trash" :size="14"/></button></template>
    </DataTable>
    <p v-if="canFeature('products.featured')" class="p-help">Marcá los productos que querés mostrar en Destacados. La tienda muestra hasta 12 destacados visibles, del más reciente al más antiguo. Los ocultos conservan su marca para cuando los publiques.</p>
    <p class="p-mobile-card-hint">Deslizá el listado para ver todas las columnas y acciones.</p>
  </div>
</template>
<style scoped>
.featured-filter{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--muted);margin-left:auto}.featured-filter select{max-width:100%;min-height:37px;padding:8px 28px 8px 11px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:8px;font:inherit}.featured-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:115px;min-height:34px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--muted);font-size:11px;cursor:pointer;white-space:nowrap}.featured-toggle.selected{color:var(--primary);background:var(--surface-alt);border-color:var(--primary)}.featured-toggle.selected :deep(svg){fill:color-mix(in srgb,currentColor 15%,transparent)}.featured-toggle:disabled{cursor:wait;opacity:.7}.featured-toggle .p-spinner{width:14px;height:14px}@media(max-width:760px){.featured-filter{margin-left:0;flex-wrap:wrap}.featured-filter>span{display:none}}
</style>

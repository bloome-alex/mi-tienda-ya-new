<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { notify } from '../../services/notifications.js';
import { fetchAll } from '../../services/panel.js';
import { CategoryTree } from '../../services/categories.js';
import Icon from '../../components/Icon.vue';
const route = useRoute(), router = useRouter(), editing = computed(() => Boolean(route.params.id));
const loading = ref(true), saving = ref(false), error = ref(''), loadFailed = ref(false), categories = ref([]);
const form = reactive({ name: '', description: '', active: true, parentId: '' });
const tree = computed(() => new CategoryTree(categories.value));
const parentOptions = computed(() => tree.value.assignableParents(route.params.id));
const childCount = computed(() => editing.value ? tree.value.children(route.params.id).length : 0);
const selectedParent = computed(() => tree.value.get(form.parentId));
onMounted(async () => {
  try {
    const path = `/stores/${workspace.activeStoreId}/categories`;
    const [allCategories, category] = await Promise.all([fetchAll(path), editing.value ? api.get(`${path}/${route.params.id}`) : null]);
    categories.value = allCategories;
    if (category) Object.assign(form, { name: category.name, description: category.description || '', active: category.active, parentId: CategoryTree.id(category.parentId) });
    else if (parentOptions.value.some(parent => parent._id === route.query.parentId)) form.parentId = route.query.parentId;
  } catch (e) { error.value = e.message; loadFailed.value = true; }
  finally { loading.value = false; }
});
async function save() {
  saving.value = true; error.value = '';
  try {
    const path = `/stores/${workspace.activeStoreId}/categories`;
    const data = { name: form.name, description: form.description, active: form.active, parentId: form.parentId || null };
    if (editing.value) await api.put(`${path}/${route.params.id}`, data);
    else await api.post(path, data);
    notify.success(form.parentId ? 'Subcategoría guardada.' : 'Categoría guardada.');
    router.push('/app/categories');
  } catch (e) { error.value = e.message; notify.error(e.message); }
  finally { saving.value = false; }
}
</script>
<template>
  <div>
    <RouterLink to="/app/categories" class="p-back-link"><Icon name="back" :size="14"/>Volver a categorías</RouterLink>
    <header class="p-page-header"><div><h1>{{ editing ? (form.parentId ? 'Editar subcategoría' : 'Editar categoría') : (form.parentId ? 'Nueva subcategoría' : 'Nueva categoría') }}</h1><p>Organizá el catálogo con categorías y subcategorías en los niveles que necesites.</p></div></header>
    <div v-if="error" class="p-error">{{ error }}</div>
    <div v-if="loading" class="p-loading-page"><span class="p-spinner"/></div>
    <form v-else-if="!loadFailed" class="p-form" @submit.prevent="save">
      <section class="p-section-card"><div class="p-form-grid">
        <div class="p-field full"><label for="category-parent">Dentro de la categoría</label><select id="category-parent" v-model="form.parentId" aria-describedby="category-parent-help"><option value="">Ninguna: es una categoría principal</option><option v-for="parent in parentOptions" :key="parent._id" :value="parent._id">{{ parent.categoryPath }}{{ !parent.active ? ' (oculta)' : '' }}</option></select><small id="category-parent-help">{{ childCount ? `Esta categoría tiene ${childCount} ${childCount === 1 ? 'subcategoría directa' : 'subcategorías directas'}. Al moverla se conserva toda su rama y los productos asignados.` : 'Elegí cualquier nivel para crear una subcategoría, o dejá “Ninguna” para el primer nivel.' }} La propia categoría y sus descendientes no se pueden elegir como destino.</small></div>
        <div class="p-field full"><label for="category-name">Nombre *</label><input id="category-name" v-model.trim="form.name" required maxlength="120" :placeholder="form.parentId ? 'Por ejemplo: Bolsos' : 'Por ejemplo: Accesorios'"/></div>
        <div v-if="form.name" class="category-location"><Icon name="tag" :size="17"/><span>{{ selectedParent ? tree.label(selectedParent) + ' / ' : '' }}<strong>{{ form.name }}</strong></span></div>
        <div class="p-field full"><label for="category-description">Descripción</label><textarea id="category-description" v-model="form.description" rows="4" maxlength="1000"/></div>
        <label class="p-check"><input v-model="form.active" type="checkbox"/>Mostrar en la tienda</label>
      </div></section>
      <footer class="p-form-footer"><small>Los productos se asignan desde su ficha.</small><div class="p-form-actions"><RouterLink to="/app/categories" class="btn btn-secondary">Cancelar</RouterLink><button class="btn btn-primary" :disabled="saving || !workspace.activeStoreId">{{ saving ? 'Guardando...' : 'Guardar categoría' }}</button></div></footer>
    </form>
  </div>
</template>
<style scoped>
.category-location{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:13px 15px;background:var(--surface-alt);border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.category-location svg{flex:none;color:var(--primary)}.category-location strong{color:var(--text)}
</style>

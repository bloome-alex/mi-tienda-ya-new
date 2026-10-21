<script setup>
import { useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { notify,confirmDialog } from '../../services/notifications.js';
import { useCollection } from '../../services/panel.js';
import { loadStores,selectStore } from '../../services/workspace.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';
const router=useRouter(),{rows,loading,error,meta,load,updateQuery}=useCollection('/admin/stores');
const columns=[{key:'name',label:'Tienda'},{key:'ownerId',label:'Vendedor'},{key:'active',label:'Estado'}];
async function design(row){await loadStores();if(await selectStore(row._id))router.push('/app/design')}
async function remove(row){if(!await confirmDialog({title:'Archivar tienda',message:`La tienda ${row.name} dejará de estar disponible. Se conservarán pedidos y registros de ventas.`,confirmText:'Archivar tienda',danger:true}))return;try{await api.delete(`/admin/stores/${row._id}`);notify.success('Tienda archivada.');await loadStores();load()}catch(e){notify.error(e.message)}}
</script>
<template><div><header class="p-page-header"><div><p class="p-eyebrow">LOS NEGOCIOS DE TU COMUNIDAD</p><h1>Tiendas</h1><p>Creá, asigná y personalizá cada tienda desde un mismo lugar.</p></div><RouterLink to="/app/stores/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Crear tienda</RouterLink></header><div v-if="error" class="p-error">{{error}}</div><DataTable :rows="rows" :columns="columns" :loading="loading" server :total="meta.total" :page="meta.page" :limit="meta.limit" @query-change="updateQuery" search-placeholder="Buscar tiendas..."><template #cell-name="{row}"><div class="p-product-cell"><span class="p-product-thumb"><Icon name="store"/></span><span><strong>{{row.name}}</strong><small>/t/{{row.slug}}</small></span></div></template><template #cell-ownerId="{row}"><strong>{{row.ownerId?.name||row.owner?.name||'Vendedor asignado'}}</strong><small>{{row.ownerId?.email||row.owner?.email||''}}</small></template><template #cell-active="{row}"><span class="p-badge dot" :class="row.active?'green':'orange'">{{row.active?'Publicada':'En preparación'}}</span></template><template #actions="{row}"><button class="btn btn-secondary btn-small" @click="design(row)"><Icon name="palette" :size="13"/>Personalizar</button><RouterLink :to="`/app/stores/${row._id}`" class="p-icon-btn" title="Editar tienda"><Icon name="edit" :size="14"/></RouterLink><a :href="`/t/${row.slug}`" class="p-icon-btn" target="_blank" rel="noopener" title="Abrir tienda"><Icon name="external" :size="14"/></a><button class="p-icon-btn danger" title="Archivar tienda" @click="remove(row)"><Icon name="trash" :size="14"/></button></template></DataTable></div></template>

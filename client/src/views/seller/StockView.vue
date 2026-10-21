<script setup>
import { ref,computed,onMounted } from 'vue';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { notify } from '../../services/notifications.js';
import { fetchAll } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';
const rows=ref([]),loading=ref(true),saving=ref(false),error=ref(''),reason=ref(''),onlyLow=ref(false),conflicts=ref([]);
const changed=computed(()=>rows.value.filter(r=>Number(r.next)!==r.original));
const visible=computed(()=>onlyLow.value?rows.value.filter(r=>r.original<=5):rows.value);
const columns=[{key:'name',label:'Producto / variante'},{key:'original',label:'Disponible'},{key:'next',label:'Nuevo stock'},{key:'difference',label:'Ajuste'}];
async function load(){loading.value=true;error.value='';try{if(!workspace.activeStoreId){rows.value=[];return}const products=await fetchAll(`/stores/${workspace.activeStoreId}/stock`);rows.value=products.filter(p=>p.type==='physical'&&!p.madeToOrder).flatMap(p=>p.variants?.length?p.variants.map(v=>({_id:`${p._id}-${v.id}`,productId:p._id,variantId:v.id,name:p.name,variantName:v.name,image:p.images?.[0],original:v.stock,next:v.stock})): [{_id:p._id,productId:p._id,name:p.name,image:p.images?.[0],original:p.stock,next:p.stock}]);}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load);
function revert(){rows.value.forEach(r=>r.next=r.original);conflicts.value=[];}
async function save(){
 if(!changed.value.length)return;
 if(changed.value.some(r=>!Number.isSafeInteger(Number(r.next))||Number(r.next)<0)){notify.error('Las cantidades deben ser enteros iguales o mayores a cero.');return}
 if(!reason.value.trim()){notify.error('Indicá el motivo del ajuste para registrar el movimiento.');return}
 saving.value=true;conflicts.value=[];let updatedCount=0;
 const pending=changed.value.map(r=>({productId:r.productId,variantId:r.variantId,stock:Number(r.next),expectedStock:r.original}));
 try{
   for(let start=0;start<pending.length;start+=500){
    const result=await api.put(`/stores/${workspace.activeStoreId}/stock`,{items:pending.slice(start,start+500),reason:reason.value});
    updatedCount+=result.updated?.length||0;conflicts.value.push(...(result.conflicts||[]));
   }
   if(conflicts.value.length)notify.info(`Se guardaron ${updatedCount} ajustes. ${conflicts.value.length} productos cambiaron de stock mientras editabas: revisá las cantidades actualizadas.`);
   else{notify.success(`Stock actualizado: ${updatedCount} ajustes registrados.`);reason.value=''}
 }catch(e){notify.error(updatedCount?`${updatedCount} ajustes ya se guardaron. ${e.message} Revisá el listado actualizado para continuar.`:e.message)}
 finally{await load();saving.value=false}
}
</script>
<template><div><header class="p-page-header"><div><p class="p-eyebrow">SIEMPRE AL DÍA</p><h1>Stock</h1><p>Escribí la cantidad final que querés tener disponible y guardá varios ajustes a la vez.</p></div><button class="btn btn-secondary" :disabled="loading||saving||changed.length>0" @click="load"><Icon name="refresh" :size="15"/>Actualizar</button></header><div v-if="error" class="p-error">{{error}}</div><div class="p-info">Los productos digitales y los realizados a pedido no usan stock. Las ventas reservadas ya se descuentan del disponible.</div><div v-if="conflicts.length" class="p-info p-warning"><strong>Algunas cantidades cambiaron mientras editabas.</strong><p v-for="(c,i) in conflicts" :key="i">{{c.message||'Conflicto de stock'}} · Stock actual: {{c.currentStock??'ver listado'}}</p>Revisá el listado actualizado y volvé a aplicar los ajustes pendientes.</div><DataTable :rows="visible" :columns="columns" :loading="loading" :limit="20" search-placeholder="Buscar producto o variante..." empty-text="Todavía no hay productos con control de stock."><template #toolbar><label class="p-check"><input v-model="onlyLow" type="checkbox"/>Solo stock bajo (5 o menos)</label></template><template #cell-name="{row}"><div class="p-product-cell"><img v-if="row.image" :src="row.image" alt="" class="p-product-thumb"/><span v-else class="p-product-thumb"><Icon name="package" :size="18"/></span><span><strong>{{row.name}}</strong><small>{{row.variantName||'Presentación única'}}</small></span></div></template><template #cell-original="{value}"><span class="p-badge" :class="value<=5?'orange':'green'">{{value}} un.</span></template><template #cell-next="{row}"><input v-model="row.next" class="p-table-input p-stock-input" :aria-label="`Nuevo stock de ${row.name} ${row.variantName||''}`" type="number" min="0" step="1" :disabled="saving"/></template><template #cell-difference="{row}"><span v-if="Number(row.next)!==row.original" class="p-stock-change" :class="Number(row.next)>row.original?'positive':'negative'">{{Number(row.next)>row.original?'+':''}}{{Number(row.next)-row.original}} un.</span><span v-else class="p-muted">Sin cambios</span></template></DataTable><div class="p-form-footer p-sticky-actions"><div class="p-field" style="flex:1;max-width:520px"><label for="stock-reason">Motivo del ajuste</label><input id="stock-reason" v-model="reason" maxlength="500" placeholder="Por ejemplo: reposición de mercadería o inventario" :disabled="saving"/></div><div class="p-form-actions"><button class="btn btn-secondary" :disabled="saving||!changed.length" @click="revert">Deshacer</button><button class="btn btn-primary" :disabled="saving||!changed.length" @click="save"><Icon name="check" :size="16"/>{{saving?'Guardando...':`Guardar ${changed.length} ${changed.length===1?'ajuste':'ajustes'}`}}</button></div></div></div></template>

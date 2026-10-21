<script setup>
import { computed, ref, nextTick, watch } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import DesignGroup from './DesignGroup.vue';
import { DesignTextCatalog, designTextSections } from '../../services/designTextCatalog.js';
const props=defineProps({modelValue:{type:Object,required:true},activePage:{type:String,default:'shop'},disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const initialSection=()=>Object.hasOwn(designTextSections,props.activePage)?props.activePage:'common';
const category=ref(initialSection()),search=ref(''),editedOnly=ref(false),expanded=ref(category.value);
const catalog=computed(()=>new DesignTextCatalog(props.modelValue));
const allFields=computed(()=>catalog.value.fields());
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const editedCount=computed(()=>allFields.value.filter(field=>catalog.value.edited(field)).length);
const groups=computed(()=>Object.entries(designTextSections).map(([key,title])=>({
  key,title,items:allFields.value.filter(field=>{
    if(field.section!==key||(category.value!=='all'&&category.value!==key))return false;
    if(editedOnly.value&&!catalog.value.edited(field))return false;
    const query=normalized(search.value.trim()),value=catalog.value.value(field);
    return !query||normalized([field.label,value,field.default,field.path].join(' ')).includes(query);
  })
})).filter(group=>group.items.length));
const visibleCount=computed(()=>groups.value.reduce((count,group)=>count+group.items.length,0));
function update(field,value){emit('update:modelValue',catalog.value.update(field,value));}
function fieldOptions(field){
  const fallback=field.hasDefault?String(field.default??''):'';const tokens=[...new Set(fallback.match(/\{[A-Za-z]+\}/g)||[])];
  return {...field,key:field.path,optional:true,counter:field.type==='textarea',rows:field.path==='terms.content'?12:undefined,placeholder:fallback,help:tokens.length?`Variables disponibles: ${tokens.join(', ')}. Se reemplazan por los datos de tu tienda o del pedido.`:undefined};
}
function selectCategory(){expanded.value=category.value==='all'?'':category.value;}
function searchAll(){category.value='all';}
async function focusField(identifier){
  const field=allFields.value.find(item=>item.path===identifier||item.key===identifier||item.path===`copy.${identifier}`);if(!field)return;
  search.value='';editedOnly.value=false;category.value=field.section;expanded.value=field.section;
  await nextTick();const wrapper=document.querySelector(`[data-text-path="${CSS.escape(field.path)}"]`);wrapper?.scrollIntoView({block:'nearest'});wrapper?.querySelector('input:not([disabled]),textarea:not([disabled])')?.focus({preventScroll:true});
}
watch(()=>props.activePage,value=>{if(!search.value&&category.value!=='all'&&Object.hasOwn(designTextSections,value)){category.value=value;expanded.value=value;}});
defineExpose({focusField});
</script>
<template>
  <div class="ed-copy-editor">
    <div class="ed-copy-tools">
      <div class="ed-copy-search"><Icon name="search" :size="16"/><label class="ed-visually-hidden" for="design-copy-search">Buscar un texto</label><input id="design-copy-search" v-model="search" type="search" placeholder="Buscar un título, botón, descripción o etiqueta" @input="searchAll"/><button v-if="search" type="button" aria-label="Limpiar búsqueda de textos" @click="search=''">×</button></div>
      <div class="ed-field"><label for="design-copy-category">Textos de</label><select id="design-copy-category" v-model="category" @change="selectCategory"><option value="all">Toda la tienda</option><option v-for="(label,key) in designTextSections" :key="key" :value="key">{{label}}</option></select></div>
      <label class="ed-copy-edited"><input v-model="editedOnly" type="checkbox"/>Sólo personalizados <span>{{editedCount}}</span></label>
      <p class="ed-help" aria-live="polite">{{visibleCount}} {{visibleCount===1?'texto disponible':'textos disponibles'}}. Los cambios se ven inmediatamente en la vista previa.</p>
    </div>
    <DesignGroup v-for="group in groups" :key="group.key" :title="group.title" :description="group.items.length+' textos para personalizar'" :model-value="!!search || expanded===group.key" @update:model-value="expanded=$event?group.key:''">
      <div v-for="field in group.items" :key="field.path" class="ed-copy-item" :data-text-path="field.path">
        <DesignField :model-value="catalog.value(field)" :field="fieldOptions(field)" scope="textos" :disabled="disabled" @update:model-value="update(field,$event)"/>
        <button v-if="field.hasDefault && catalog.edited(field)" type="button" class="ed-copy-restore" :disabled="disabled" :aria-label="'Restaurar texto inicial: '+field.label" @click="update(field,field.default)"><Icon name="refresh" :size="12"/>Usar texto inicial</button>
      </div>
    </DesignGroup>
    <div v-if="!groups.length" class="ed-copy-empty"><Icon name="search" :size="24"/><strong>No hay textos con estos filtros</strong><p>Probá con otro término o mostrá toda la tienda.</p><button class="btn btn-secondary btn-sm" type="button" @click="search='';editedOnly=false;category='all'">Mostrar todos los textos</button></div>
  </div>
</template>

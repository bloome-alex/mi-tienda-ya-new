<script setup>
import { computed, ref, nextTick } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import DesignGroup from './DesignGroup.vue';
import { storeTextFields, storeTextSections } from '../../services/design.js';
const props=defineProps({modelValue:{type:Object,required:true},activePage:{type:String,default:'shop'},disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const category=ref(Object.hasOwn(storeTextSections,props.activePage)?props.activePage:'common');
const search=ref(''),editedOnly=ref(false),expanded=ref(category.value);
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const editedCount=computed(()=>storeTextFields.filter(field=>props.modelValue[field.key]!==field.default).length);
const groups=computed(()=>Object.entries(storeTextSections).map(([key,title])=>({
  key,title,items:storeTextFields.filter(field=>{
    if(field.section!==key||(category.value!=='all'&&category.value!==key))return false;
    if(editedOnly.value&&props.modelValue[field.key]===field.default)return false;
    const query=normalized(search.value.trim());
    return !query||normalized([field.label,props.modelValue[field.key],field.default].join(' ')).includes(query);
  })
})).filter(group=>group.items.length));
const visibleCount=computed(()=>groups.value.reduce((count,group)=>count+group.items.length,0));
function update(key,value){emit('update:modelValue',{...props.modelValue,[key]:value});}
function fieldOptions(field){
  const tokens=[...new Set(field.default.match(/\{[A-Za-z]+\}/g)||[])];
  return {...field,optional:true,counter:field.type==='textarea',placeholder:field.default,help:tokens.length?`Variables disponibles: ${tokens.join(', ')}. Se reemplazan por los datos de tu tienda o del pedido.`:undefined};
}
function selectCategory(){expanded.value=category.value==='all'?'':category.value;}
function searchAll(){category.value='all';}
async function focusField(key){
  const field=storeTextFields.find(item=>item.key===key);if(!field)return;
  search.value='';editedOnly.value=false;category.value=field.section;expanded.value=field.section;
  await nextTick();const input=document.getElementById(`ed-copy-${key}`);input?.scrollIntoView({block:'nearest'});input?.focus({preventScroll:true});
}
defineExpose({focusField});
</script>
<template>
  <div class="ed-copy-editor">
    <div class="ed-copy-tools">
      <p class="ed-help">Personalizá los mensajes de la tienda, botones y formularios. Los títulos principales y el contenido de tus secciones también se editan en sus pestañas.</p>
      <div class="ed-copy-search"><Icon name="search" :size="16"/><label class="ed-visually-hidden" for="design-copy-search">Buscar un texto</label><input id="design-copy-search" v-model="search" type="search" placeholder="Buscar un título, botón o mensaje" @input="searchAll"/><button v-if="search" type="button" aria-label="Limpiar búsqueda de textos" @click="search=''">×</button></div>
      <div class="ed-field"><label for="design-copy-category">Textos de</label><select id="design-copy-category" v-model="category" @change="selectCategory"><option value="all">Todas las páginas</option><option v-for="(label,key) in storeTextSections" :key="key" :value="key">{{label}}</option></select></div>
      <label class="ed-copy-edited"><input v-model="editedOnly" type="checkbox"/>Sólo personalizados <span>{{editedCount}}</span></label>
      <p class="ed-help" aria-live="polite">{{visibleCount}} {{visibleCount===1?'texto disponible':'textos disponibles'}}. Los valores vacíos se conservan; revisá los botones antes de guardar.</p>
    </div>
    <DesignGroup v-for="group in groups" :key="group.key" :title="group.title" :description="group.items.length+' textos para personalizar'" :model-value="!!search || expanded===group.key" @update:model-value="expanded=$event?group.key:''">
      <div v-for="field in group.items" :key="field.key" class="ed-copy-item">
        <DesignField :model-value="modelValue[field.key]" :field="fieldOptions(field)" scope="copy" :disabled="disabled" @update:model-value="update(field.key,$event)"/>
        <button v-if="modelValue[field.key]!==field.default" type="button" class="ed-copy-restore" :disabled="disabled" :aria-label="'Restaurar texto inicial: '+field.label" @click="update(field.key,field.default)"><Icon name="refresh" :size="12"/>Usar texto inicial</button>
      </div>
    </DesignGroup>
    <div v-if="!groups.length" class="ed-copy-empty"><Icon name="search" :size="24"/><strong>No hay textos con estos filtros</strong><p>Probá con otro término o mostrá todas las páginas.</p><button class="btn btn-secondary btn-sm" type="button" @click="search='';editedOnly=false;category='all'">Mostrar todos los textos</button></div>
  </div>
</template>

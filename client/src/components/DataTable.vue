<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
const props=defineProps({columns:{type:Array,default:()=>[]},rows:{type:Array,default:()=>[]},loading:Boolean,emptyText:{type:String,default:'Todavía no hay registros.'},searchable:{type:Boolean,default:true},server:Boolean,total:Number,page:{type:Number,default:1},limit:{type:Number,default:15},searchPlaceholder:{type:String,default:'Buscar...'}});
const emit=defineEmits(['query-change']);
const search=ref(''),localPage=ref(1); let timer;
const filtered=computed(()=>props.server ? props.rows : props.rows.filter(row=>JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())));
const count=computed(()=>props.server ? Number(props.total||0) : filtered.value.length);
const current=computed(()=>props.server ? props.page : localPage.value);
const pages=computed(()=>Math.max(1,Math.ceil(count.value/props.limit)));
const visible=computed(()=>props.server ? filtered.value : filtered.value.slice((localPage.value-1)*props.limit,localPage.value*props.limit));
watch(search,()=>{localPage.value=1;clearTimeout(timer);if(props.server)timer=setTimeout(()=>emit('query-change',{page:1,search:search.value}),300)});
watch(pages,n=>{if(localPage.value>n)localPage.value=n});
onBeforeUnmount(()=>clearTimeout(timer));
function go(p){if(props.server)emit('query-change',{page:p,search:search.value});else localPage.value=p;}
function value(row,key){const out=key.split('.').reduce((o,k)=>o?.[k],row);return out==null?'—':out;}
</script>
<template>
<section class="p-table-card">
 <div v-if="searchable || $slots.toolbar" class="p-table-toolbar"><label v-if="searchable" class="p-search"><Icon name="search" :size="18"/><input v-model="search" :placeholder="searchPlaceholder" aria-label="Buscar en el listado" type="search"/></label><slot name="toolbar"/></div>
 <div class="p-table-scroll" :aria-busy="loading"><table class="p-table"><thead><tr><th v-for="column in columns" :key="column.key" scope="col">{{column.label}}</th><th v-if="$slots.actions" scope="col" class="p-actions-head">Acciones</th></tr></thead><tbody>
 <tr v-if="loading"><td :colspan="columns.length+($slots.actions?1:0)" class="p-table-empty"><span class="p-spinner"/> Cargando registros...</td></tr>
 <tr v-else-if="!visible.length"><td :colspan="columns.length+($slots.actions?1:0)" class="p-table-empty"><Icon name="package" :size="32"/><strong>{{emptyText}}</strong><span>{{search?'Probá con otra búsqueda.':'Los nuevos registros aparecerán acá.'}}</span><slot name="empty"/></td></tr>
 <tr v-for="(row,index) in loading?[]:visible" :key="row._id||row.id||index"><td v-for="column in columns" :key="column.key"><slot :name="`cell-${column.key}`" :row="row" :value="value(row,column.key)">{{value(row,column.key)}}</slot></td><td v-if="$slots.actions"><div class="p-row-actions"><slot name="actions" :row="row"/></div></td></tr>
 </tbody></table></div>
 <div class="p-table-footer"><span>{{count}} {{count===1?'registro':'registros'}}<template v-if="count"> · {{(current-1)*limit+1}}–{{Math.min(current*limit,count)}}</template></span><div><button class="p-icon-btn" :disabled="current<=1 || loading" aria-label="Página anterior" @click="go(current-1)"><Icon name="back" :size="16"/></button><span>{{current}} / {{pages}}</span><button class="p-icon-btn" :disabled="current>=pages || loading" aria-label="Página siguiente" @click="go(current+1)"><Icon name="arrow" :size="16"/></button></div></div>
</section>
</template>

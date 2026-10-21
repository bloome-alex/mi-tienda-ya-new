<script setup>
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { CategoryTree } from '../services/categories.js';
const props=defineProps({category:{type:Object,required:true},tree:{type:Object,required:true},selected:{type:String,default:''},level:{type:Number,default:0},hoverExpand:{type:Boolean,default:false}});
const emit=defineEmits(['select']);
const expanded=ref(false),children=computed(()=>props.tree.children(props.category));
const id=computed(()=>CategoryTree.id(props.category));
const active=computed(()=>id.value===props.selected);
const inSelectedTrail=computed(()=>props.tree.trail(props.selected).some(item=>CategoryTree.id(item)===id.value));
function canHover(){return props.hoverExpand&&typeof window!=='undefined'&&window.matchMedia?.('(hover: hover)').matches;}
function openOnHover(){if(canHover()&&children.value.length)expanded.value=true;}
function closeOnHover(){if(canHover())expanded.value=inSelectedTrail.value;}
function focusIn(){if(props.hoverExpand&&children.value.length)expanded.value=true;}
function focusOut(event){if(props.hoverExpand&&!event.currentTarget.contains(event.relatedTarget))expanded.value=inSelectedTrail.value;}
watch(()=>[props.selected,props.tree],()=>{if(inSelectedTrail.value)expanded.value=true;},{immediate:true});
</script>
<template>
  <li class="store-category-branch" :class="{'hover-expand':hoverExpand}" @mouseenter="openOnHover" @mouseleave="closeOnHover" @focusin="focusIn" @focusout="focusOut">
    <div class="category-branch-row" :class="{selected:active}">
      <button type="button" class="category-branch-select" :title="tree.label(category)" :aria-current="active?'true':undefined" @click="emit('select',id)">{{category.name}}</button>
      <button v-if="children.length" type="button" class="category-branch-toggle" :aria-label="(expanded?'Cerrar':'Abrir')+' subcategorías de '+category.name" :aria-expanded="expanded" @click="expanded=!expanded"><Icon :name="expanded?'chevron-down':'chevron-right'" :size="16"/></button>
    </div>
    <ul v-if="children.length && expanded" class="category-branch-children" :style="{'--branch-indent':level>=3?'0px':'10px'}"><StoreCategoryBranch v-for="child in children" :key="CategoryTree.id(child)" :category="child" :tree="tree" :selected="selected" :level="level+1" :hover-expand="hoverExpand" @select="emit('select',$event)"/></ul>
  </li>
</template>
<style scoped>
.store-category-branch{list-style:none;margin:0;padding:0;min-width:0}.category-branch-row{display:flex;align-items:stretch;gap:5px;border-radius:7px}.category-branch-row.selected{background:var(--store-surface-alt);color:var(--store-primary)}.category-branch-select{flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:start;padding:11px 12px;font:inherit;font-size:.79rem;overflow-wrap:anywhere}.category-branch-select:hover{background:var(--store-surface-alt);border-radius:7px}.category-branch-toggle{flex:none;width:36px;min-height:36px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--store-muted)}.category-branch-toggle:hover{background:var(--store-surface-alt);color:var(--store-text)}.category-branch-children{margin-block:1px 5px;margin-inline:var(--branch-indent,10px) 0;padding-block:0;padding-inline:var(--branch-indent,10px) 0;border-inline-start:1px solid var(--store-line)}.category-branch-toggle[aria-expanded=true] svg{transform:rotate(90deg)}.category-branch-row button:focus-visible{outline:2px solid var(--store-primary);outline-offset:1px}.category-branch-row.selected .category-branch-select{font-weight:650}@media(hover:hover){.hover-expand>.category-branch-row>.category-branch-toggle{opacity:.58}.hover-expand>.category-branch-row:hover>.category-branch-toggle,.hover-expand>.category-branch-row:focus-within>.category-branch-toggle{opacity:1}}@media(max-width:500px){.category-branch-select{font-size:.76rem}}
</style>

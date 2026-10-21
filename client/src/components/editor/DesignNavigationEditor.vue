<script setup>
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import { navItemTemplate } from '../../services/design.js';
import { uniqueKey } from '../../services/ids.js';
import { confirmDialog } from '../../services/notifications.js';
const props=defineProps({modelValue:{type:Array,default:()=>[]},design:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const expanded=ref('');
const targets=[['home','Inicio de la tienda'],['catalog','Catálogo'],['featured','Destacados'],['contact','Contacto'],['terms','Términos y condiciones'],['social','Redes sociales'],['section','Una sección personalizada']];
const names={home:'Tienda',catalog:'Catálogo',featured:'Destacados',contact:'Contacto',terms:'Términos',social:'Redes',section:'Sección'};
const sectionOptions=computed(()=>props.design.sections.map(item=>[item.id,item.title || 'Sección sin título']));
const targetField={key:'target',label:'Destino',type:'select',options:targets};
function add(){
  if(props.disabled||props.modelValue.length>=12)return;
  const item={...navItemTemplate,id:uniqueKey(),target:'catalog',label:'Catálogo'};
  emit('update:modelValue',[...props.modelValue,item]);expanded.value=item.id;
}
function move(index,amount){
  const next=index+amount;if(props.disabled||next<0||next>=props.modelValue.length)return;
  const items=[...props.modelValue];[items[index],items[next]]=[items[next],items[index]];emit('update:modelValue',items);
}
async function remove(item){
  if(props.disabled||!await confirmDialog({title:'Quitar enlace',message:`Se quitará “${item.label||names[item.target]}” de la navegación. La sección de la tienda se conserva.`,confirmText:'Quitar enlace',danger:true}))return;
  emit('update:modelValue',props.modelValue.filter(link=>link.id!==item.id));
}
function changeTarget(item,target){
  item.target=target;
  if(target!=='section')item.sectionId='';
}
function notice(item){
  if(!item.enabled)return 'Este enlace está desactivado; podés conservarlo para usarlo más adelante.';
  if(item.target==='catalog'&&!props.design.shop.showCatalog)return 'El catálogo está oculto. Este enlace aparecerá cuando lo actives.';
  if(item.target==='featured'&&!props.design.shop.showFeatured)return 'Los destacados están ocultos. Este enlace aparecerá cuando los actives.';
  if(item.target==='contact'&&!props.design.shop.showContact)return 'La sección de contacto está oculta. Activala para mostrar este enlace.';
  if(item.target==='terms'&&!props.design.terms.enabled)return 'Los términos no están publicados. Activá su página para mostrar el enlace.';
  if(item.target==='social'&&!props.design.sections.some(section=>section.type==='social'&&section.enabled))return 'Agregá y activá una sección de redes desde Secciones.';
  if(item.target==='section'){
    const section=props.design.sections.find(section=>section.id===item.sectionId);
    if(!section)return 'Elegí la sección de destino. Si la eliminaste, seleccioná otra.';
    if(!section.enabled)return 'La sección elegida está oculta. El enlace aparecerá cuando la actives.';
  }
  return '';
}
defineExpose({openItem(id){expanded.value=id;}});
</script>
<template>
  <div class="ed-navigation-editor">
    <div class="ed-blocks-title"><h3>Enlaces del menú</h3><span>{{modelValue.length}} / 12</span></div>
    <p class="ed-help">Elegí las secciones a las que se puede acceder desde la cabecera. La visibilidad, el destino y el orden se configuran acá; el texto de cada enlace se edita únicamente en Textos.</p>
    <article v-for="(item,index) in modelValue" :key="item.id" class="ed-block-item" :class="{'ed-item-hidden':!item.enabled}">
      <button type="button" class="ed-block-toggle" :aria-expanded="expanded===item.id" :aria-controls="'navbar-link-'+item.id" @click="expanded=expanded===item.id?'':item.id"><span><strong>{{item.label||'Enlace sin texto'}}</strong><small>{{names[item.target]||'Sección'}}</small></span><Icon name="chevron-down" :size="14"/></button>
      <div class="ed-item-actions"><label><input v-model="item.enabled" type="checkbox" :disabled="disabled" :aria-label="'Mostrar enlace '+(item.label||names[item.target])"/>Visible</label><div><button type="button" class="ed-icon-button" :disabled="disabled||index===0" :aria-label="'Subir enlace '+(item.label||names[item.target])" @click="move(index,-1)"><Icon name="arrow-right" class="ed-arrow-up" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled||index===modelValue.length-1" :aria-label="'Bajar enlace '+(item.label||names[item.target])" @click="move(index,1)"><Icon name="arrow-right" class="ed-arrow-down" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled" :aria-label="'Quitar enlace '+(item.label||names[item.target])" @click="remove(item)"><Icon name="trash" :size="14"/></button></div></div>
      <div v-if="expanded===item.id" :id="'navbar-link-'+item.id" class="ed-block-body">
        <DesignField :model-value="item.target" :field="targetField" :scope="'navbar.links.'+item.id" :disabled="disabled" @update:model-value="changeTarget(item,$event)"/>
        <DesignField v-if="item.target==='section'" v-model="item.sectionId" :field="{key:'sectionId',label:'Sección de destino',type:'select',options:[['','Seleccioná una sección'],...sectionOptions]}" :scope="'navbar.links.'+item.id" :disabled="disabled"/>
        <p v-if="notice(item)" class="ed-notice"><Icon name="info" :size="14"/><span>{{notice(item)}}</span></p>
      </div>
    </article>
    <p v-if="!modelValue.length" class="ed-notice">La cabecera no tiene enlaces de secciones. Podés agregar uno; el logo y el acceso al carrito siguen disponibles.</p>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled||modelValue.length>=12" @click="add"><Icon name="plus" :size="15"/>Agregar enlace</button>
    <p v-if="modelValue.length>=12" class="ed-help">Llegaste al máximo de 12 enlaces. Quitá alguno para agregar otro.</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import { socialNetworks, socialLinkTemplate } from '../../services/design.js';
import { uniqueKey } from '../../services/ids.js';
import { confirmDialog } from '../../services/notifications.js';
const props=defineProps({modelValue:{type:Array,default:()=>[]},scope:{type:String,required:true},disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const expanded=ref('');
const networks=socialNetworks.map(network=>[network.value,network.label]);
const networkName=network=>networks.find(option=>option[0]===network)?.[1]||'Red social';
function add(){
  if(props.disabled||props.modelValue.length>=12)return;
  const network=networks.find(option=>!props.modelValue.some(item=>item.network===option[0]))?.[0]||'website';
  const item={...socialLinkTemplate,id:uniqueKey(),network};
  emit('update:modelValue',[...props.modelValue,item]);expanded.value=item.id;
}
function move(index,amount){const next=index+amount;if(props.disabled||next<0||next>=props.modelValue.length)return;const items=[...props.modelValue];[items[index],items[next]]=[items[next],items[index]];emit('update:modelValue',items);}
async function remove(item){if(props.disabled||!await confirmDialog({title:'Quitar red social',message:`Se quitará el enlace a ${networkName(item.network)} de esta sección.`,confirmText:'Quitar red',danger:true}))return;emit('update:modelValue',props.modelValue.filter(link=>link.id!==item.id));}
defineExpose({openItem(id){expanded.value=id;}});
</script>
<template>
  <div class="ed-social-editor">
    <div class="ed-blocks-title"><h3>Redes de esta sección</h3><span>{{modelValue.length}} / 12</span></div>
    <p class="ed-help">Seleccioná las redes que querés mostrar y pegá la dirección completa del perfil. Podés ocultarlas y cambiar su orden.</p>
    <article v-for="(item,index) in modelValue" :key="item.id" class="ed-block-item" :class="{'ed-item-hidden':!item.enabled}">
      <button type="button" class="ed-block-toggle" :aria-expanded="expanded===item.id" :aria-controls="'social-link-'+item.id" @click="expanded=expanded===item.id?'':item.id"><span><strong>{{item.label||networkName(item.network)}}</strong><small>{{item.url?'Enlace configurado':'Completá la dirección del perfil'}}</small></span><Icon name="chevron-down" :size="14"/></button>
      <div class="ed-item-actions"><label><input v-model="item.enabled" type="checkbox" :disabled="disabled" :aria-label="'Mostrar '+networkName(item.network)"/>Visible</label><div><button type="button" class="ed-icon-button" :disabled="disabled||index===0" :aria-label="'Subir '+networkName(item.network)" @click="move(index,-1)"><Icon name="arrow-right" class="ed-arrow-up" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled||index===modelValue.length-1" :aria-label="'Bajar '+networkName(item.network)" @click="move(index,1)"><Icon name="arrow-right" class="ed-arrow-down" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled" :aria-label="'Quitar '+networkName(item.network)" @click="remove(item)"><Icon name="trash" :size="14"/></button></div></div>
      <div v-if="expanded===item.id" :id="'social-link-'+item.id" class="ed-block-body">
        <DesignField v-model="item.network" :field="{key:'network',label:'Red social',type:'select',options:networks}" :scope="scope+'.'+item.id" :disabled="disabled"/>
        <DesignField v-model="item.label" :field="{key:'label',label:'Texto personalizado',type:'text',max:120,optional:true,help:'Si queda vacío se muestra el nombre de la red.'}" :scope="scope+'.'+item.id" :disabled="disabled"/>
        <DesignField v-model="item.url" :field="{key:'url',label:'Enlace al perfil',type:'url',max:2048,placeholder:item.network==='whatsapp'?'https://wa.me/549…':'https://…',help:'Usá un enlace HTTP o HTTPS. No hace falta conectar una cuenta.'}" :scope="scope+'.'+item.id" :disabled="disabled"/>
        <p v-if="!item.enabled" class="ed-notice">Esta red está oculta. Conservá su enlace para volver a mostrarla cuando quieras.</p>
      </div>
    </article>
    <p v-if="!modelValue.length" class="ed-notice">Todavía no agregaste redes a esta sección.</p>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled||modelValue.length>=12" @click="add"><Icon name="plus" :size="15"/>Agregar red social</button>
  </div>
</template>

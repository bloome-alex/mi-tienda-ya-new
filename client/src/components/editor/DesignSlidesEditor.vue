<script setup>
import { ref } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import { slideTemplate } from '../../services/design.js';
import { uniqueKey } from '../../services/ids.js';
import { confirmDialog } from '../../services/notifications.js';
import { targetOptions } from './fields.js';
const props=defineProps({modelValue:{type:Array,default:()=>[]},disabled:Boolean,reason:String,uploads:{type:Object,default:()=>({})},design:Object});
const emit=defineEmits(['update:modelValue','upload']);
const expanded=ref('');
const fields=[{key:'image',label:'Imagen de la diapositiva',type:'image',help:'JPG, PNG o WebP, hasta 5 MiB.'},{key:'buttonTarget',label:'Destino del botón',type:'select',options:targetOptions}];
function add(){if(props.disabled||props.modelValue.length>=8)return;const slide={...JSON.parse(JSON.stringify(slideTemplate)),id:uniqueKey()};emit('update:modelValue',[...props.modelValue,slide]);expanded.value=slide.id;}
function move(index,amount){const next=index+amount;if(props.disabled||next<0||next>=props.modelValue.length)return;const items=[...props.modelValue];[items[index],items[next]]=[items[next],items[index]];emit('update:modelValue',items);}
function duplicate(slide,index){if(props.disabled||props.modelValue.length>=8)return;const copy={...JSON.parse(JSON.stringify(slide)),id:uniqueKey()};const items=[...props.modelValue];items.splice(index+1,0,copy);emit('update:modelValue',items);expanded.value=copy.id;}
async function remove(slide){if(props.disabled||!await confirmDialog({title:'Eliminar diapositiva',message:'Se quitará esta diapositiva del carrusel de portada.',confirmText:'Eliminar',danger:true}))return;emit('update:modelValue',props.modelValue.filter(item=>item.id!==slide.id));}
function reasonFor(field){if(props.reason)return props.reason;if(field.key==='buttonTarget'&&!props.design?.shop.heroShowButton)return 'Activá el botón en Portada principal.';return '';}
function targetHelp(slide){const field=slide.buttonTarget;if(field==='terms'&&!props.design?.terms.enabled)return 'Activá la página de Términos para mostrar este botón.';if(field==='contact'&&!props.design?.shop.showContact)return 'Activá la sección de contacto para mostrar este botón.';if(field==='catalog'&&!props.design?.shop.showCatalog)return 'Activá el catálogo para mostrar este botón.';return '';}
</script>
<template>
  <div class="ed-slides-editor"><div class="ed-blocks-title"><h3>Diapositivas</h3><span>{{modelValue.length}} / 8</span></div><p class="ed-help">Cada diapositiva tiene su propia imagen y destino. Sus títulos, descripciones y textos de botón se editan únicamente en Textos.</p><p v-if="reason" class="ed-notice">{{reason}}</p>
    <article v-for="(slide,index) in modelValue" :key="slide.id" class="ed-block-item"><button type="button" class="ed-block-toggle" :aria-expanded="expanded===slide.id" @click="expanded=expanded===slide.id?'':slide.id"><span><strong>{{index+1}}. {{slide.title || 'Diapositiva sin título propio'}}</strong><small>{{slide.image?'Imagen cargada':'Sin imagen'}}</small></span><Icon name="chevron-down" :size="14"/></button><div class="ed-item-actions"><span>Diapositiva {{index+1}}</span><div><button type="button" class="ed-icon-button" :disabled="disabled || !!reason || index===0" aria-label="Subir diapositiva" @click="move(index,-1)"><Icon name="arrow-right" class="ed-arrow-up" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled || !!reason || index===modelValue.length-1" aria-label="Bajar diapositiva" @click="move(index,1)"><Icon name="arrow-right" class="ed-arrow-down" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled || !!reason || modelValue.length>=8" aria-label="Duplicar diapositiva" @click="duplicate(slide,index)"><Icon name="copy" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled || !!reason" aria-label="Eliminar diapositiva" @click="remove(slide)"><Icon name="trash" :size="14"/></button></div></div><div v-if="expanded===slide.id" class="ed-block-body"><DesignField v-for="field in fields" :key="field.key" v-model="slide[field.key]" :field="field" :scope="'slides.'+slide.id" :disabled="disabled" :reason="reasonFor(field)" :busy="!!uploads['slides.'+slide.id+'.'+field.key]" @upload="emit('upload',{file:$event,target:slide,field:field.key,scope:'slides.'+slide.id})"/><p v-if="design.shop.heroShowButton&&targetHelp(slide)" class="ed-notice">{{targetHelp(slide)}}</p></div></article>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || !!reason || modelValue.length>=8" @click="add"><Icon name="plus" :size="15"/>Agregar diapositiva</button><p v-if="!modelValue.length&&!reason" class="ed-notice">Agregá una diapositiva y cargá su imagen para comenzar.</p>
  </div>
</template>

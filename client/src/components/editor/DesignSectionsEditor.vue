<script setup>
import { ref, reactive, nextTick } from 'vue';
import Icon from '../Icon.vue';
import DesignField from './DesignField.vue';
import DesignSocialEditor from './DesignSocialEditor.vue';
import { blockTemplate, createDesignSection } from '../../services/design.js';
import { uniqueKey } from '../../services/ids.js';
import { confirmDialog } from '../../services/notifications.js';
import { alignmentOptions, directionOptions, targetOptions, spacingFields } from './fields.js';
const props = defineProps({ modelValue: { type: Array, default: () => [] }, uploads: { type: Object, default: () => ({}) }, disabled: Boolean, design: Object, allowSocial: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue', 'upload']);
const expanded = ref(''), expandedBlocks = reactive({}), newBlockTypes = reactive({});
const socialEditors=new Map();
function rememberSocialEditor(id,editor){if(editor)socialEditors.set(id,editor);else socialEditors.delete(id);}
async function openField({sectionId,linkId,blockId}){
  expanded.value=sectionId;if(blockId)expandedBlocks[sectionId]=blockId;
  await nextTick();if(linkId)socialEditors.get(sectionId)?.openItem(linkId);
}
defineExpose({openField});
const types = [
  {type:'text',title:'Texto',description:'Historia y contenido',icon:'edit'},
  {type:'imageText',title:'Imagen y texto',description:'Presentá una colección',icon:'image'},
  {type:'banner',title:'Banner',description:'Un mensaje destacado',icon:'sparkles'},
  {type:'benefits',title:'Beneficios',description:'Razones para elegirte',icon:'shield'},
  {type:'faq',title:'Preguntas',description:'Respuestas frecuentes',icon:'info'},
  {type:'gallery',title:'Galería',description:'Una colección de fotos',icon:'image'},
  {type:'social',title:'Redes sociales',description:'Conectá con tu comunidad',icon:'globe'}
];
const visibleTypes = () => types.filter(item => item.type !== 'social' || props.allowSocial);
const blockTypes = [['text','Texto'],['image','Imagen'],['button','Botón'],['benefit','Beneficio'],['faq','Pregunta y respuesta']];
const sectionFields = [
  {key:'image',label:'Imagen de la sección',type:'image',help:'JPG, PNG o WebP, hasta 5 MiB. También podés agregar imágenes como complementos.'},
  {key:'buttonTarget',label:'Destino del botón',type:'select',options:targetOptions}
];
const styleFields = [
  {key:'placement',label:'Ubicación en la tienda',type:'select',options:[['beforeCatalog','Antes del catálogo'],['afterCatalog','Después del catálogo']]},
  {key:'variant',label:'Presentación',type:'variants',options:[['plain','Simple'],['card','Tarjeta'],['contrast','Contraste'],['split','Dividida'],['overlay','Sobre imagen']]},
  {key:'alignment',label:'Alineación',type:'select',options:alignmentOptions},
  {key:'textDirection',label:'Dirección del texto',type:'select',options:directionOptions,help:'Define el sentido de lectura. La alineación se configura por separado.'},
  {key:'background',label:'Fondo de la sección',type:'select',options:[['transparent','Transparente'],['surface','Fondo de la tienda'],['muted','Suave'],['contrast','Contraste']]},
  {key:'columns',label:'Columnas de complementos en escritorio',type:'range',min:1,max:4,unit:''},
  {key:'mobileColumns',label:'Columnas de complementos en celular',type:'range',min:1,max:4,unit:''},
  ...spacingFields()
];
function add(type) {
  if(props.disabled || props.modelValue.length >= 12) return;
  const section = createDesignSection(type, uniqueKey());
  emit('update:modelValue', [...props.modelValue, section]);
  expanded.value = section.id;
}
function move(index, amount) {
  const next = index + amount;
  if(props.disabled || next < 0 || next >= props.modelValue.length) return;
  const items = [...props.modelValue];
  [items[index],items[next]]=[items[next],items[index]];
  emit('update:modelValue',items);
}
function duplicate(section,index) {
  if(props.disabled || props.modelValue.length>=12) return;
  const clone = JSON.parse(JSON.stringify(section));
  clone.id = uniqueKey(); clone.title = `${clone.title || 'Sección'} (copia)`.slice(0,240);
  clone.blocks.forEach(block=>{block.id=uniqueKey();});
  clone.socialLinks?.forEach(link=>{link.id=uniqueKey();});
  const items=[...props.modelValue];items.splice(index+1,0,clone);emit('update:modelValue',items);expanded.value=clone.id;
}
async function remove(section) {
  if(props.disabled || !await confirmDialog({title:'Eliminar sección',message:`Se quitará “${section.title || label(section.type)}” junto con sus complementos. El cambio se aplica a la tienda cuando guardes.`,confirmText:'Eliminar sección',danger:true}))return;
  emit('update:modelValue',props.modelValue.filter(item=>item.id!==section.id));
  if(expanded.value===section.id)expanded.value='';
}
function label(type) { return types.find(item=>item.type===type)?.title || 'Sección'; }
function blockLabel(type) { return blockTypes.find(item=>item[0]===type)?.[1] || 'Complemento'; }
function addBlock(section) {
  if(props.disabled || section.blocks.length>=12)return;
  const type=newBlockTypes[section.id] || 'text',id=uniqueKey();
  section.blocks.push({...JSON.parse(JSON.stringify(blockTemplate)),id,type,title:type==='faq'?'Tu pregunta':type==='benefit'?'Un beneficio para tus clientes':'',text:type==='faq'?'Escribí una respuesta clara.':''});
  expandedBlocks[section.id]=id;
}
function moveBlock(section,index,amount) {
  const next=index+amount;
  if(props.disabled || next<0 || next>=section.blocks.length)return;
  [section.blocks[index],section.blocks[next]]=[section.blocks[next],section.blocks[index]];
}
function duplicateBlock(section,block,index) {
  if(props.disabled || section.blocks.length>=12)return;
  const copy=JSON.parse(JSON.stringify(block));copy.id=uniqueKey();copy.title=copy.title?`${copy.title} (copia)`.slice(0,240):'';
  section.blocks.splice(index+1,0,copy);expandedBlocks[section.id]=copy.id;
}
async function removeBlock(section,block) {
  if(props.disabled || !await confirmDialog({title:'Eliminar complemento',message:`Se quitará “${block.title || blockLabel(block.type)}” de esta sección.`,confirmText:'Eliminar complemento',danger:true}))return;
  const current=props.modelValue.find(item=>item.id===section.id);if(current)current.blocks=current.blocks.filter(item=>item.id!==block.id);
}
function fieldsForBlock(block) {
  const fields=[];
  if(block.type==='image')fields.push({key:'image',label:'Imagen',type:'image',help:'JPG, PNG o WebP, hasta 5 MiB.'});
  if(block.type==='benefit')fields.push({key:'icon',label:'Ícono',type:'select',options:[['star','Estrella'],['heart','Corazón'],['truck','Entrega'],['shield','Protección'],['store','Tienda'],['package','Paquete'],['check','Confirmación'],['gift','Regalo'],['mail','Correo']]});
  if(block.type==='button')fields.push({key:'buttonTarget',label:'Destino',type:'select',options:targetOptions});
  fields.push({key:'alignment',label:'Alineación del complemento',type:'select',options:[['inherit','Usar la de la sección'],...alignmentOptions]},{key:'textDirection',label:'Dirección del texto',type:'select',options:[['inherit','Usar la de la sección'],...directionOptions.filter(option=>option[0]!=='inherit')]});
  return fields;
}
function targetHelp(target) {
  if(target==='terms'&&!props.design?.terms.enabled)return 'La página de Términos está desactivada. El botón aparecerá cuando la actives.';
  if(target==='catalog'&&!props.design?.shop.showCatalog)return 'El catálogo está desactivado. El botón aparecerá cuando lo actives.';
  if(target==='contact'&&!props.design?.shop.showContact)return 'El contacto de la tienda está desactivado. El botón aparecerá cuando lo actives.';
  return '';
}
function requestUpload(target,field,file,scope) { emit('upload',{file,target,field:field.key,scope}); }
</script>
<template>
  <div class="ed-sections-editor">
    <div class="ed-intro"><strong>Armá una tienda a tu medida</strong><p>Agregá secciones, fotos, beneficios, preguntas o redes sociales. Acá definís su estructura y presentación; todos sus títulos, descripciones, preguntas, respuestas y botones se editan en Textos.</p><span class="ed-count">{{modelValue.length}} de 12 secciones</span></div>
    <div class="ed-section-presets" aria-label="Agregar una sección">
      <button v-for="type in visibleTypes()" :key="type.type" type="button" :disabled="disabled || modelValue.length >= 12" @click="add(type.type)"><Icon :name="type.icon" :size="19"/><span><strong>{{type.title}}</strong><small>{{type.description}}</small></span><Icon name="plus" :size="14"/></button>
    </div>
    <p v-if="modelValue.length >= 12" class="ed-notice">Llegaste al límite de 12 secciones. Eliminá una para agregar otra.</p>
    <p v-if="!modelValue.length" class="ed-notice">Tu catálogo sigue disponible. Elegí una sección para sumar contenido a la portada de tu tienda.</p>
    <p v-else class="ed-help ed-order-help">Las secciones se muestran en este orden dentro de su ubicación: antes o después del catálogo.</p>
    <article v-for="(item,index) in modelValue" :key="item.id" class="ed-section-item" :class="{ 'ed-item-hidden': !item.enabled }">
      <div class="ed-item-heading"><button type="button" class="ed-item-toggle" :aria-expanded="expanded===item.id" :aria-controls="'section-editor-'+item.id" @click="expanded=expanded===item.id?'':item.id"><span class="ed-item-number">{{index+1}}</span><span><strong>{{item.title || label(item.type)}}</strong><small>{{label(item.type)}} · {{item.placement==='beforeCatalog'?'Antes':'Después'}} del catálogo</small></span><Icon name="chevron-down" :size="15"/></button></div>
      <div class="ed-item-actions"><label><input v-model="item.enabled" type="checkbox" :disabled="disabled"/>{{item.enabled?'Visible':'Oculta'}}</label><div><button type="button" class="ed-icon-button" :disabled="disabled || index===0" :aria-label="'Subir '+(item.title||'sección')" @click="move(index,-1)"><Icon name="arrow-right" class="ed-arrow-up" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled || index===modelValue.length-1" :aria-label="'Bajar '+(item.title||'sección')" @click="move(index,1)"><Icon name="arrow-right" class="ed-arrow-down" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled || modelValue.length>=12" aria-label="Duplicar sección" @click="duplicate(item,index)"><Icon name="copy" :size="14"/></button><button type="button" class="ed-icon-button" :disabled="disabled" aria-label="Eliminar sección" @click="remove(item)"><Icon name="trash" :size="14"/></button></div></div>
      <div v-if="expanded===item.id" :id="'section-editor-'+item.id" class="ed-item-body">
        <p v-if="!item.enabled" class="ed-notice">Esta sección está oculta. Podés editarla y hacerla visible cuando esté lista.</p><p class="ed-help">El contenido escrito de esta sección se administra únicamente desde <strong>Textos → Secciones personalizadas</strong>.</p>
        <DesignField v-for="field in sectionFields" :key="field.key" v-model="item[field.key]" :field="field" :scope="'sections.'+item.id" :disabled="disabled" :reason="field.key==='buttonTarget'&&!item.buttonText?'Escribí el texto del botón para elegir un destino.':''" :busy="!!uploads['sections.'+item.id+'.'+field.key]" @upload="requestUpload(item,field,$event,'sections.'+item.id)"/>
        <p v-if="item.buttonText && targetHelp(item.buttonTarget)" class="ed-notice">{{targetHelp(item.buttonTarget)}}</p>
        <details class="ed-inner-details"><summary>Presentación y espaciado<Icon name="chevron-down" :size="14"/></summary><div><DesignField v-for="field in styleFields" :key="field.key" v-model="item[field.key]" :field="field" :scope="'sections.'+item.id" :disabled="disabled"/></div></details>
        <template v-if="item.type==='social'">
          <DesignField v-model="item.socialVariant" :field="{key:'socialVariant',label:'Presentación de redes',type:'variants',options:[['icons','Sólo iconos'],['labels','Icono y nombre'],['cards','Tarjetas']]}" :scope="'sections.'+item.id" :disabled="disabled||!props.allowSocial"/>
          <DesignField v-model="item.socialIconSize" :field="{key:'socialIconSize',label:'Tamaño de iconos',type:'range',min:16,max:64,unit:'px'}" :scope="'sections.'+item.id" :disabled="disabled||!props.allowSocial"/>
          <DesignField v-model="item.socialNewTab" :field="{key:'socialNewTab',label:'Abrir redes en otra pestaña',type:'toggle'}" :scope="'sections.'+item.id" :disabled="disabled||!props.allowSocial"/>
          <DesignSocialEditor :ref="editor=>rememberSocialEditor(item.id,editor)" v-model="item.socialLinks" :scope="'sections.'+item.id+'.socialLinks'" :disabled="disabled||!props.allowSocial"/>
        </template>
        <section class="ed-blocks"><div class="ed-blocks-title"><h3>Complementos</h3><span>{{item.blocks.length}} / 12</span></div>
          <p class="ed-help">Un nivel de contenido dentro de la sección. Usá los botones de orden para organizarlo; su contenido escrito se edita en Textos.</p>
          <article v-for="(block,blockIndex) in item.blocks" :key="block.id" class="ed-block-item" :class="{ 'ed-item-hidden':!block.enabled }">
            <button type="button" class="ed-block-toggle" :aria-expanded="expandedBlocks[item.id]===block.id" @click="expandedBlocks[item.id]=expandedBlocks[item.id]===block.id?'':block.id"><span><strong>{{block.title || blockLabel(block.type)}}</strong><small>{{blockLabel(block.type)}}</small></span><Icon name="chevron-down" :size="14"/></button>
            <div class="ed-item-actions"><label><input v-model="block.enabled" type="checkbox" :disabled="disabled"/>{{block.enabled?'Visible':'Oculto'}}</label><div><button type="button" class="ed-icon-button" :disabled="disabled || blockIndex===0" aria-label="Subir complemento" @click="moveBlock(item,blockIndex,-1)"><Icon name="arrow-right" class="ed-arrow-up" :size="13"/></button><button type="button" class="ed-icon-button" :disabled="disabled || blockIndex===item.blocks.length-1" aria-label="Bajar complemento" @click="moveBlock(item,blockIndex,1)"><Icon name="arrow-right" class="ed-arrow-down" :size="13"/></button><button type="button" class="ed-icon-button" :disabled="disabled || item.blocks.length>=12" aria-label="Duplicar complemento" @click="duplicateBlock(item,block,blockIndex)"><Icon name="copy" :size="13"/></button><button type="button" class="ed-icon-button" :disabled="disabled" aria-label="Eliminar complemento" @click="removeBlock(item,block)"><Icon name="trash" :size="13"/></button></div></div>
            <div v-if="expandedBlocks[item.id]===block.id" class="ed-block-body"><DesignField v-for="field in fieldsForBlock(block)" :key="field.key" v-model="block[field.key]" :field="field" :scope="'blocks.'+block.id" :disabled="disabled" :busy="!!uploads['blocks.'+block.id+'.'+field.key]" @upload="requestUpload(block,field,$event,'blocks.'+block.id)"/><p v-if="block.type==='button' && targetHelp(block.buttonTarget)" class="ed-notice">{{targetHelp(block.buttonTarget)}}</p></div>
          </article>
          <div class="ed-add-block"><label :for="'block-kind-'+item.id">Tipo de complemento</label><select :id="'block-kind-'+item.id" v-model="newBlockTypes[item.id]" :disabled="disabled || item.blocks.length>=12"><option :value="undefined">Texto</option><option v-for="option in blockTypes.filter(option=>option[0]!=='text')" :key="option[0]" :value="option[0]">{{option[1]}}</option></select><button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || item.blocks.length>=12" @click="addBlock(item)"><Icon name="plus" :size="14"/>Agregar complemento</button></div>
          <p v-if="item.blocks.length>=12" class="ed-notice">Esta sección tiene el máximo de 12 complementos.</p>
        </section>
      </div>
    </article>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useStorefront } from '../../services/storefront.js';
import { StoreCopy } from '../../services/storeCopy.js';
import { StoreTextLayout } from '../../services/storeNavigation.js';
import { sectionSpacing } from '../../services/design.js';
import Icon from '../../components/Icon.vue';
const sf=useStorefront();
const copy=new StoreCopy(()=>sf.design.value);
const settings=computed(()=>sf.design.value.terms);
const visible=computed(()=>settings.value.enabled||sf.isPreview.value);
const paragraphs=computed(()=>String(settings.value.content||'').split(/\n\s*\n/).map(text=>text.trim()).filter(Boolean));
const updatedDate=computed(()=>{if(!settings.value.updatedAt)return'';const date=new Date(settings.value.updatedAt+'T12:00:00');return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('es-AR',{dateStyle:'long'}).format(date);});
watch(()=>[settings.value.title,visible.value,sf.store.value?.name],()=>{document.title=(visible.value?settings.value.title:'Página no disponible')+' · '+sf.store.value.name;},{immediate:true});
</script>
<template>
  <section class="store-section store-terms-page" :style="{...sectionSpacing(settings),...StoreTextLayout.style(settings.textAlign)}" :dir="StoreTextLayout.direction(settings.textDirection)">
    <div v-if="!visible" class="store-empty"><Icon name="receipt" :size="38"/><h1>Esta página no está disponible.</h1><p>Podés volver al catálogo o comunicarte con la tienda.</p><RouterLink :to="sf.link()" class="store-button secondary">{{copy.text('backToStore')}}</RouterLink></div>
    <template v-else>
      <div v-if="sf.isPreview.value&&!settings.enabled" class="notice info terms-draft-notice"><Icon name="eye" :size="18"/><span>Vista previa de términos. Esta página no será pública hasta que la actives y guardes el diseño.</span></div>
      <div class="terms-content" :class="'terms-width-'+settings.contentWidth"><RouterLink :to="sf.link()" class="store-back"><Icon name="arrow-left" :size="16"/>{{copy.text('backToStore')}}</RouterLink><header><span class="store-eyebrow">{{copy.text('termsEyebrow',{storeName:sf.store.value.name})}}</span><h1>{{settings.title}}</h1><p v-if="settings.intro" class="terms-intro">{{settings.intro}}</p><p v-if="settings.showUpdatedAt&&updatedDate" class="terms-updated">{{copy.text('termsUpdated')}}: {{updatedDate}}</p></header><div v-if="paragraphs.length" class="terms-copy"><p v-for="(paragraph,index) in paragraphs" :key="index">{{paragraph}}</p></div><div v-else-if="sf.isPreview.value" class="terms-placeholder"><Icon name="edit" :size="25"/><p>Escribí los términos y condiciones en los controles del editor. Los párrafos aparecerán acá.</p></div></div>
    </template>
  </section>
</template>
<style scoped>
.store-terms-page{min-height:60vh}.terms-content{margin-inline:auto;width:100%}.terms-width-narrow{max-width:720px}.terms-width-normal{max-width:920px}.terms-width-wide{max-width:1160px}.terms-content header{padding:8px 0 28px;border-bottom:1px solid var(--store-line);margin-bottom:32px}.terms-content h1{font-size:clamp(2rem,4vw,3.25rem);letter-spacing:-.045em;font-weight:550;line-height:1.2;margin:15px 0 22px;overflow-wrap:anywhere}.terms-intro{font-size:1rem;line-height:1.8;color:var(--store-muted);white-space:pre-line;overflow-wrap:anywhere;margin:0 0 22px}.terms-updated{font-size:.73rem;color:var(--store-muted);margin:0}.terms-copy p{white-space:pre-line;overflow-wrap:anywhere;font-size:.91rem;line-height:1.95;margin:0 0 25px}.terms-draft-notice{display:flex;gap:10px;align-items:flex-start;margin-bottom:28px}.terms-draft-notice svg{flex:none}.terms-placeholder{padding:35px 25px;border:1px dashed var(--store-line);border-radius:var(--store-radius);text-align:center;color:var(--store-muted)}.terms-placeholder p{max-width:460px;margin:15px auto 0;font-size:.85rem;line-height:1.7}@media(max-width:500px){.terms-copy p{font-size:.85rem}.terms-intro{font-size:.89rem}.terms-content header{padding-bottom:22px;margin-bottom:25px}}
</style>

<script setup>
import { computed } from 'vue';
import { StoreTextLayout } from '../services/storeNavigation.js';
import { useStorefront } from '../services/storefront.js';
import StoreActionLink from './StoreActionLink.vue';
import Icon from './Icon.vue';
const props=defineProps({ block: { type: Object, required: true } });
const sf = useStorefront();
const style=computed(()=>({...StoreTextLayout.style(props.block.alignment),...(props.block.alignment!=='inherit'?{alignItems:props.block.alignment==='left'?'flex-start':props.block.alignment==='right'?'flex-end':'center',justifyContent:props.block.alignment==='left'?'flex-start':props.block.alignment==='right'?'flex-end':'center'}:{})}));
</script>

<template>
  <details v-if="block.type === 'faq'" class="custom-faq" :style="style" :dir="StoreTextLayout.direction(block.textDirection)"><summary>{{block.title || 'Más información'}}<Icon name="plus" :size="17"/></summary><div class="custom-faq-answer"><p v-if="block.text">{{block.text}}</p></div></details>
  <figure v-else-if="block.type === 'image'" class="custom-image-block" :style="style" :dir="StoreTextLayout.direction(block.textDirection)"><img v-if="block.image" :src="block.image" :alt="block.title || ''" loading="lazy"/><div v-else-if="sf.isPreview.value" class="custom-block-placeholder"><Icon name="image" :size="30"/><span>Agregá una imagen</span></div><figcaption v-if="block.title || block.text"><strong v-if="block.title">{{block.title}}</strong><p v-if="block.text">{{block.text}}</p></figcaption></figure>
  <div v-else-if="block.type === 'button'" class="custom-button-block" :style="style" :dir="StoreTextLayout.direction(block.textDirection)"><StoreActionLink :target="block.buttonTarget" :label="block.buttonText"/></div>
  <div v-else class="custom-copy-block" :style="style" :dir="StoreTextLayout.direction(block.textDirection)" :class="{'custom-benefit':block.type === 'benefit'}">
    <span v-if="block.type === 'benefit'" class="custom-benefit-icon"><svg v-if="block.icon === 'gift'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13M12 8C3 8 6 0 10 4l2 4Zm0 0c9 0 6-8 2-4l-2 4Z"/></svg><Icon v-else :name="block.icon || 'star'" :size="24"/></span>
    <div><h3 v-if="block.title">{{block.title}}</h3><p v-if="block.text">{{block.text}}</p></div>
  </div>
</template>

<style scoped>
.custom-copy-block{min-width:0}.custom-copy-block h3,.custom-image-block strong{font-size:1rem;font-weight:600;letter-spacing:-.02em;margin:0 0 10px;color:inherit;overflow-wrap:anywhere}.custom-copy-block p,.custom-image-block p,.custom-faq-answer p{font-size:.83rem;line-height:1.8;white-space:pre-line;overflow-wrap:anywhere;color:inherit;opacity:.78;margin:0}.custom-benefit{display:flex;flex-direction:column;align-items:inherit;gap:19px}.custom-benefit-icon{display:inline-flex;align-items:center;justify-content:center;width:45px;height:45px;border-radius:calc(var(--store-radius)*.7);border:1px solid currentColor;color:inherit;opacity:.9;flex:none}.custom-image-block{margin:0;min-width:0}.custom-image-block>img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--store-radius)}.custom-image-block figcaption{padding-top:15px}.custom-image-block strong{display:block}.custom-block-placeholder{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;min-height:180px;aspect-ratio:1;background:var(--store-surface-alt);border:1px dashed var(--store-line);color:var(--store-muted);border-radius:var(--store-radius);font-size:.74rem}.custom-button-block{display:flex;justify-content:inherit;align-items:center;min-width:0}.custom-button-block :deep(.store-button){max-width:100%;overflow-wrap:anywhere}.custom-faq{border-top:1px solid currentColor;padding:0;min-width:0}.custom-faq summary{display:flex;align-items:center;justify-content:space-between;gap:15px;list-style:none;padding:22px 0;cursor:pointer;font-size:.91rem;font-weight:550;overflow-wrap:anywhere}.custom-faq summary::-webkit-details-marker{display:none}.custom-faq summary svg{flex:none;transition:transform .2s}.custom-faq[open] summary svg{transform:rotate(45deg)}.custom-faq-answer{padding:0 0 23px}.custom-faq summary:focus-visible{outline:2px solid currentColor;outline-offset:4px}@media(prefers-reduced-motion:reduce){.custom-faq summary svg{transition:none}}
</style>

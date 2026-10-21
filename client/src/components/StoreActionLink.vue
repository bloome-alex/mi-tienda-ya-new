<script setup>
import { computed } from 'vue';
import { useStorefront } from '../services/storefront.js';
defineOptions({ inheritAttrs: false });
const props = defineProps({ target: { type: String, default: 'catalog' }, label: { type: String, default: '' } });
const sf = useStorefront();
const destination = computed(() => {
  const design = sf.design.value, store = sf.store.value, base = sf.link();
  if (props.target === 'catalog') {
    if (design.shop.showCatalog) return { ...base, hash: '#catalogo' };
    if (design.shop.showFeatured && (sf.featuredProducts?.value || sf.products.value).some(product => product.featured && product.active)) return { ...base, hash: '#destacados' };
  }
  if (props.target === 'contact' && design.shop.showContact && (store?.contact?.email || store?.contact?.phone || store?.contact?.showContactForm)) return { ...base, hash: '#store-contact' };
  if (props.target === 'terms' && (design.terms.enabled || sf.isPreview.value)) return sf.link('/terminos');
  return null;
});
const unavailable = computed(() => `Activá ${props.target === 'contact' ? 'la sección de contacto' : props.target === 'terms' ? 'los términos y condiciones' : 'el catálogo o productos destacados'} para mostrar este botón en la tienda.`);
</script>

<template>
  <RouterLink v-if="label && destination" :to="destination" class="store-button" v-bind="$attrs"><slot>{{label}}</slot></RouterLink>
  <span v-else-if="label && sf.isPreview.value" class="store-disabled-action" :title="unavailable" v-bind="$attrs"><span>{{label}}</span><small>{{unavailable}}</small></span>
</template>

<style scoped>
.store-disabled-action{display:inline-flex;flex-direction:column;align-items:flex-start;gap:5px;padding:11px 14px;border:1px dashed currentColor;border-radius:calc(var(--store-radius)*.55);font-size:.8rem;opacity:.75;max-width:100%;text-align:left}.store-disabled-action small{font-size:.66rem;line-height:1.5;max-width:280px;font-weight:400}
</style>

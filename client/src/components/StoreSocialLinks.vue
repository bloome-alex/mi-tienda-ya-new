<script setup>
import { computed } from 'vue';
import { socialNetworks } from '../services/design.js';
import { StoreNavigationService } from '../services/storeNavigation.js';
import { useStorefront } from '../services/storefront.js';
import StoreSocialIcon from './StoreSocialIcon.vue';
import Icon from './Icon.vue';
const props=defineProps({section:{type:Object,required:true}}),sf=useStorefront();
const links=computed(()=>StoreNavigationService.socialLinks(props.section));
const label=link=>link.label||socialNetworks.find(network=>network.value===link.network)?.label||'Sitio web';
const style=computed(()=>({'--social-icon-size':props.section.socialIconSize+'px',justifyContent:props.section.alignment==='center'?'center':props.section.alignment==='right'?'flex-end':'flex-start'}));
</script>
<template>
 <nav v-if="links.length" class="store-social-links" :class="'social-variant-'+section.socialVariant" :style="style" :aria-label="section.title||'Redes sociales de la tienda'"><a v-for="link in links" :key="link.id" :href="link.url" :target="section.socialNewTab?'_blank':undefined" :rel="section.socialNewTab?'noopener noreferrer':undefined" :aria-label="label(link)+(section.socialNewTab?' (se abre en otra pestaña)':'')" :title="label(link)"><span class="social-network-icon"><StoreSocialIcon :network="link.network" :size="section.socialIconSize"/></span><span v-if="section.socialVariant!=='icons'" class="social-network-label">{{label(link)}}</span><Icon v-if="section.socialVariant==='cards'" name="external" :size="15" class="social-network-external"/></a></nav>
 <p v-else-if="sf.isPreview.value" class="social-preview-empty">Agregá enlaces y activá las redes que querés mostrar en esta sección.</p>
</template>
<style scoped>
.store-social-links{position:relative;z-index:1;display:flex;align-items:stretch;flex-wrap:wrap;gap:14px;margin-top:28px;min-width:0}.store-social-links>a{min-width:0;max-width:100%;display:inline-flex;align-items:center;justify-content:center;gap:12px;text-decoration:none;color:inherit;background:transparent;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 20%,transparent);border-radius:var(--store-radius,10px);padding:13px 18px;transition:background .18s,transform .18s,box-shadow .18s}.store-social-links>a:hover{background:color-mix(in srgb,currentColor 7%,transparent);transform:translateY(-2px);box-shadow:0 7px 18px #0000000b}.store-social-links>a:focus-visible{outline:2px solid currentColor;outline-offset:4px}.social-network-icon{display:grid;place-items:center;flex:none}.social-network-label{font-size:.83rem;font-weight:550;overflow-wrap:anywhere;min-width:0}.social-network-external{opacity:.6;flex:none;margin-inline-start:auto}.social-variant-icons>a{width:calc(var(--social-icon-size) + 32px);height:calc(var(--social-icon-size) + 32px);padding:0;border-radius:50%;flex:none}.social-variant-cards>a{justify-content:flex-start;flex:0 1 235px;padding:21px;gap:16px}.social-preview-empty{font-size:.8rem;padding:20px;border:1px dashed currentColor;border-radius:var(--store-radius);opacity:.7;margin:25px 0 0}@media(max-width:600px){.store-social-links{gap:10px;margin-top:22px}.social-variant-labels>a{padding:12px 14px}.social-variant-cards>a{flex:1 1 100%;padding:17px}.social-network-label{font-size:.8rem}}@media(prefers-reduced-motion:reduce){.store-social-links>a{transition:none}.store-social-links>a:hover{transform:none}}
</style>

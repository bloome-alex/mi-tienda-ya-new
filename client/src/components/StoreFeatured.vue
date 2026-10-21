<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStorefront } from '../services/storefront.js';
import { StoreCopy } from '../services/storeCopy.js';
import { StoreTextLayout } from '../services/storeNavigation.js';
import { sectionSpacing } from '../services/design.js';
import { useStorePlayback } from '../services/storePlayback.js';
import ProductCard from './ProductCard.vue';
import Icon from './Icon.vue';
const props = defineProps({ products: { type: Array, default: () => [] } });
const emit = defineEmits(['catalog']);
const sf = useStorefront(), viewport = ref(null), track = ref(null), index = ref(0), step = ref(0), visibleCards = ref(1);
const copy=new StoreCopy(()=>sf.design.value);
const settings = computed(() => sf.design.value.shop);
const rail = computed(() => settings.value.featuredLayout === 'rail');
const maxIndex = computed(() => Math.max(0, props.products.length - visibleCards.value));
const canMove = computed(() => maxIndex.value > 0);
const atAutoplayEnd = computed(() => canMove.value && !settings.value.featuredLoop && index.value === maxIndex.value);
const spacing = computed(() => ({ ...sectionSpacing({ paddingX: settings.value.featuredPaddingX, paddingY: settings.value.featuredPaddingY, fullWidth: settings.value.featuredFullWidth }), '--rail-requested': settings.value.columns, '--rail-speed': `${settings.value.featuredSpeed}ms` }));
function move(direction, manual = true) {
  if (manual) playback.pause();
  if (!maxIndex.value) return;
  let target = index.value + direction;
  if (settings.value.featuredLoop) target = target > maxIndex.value ? 0 : target < 0 ? maxIndex.value : target;
  index.value = Math.max(0, Math.min(maxIndex.value, target));
}
const playback = useStorePlayback({ enabled: () => settings.value.showFeatured && rail.value && settings.value.featuredAutoplay && canMove.value && (settings.value.featuredLoop || index.value < maxIndex.value), interval: () => settings.value.featuredInterval, pauseOnHover: () => settings.value.featuredPauseOnHover, advance: () => move(1, false) });
function togglePlayback() { if (atAutoplayEnd.value) { index.value = 0; playback.manuallyPaused.value = false; } else playback.toggle(); }
async function measure() {
  await nextTick();
  const first = track.value?.firstElementChild;
  if (!viewport.value || !first) return;
  const width = first.getBoundingClientRect().width;
  const viewportStyle = getComputedStyle(viewport.value);
  const contentWidth = viewport.value.clientWidth - (parseFloat(viewportStyle.paddingLeft) || 0) - (parseFloat(viewportStyle.paddingRight) || 0);
  const gap = parseFloat(getComputedStyle(track.value).columnGap) || 0;
  step.value = width + gap;
  visibleCards.value = Math.max(1, Math.round((contentWidth + gap) / (width + gap)));
  index.value = Math.min(index.value, maxIndex.value);
}
let observer;
function observe() {
  observer?.disconnect();
  if (viewport.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure);
    observer.observe(viewport.value);
  }
  measure();
}
watch(() => [settings.value.showFeatured, rail.value, settings.value.columns, props.products.map(product => product._id).join(',')], async () => { index.value = 0; await nextTick(); observe(); });
onMounted(observe);
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <section v-if="settings.showFeatured && products.length" id="destacados" class="store-section store-featured-section" :class="'featured-align-'+settings.featuredAlign" :style="{...spacing,...StoreTextLayout.style(settings.featuredAlign)}" :dir="StoreTextLayout.direction(settings.featuredDirection)" aria-labelledby="featured-heading" @pointerenter="playback.pointerEnter" @pointerleave="playback.pointerLeave" @focusin="playback.focusIn" @focusout="playback.focusOut">
    <div class="store-section-heading"><div><span v-if="copy.text('featuredEyebrow')" class="store-eyebrow">{{copy.text('featuredEyebrow')}}</span><h2 id="featured-heading">{{settings.featuredTitle}}</h2><p v-if="copy.text('featuredDescription')" class="featured-description">{{copy.text('featuredDescription')}}</p></div><a v-if="settings.showCatalog" href="#catalogo" class="featured-catalog-link" @click="emit('catalog')">{{copy.text('featuredCatalogLink')}} <Icon name="arrow-right" :size="16"/></a></div>
    <div v-if="!rail" class="store-product-grid"><ProductCard v-for="product in products" :key="product._id" :product="product"/></div>
    <div v-else class="store-featured-rail" role="region" aria-roledescription="carrusel" :aria-label="settings.featuredTitle">
      <div ref="viewport" class="featured-viewport"><div ref="track" class="featured-track" :class="{'rail-reduced':playback.reducedMotion.value}" :style="{transform:`translate3d(${-index * step}px,0,0)`}"><div v-for="(product,productIndex) in products" :key="product._id" class="featured-slide" :dir="StoreTextLayout.direction(settings.featuredDirection==='inherit'?sf.design.value.brand.textDirection:settings.featuredDirection)" role="group" aria-roledescription="producto" :aria-label="`${productIndex + 1} de ${products.length}`" :inert="productIndex < index || productIndex >= index + visibleCards"><ProductCard :product="product"/></div></div></div>
      <div v-if="canMove" class="featured-rail-controls">
        <span class="rail-position" :aria-live="playback.playing.value ? 'off' : 'polite'">{{index + 1}}–{{Math.min(products.length,index + visibleCards)}} <span>de {{products.length}}</span></span>
        <button v-if="settings.featuredAutoplay" type="button" class="rail-playback" :disabled="playback.reducedMotion.value" :aria-pressed="playback.manuallyPaused.value" :title="playback.reducedMotion.value ? 'Reproducción automática desactivada por movimiento reducido' : undefined" @click="togglePlayback"><svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path v-if="playback.manuallyPaused.value || atAutoplayEnd" d="M6 3v14l11-7Z"/><path v-else d="M5 3h3v14H5zm7 0h3v14h-3z"/></svg>{{playback.reducedMotion.value ? 'Movimiento reducido' : atAutoplayEnd ? 'Repetir' : copy.text(playback.manuallyPaused.value?'resume':'pause')}}</button>
        <div class="rail-arrows"><button type="button" :disabled="!settings.featuredLoop && index === 0" aria-label="Productos destacados anteriores" @click="move(-1)"><Icon name="arrow-left" :size="18"/></button><button type="button" :disabled="!settings.featuredLoop && index === maxIndex" aria-label="Productos destacados siguientes" @click="move(1)"><Icon name="arrow-right" :size="18"/></button></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.store-featured-section{min-width:0;scroll-margin-top:calc(var(--store-header-offset,82px) + 20px)}.featured-align-center .store-section-heading{flex-direction:column;align-items:center;gap:14px}.featured-align-right .store-section-heading{flex-direction:row-reverse}.featured-description{white-space:pre-line;overflow-wrap:anywhere;font-size:.87rem;line-height:1.75;color:var(--store-muted);margin:15px 0 0;max-width:750px}.featured-align-center .featured-description{margin-inline:auto}.featured-rail-controls{direction:ltr}.featured-catalog-link{display:inline-flex;align-items:center;gap:9px;white-space:nowrap;font-size:.78rem;color:var(--store-primary);padding:9px 0}.store-featured-rail{--rail-visible:var(--rail-requested);--rail-gap:24px}.featured-viewport{overflow:hidden;width:100%;box-sizing:border-box;padding:24px min(20px,var(--rail-gap)) 32px;background:transparent;border:0;border-radius:0}.featured-track{direction:ltr}.featured-track{display:flex;align-items:stretch;gap:var(--rail-gap);transition:transform var(--rail-speed) ease;will-change:transform}.featured-slide{flex:0 0 calc((100% - (var(--rail-visible) - 1)*var(--rail-gap))/var(--rail-visible));min-width:0}.featured-slide :deep(.store-product-card){height:100%}.featured-track.rail-reduced{transition:none}.featured-rail-controls{display:flex;align-items:center;gap:15px;margin-top:4px;padding-top:12px;border-top:0}.rail-position{font-size:.75rem;font-variant-numeric:tabular-nums;color:var(--store-text)}.rail-position>span{color:var(--store-muted);margin-left:3px}.rail-playback{display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border:0;background:transparent;color:var(--store-muted);font-size:.68rem}.rail-playback:disabled{opacity:.6;cursor:default}.rail-arrows{display:flex;gap:8px;margin-left:auto}.rail-arrows>button{width:37px;height:37px;border:1px solid var(--store-line);border-radius:50%;color:var(--store-text);background:var(--store-surface);display:grid;place-items:center}.rail-arrows>button:hover:not(:disabled){background:var(--store-surface-alt)}.rail-arrows>button:disabled{opacity:.35;cursor:default}@media(max-width:1100px){.store-featured-rail{--rail-visible:min(var(--rail-requested),3);--rail-gap:20px}}@media(max-width:700px){.store-featured-rail{--rail-visible:min(var(--rail-requested),2);--rail-gap:14px}.store-featured-section .store-section-heading{align-items:flex-start;flex-direction:column;gap:8px}.featured-rail-controls{gap:9px}.rail-playback{font-size:.62rem;padding:5px}}@media(prefers-reduced-motion:reduce){.featured-track{transition:none;will-change:auto}}
</style>

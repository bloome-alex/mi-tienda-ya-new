<script setup>
import { computed, ref, watch } from 'vue';
import { useStorefront } from '../services/storefront.js';
import { StoreCopy } from '../services/storeCopy.js';
import { StoreTextLayout } from '../services/storeNavigation.js';
import { money } from '../services/format.js';
import { notify } from '../services/notifications.js';
import ProductImage from './ProductImage.vue';
import Icon from './Icon.vue';
const props=defineProps({product:{type:Object,required:true}});
const sf=useStorefront(),swapLoaded=ref(false),swapFailed=ref(false);
const copy=new StoreCopy(()=>sf.design.value);
const settings=computed(()=>sf.design.value.shop);
const available=computed(()=>props.product.type==='digital'||props.product.madeToOrder||(props.product.variants?.length?props.product.variants.some(v=>v.stock>0):props.product.stock>0));
const canSwap=computed(()=>settings.value.productHoverSwap&&props.product.images?.length>1&&!swapFailed.value);
watch(()=>props.product.images?.[1],()=>{swapLoaded.value=false;swapFailed.value=false;});
function add(){try{sf.cart.value.add(props.product,null,1);notify.success('Producto agregado al carrito.');}catch(e){notify.error(e.message);}}
</script>
<template>
  <article class="store-product-card" :class="['card-variant-'+settings.cardVariant,'card-effect-'+settings.productHoverEffect,{'card-has-swap':canSwap&&swapLoaded}]" :style="StoreTextLayout.style(settings.cardAlign)" :dir="StoreTextLayout.direction(settings.cardDirection)">
    <RouterLink class="product-card-image" :class="'ratio-'+settings.imageRatio" :to="sf.link('/producto/'+product._id)">
      <span class="product-primary-image"><ProductImage :src="product.images?.[0]" :name="product.name" :type="product.type"/></span>
      <span v-if="canSwap" class="product-secondary-image" aria-hidden="true"><img :src="product.images[1]" alt="" loading="lazy" @load="swapLoaded=true" @error="swapFailed=true"/></span>
      <span v-if="!available" class="product-tag out">{{copy.text('soldOut')}}</span><span v-else-if="product.type==='digital'" class="product-tag">{{copy.text('digitalBadge')}}</span><span v-else-if="product.madeToOrder" class="product-tag">{{copy.text('madeToOrderBadge')}}</span><span v-else-if="product.previousPrice>product.price" class="product-tag sale">{{copy.text('discountBadge',{count:Math.round((1-product.price/product.previousPrice)*100)})}}</span>
    </RouterLink>
    <div class="product-card-info">
      <span v-if="product.featured" class="product-featured-chip"><Icon name="star" :size="12"/>{{copy.text('featuredBadge')}}</span>
      <RouterLink :to="sf.link('/producto/'+product._id)"><h3>{{product.name}}</h3></RouterLink>
      <p v-if="settings.showDescription&&product.description" class="product-short-description">{{product.description}}</p>
      <div class="product-price-line" :style="{justifyContent:settings.cardAlign==='center'?'center':settings.cardAlign==='right'?'flex-end':'flex-start'}"><span class="product-price">{{money(product.price)}}</span><span v-if="settings.showPreviousPrice&&product.previousPrice>product.price" class="product-old-price">{{money(product.previousPrice)}}</span></div>
      <span v-if="settings.showStock&&product.type!=='digital'&&!product.madeToOrder" class="store-muted product-stock">{{copy.text('stockAvailable',{count:product.variants?.length?product.variants.reduce((s,v)=>s+v.stock,0):product.stock})}}</span>
      <template v-if="settings.cardShowButton"><RouterLink v-if="product.variants?.length" :to="sf.link('/producto/'+product._id)" class="store-add-btn" :aria-label="copy.text('chooseOptions')||'Elegir opciones'">{{copy.text('chooseOptions')}} <Icon name="plus" :size="16"/></RouterLink><button v-else type="button" class="store-add-btn" :disabled="!available" :aria-label="copy.text(available?'add':'soldOut')||'Agregar producto'" @click="add">{{copy.text(available?'add':'soldOut')}} <Icon name="plus" :size="16"/></button></template>
    </div>
  </article>
</template>
<style scoped>
.store-product-card{position:relative;transition:transform .24s,box-shadow .24s;display:flex;flex-direction:column}.product-card-image{flex:none}.product-primary-image,.product-secondary-image{position:absolute;inset:0;display:block;width:100%;height:100%;transition:opacity .3s,transform .4s}.product-secondary-image{opacity:0;pointer-events:none}.product-secondary-image img{width:100%;height:100%;object-fit:cover}.product-card-info{flex:1;min-width:0}.product-card-info h3{overflow-wrap:anywhere}.product-featured-chip{display:inline-flex;align-items:center;gap:5px;margin-bottom:9px;padding:4px 8px;border-radius:20px;border:1px solid var(--store-line);color:var(--store-primary);background:var(--store-surface-alt);font-size:.62rem;font-weight:650;line-height:1.4}.product-featured-chip :deep(svg){fill:color-mix(in srgb,currentColor 13%,transparent)}.card-variant-bordered{border:1px solid var(--store-line);border-radius:var(--store-radius);background:var(--store-surface);overflow:hidden}.card-variant-bordered .product-card-image{border-radius:0}.card-variant-bordered .product-card-info{padding:18px}.card-variant-elevated{border-radius:var(--store-radius);background:var(--store-surface);box-shadow:0 5px 24px #00000012;overflow:hidden}.card-variant-elevated .product-card-image{border-radius:0}.card-variant-elevated .product-card-info{padding:19px}.card-variant-overlay{overflow:hidden;border-radius:var(--store-radius);background:#202024;min-height:340px}.card-variant-overlay .product-card-image{min-height:340px;height:100%;flex:1;border-radius:0}.card-variant-overlay .product-card-info{position:absolute;left:0;right:0;bottom:0;padding:70px 20px 20px;background:linear-gradient(transparent,#000000d9);color:#fff;pointer-events:none}.card-variant-overlay .product-card-info>a,.card-variant-overlay .product-card-info>button{pointer-events:auto}.card-variant-overlay .product-card-info h3,.card-variant-overlay .product-price{color:#fff}.card-variant-overlay .product-old-price,.card-variant-overlay .product-short-description,.card-variant-overlay .product-stock{color:#ffffffbf}.card-variant-overlay .store-add-btn{color:#fff;border-color:#ffffff55}.card-variant-overlay .store-add-btn:disabled{color:#ffffff85}.card-variant-overlay .product-featured-chip{color:#fff;border-color:#ffffff50;background:#00000025}.card-variant-overlay .product-tag{z-index:1}@media(hover:hover) and (pointer:fine){.card-has-swap:hover .product-secondary-image{opacity:1}.card-has-swap:hover .product-primary-image{opacity:0}.card-effect-lift:hover{transform:translateY(-5px)}.card-effect-zoom:hover .product-primary-image,.card-effect-zoom:hover .product-secondary-image{transform:scale(1.04)}}@media(max-width:500px){.card-variant-bordered .product-card-info,.card-variant-elevated .product-card-info{padding:12px}.card-variant-overlay,.card-variant-overlay .product-card-image{min-height:290px}.card-variant-overlay .product-card-info{padding:65px 12px 14px}.card-variant-overlay .product-short-description{-webkit-line-clamp:2}.product-featured-chip{font-size:.55rem;padding:3px 6px}}@media(prefers-reduced-motion:reduce){.store-product-card,.product-primary-image,.product-secondary-image{transition:none}.card-effect-lift:hover,.card-effect-zoom:hover .product-primary-image,.card-effect-zoom:hover .product-secondary-image{transform:none}}
</style>

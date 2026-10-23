<script setup>
import { computed, ref, reactive, provide, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../services/api.js';
import { normalizeDesign, designStyle, sectionSpacing } from '../services/design.js';
import { cartFor } from '../services/cart.js';
import { storefrontKey } from '../services/storefront.js';
import { storefrontSlug, storefrontPath, platformUrl } from '../services/storeHost.js';
import { useStoreBranding } from '../services/storeBranding.js';
import { PREVIEW_MESSAGE, isTrustedPreviewMessage, previewSectionPath, readPreviewLocation } from '../services/previewProtocol.js';
import { whatsappUrl } from '../services/format.js';
import { notify } from '../services/notifications.js';
import Icon from '../components/Icon.vue';
import StoreNavbar from '../components/StoreNavbar.vue';
import { StoreCopy } from '../services/storeCopy.js';
import { StoreNavigationService, StoreTextLayout } from '../services/storeNavigation.js';
import StoreWhatsapp from '../components/StoreWhatsapp.vue';
import { StoreThemeService, browserStoreThemeEnvironment } from '../services/storeTheme.js';
import '../styles/store-customization.css';
const route=useRoute(),router=useRouter(),loading=ref(true),error=ref(''),store=ref(null),products=ref([]),featuredProducts=ref([]),categories=ref([]),allCategories=ref([]),catalogMeta=ref({}),menu=ref(false);
const currentSlug=computed(()=>storefrontSlug(route));
const isPreview=computed(()=>typeof route.query.preview==='string'&&/^[a-f\d]{24}$/i.test(route.query.preview));
const design=computed(()=>normalizeDesign(store.value?.design));
const navbarHeight=ref(82),copy=new StoreCopy(()=>design.value);
const storeTheme=new StoreThemeService(browserStoreThemeEnvironment()),appearance=storeTheme.state;
const colorMode=computed(()=>storeTheme.resolved(design.value));
useStoreBranding(design,{appearance:()=>appearance.deviceAppearance,preference:()=>appearance.preference});
watch([()=>store.value?._id||store.value?.slug,()=>isPreview.value],([identifier,preview])=>storeTheme.useStore(identifier,{preview}),{immediate:true});
const storefrontStyle=computed(()=>{
 const style={...designStyle(design.value,appearance.deviceAppearance,appearance.preference),'--store-header-offset':navbarHeight.value+'px','--store-mobile-cols':design.value.shop.catalogMobileColumns},wallpaper=design.value.wallpaper;
 if(!wallpaper.enabled)return style;
 const image=value=>value?`url(${JSON.stringify(value)})`:'none';
 return {...style,'--wallpaper-desktop':image(wallpaper.mode==='shared'?wallpaper.sharedImage:wallpaper.desktopImage),'--wallpaper-mobile':image(wallpaper.mode==='shared'?wallpaper.sharedImage:wallpaper.mobileImage),'--wallpaper-position':wallpaper.position,'--wallpaper-fit':wallpaper.fit,'--wallpaper-attachment':wallpaper.attachment,'--wallpaper-overlay':`${colorMode.value==='dark'?wallpaper.darkOverlay:wallpaper.overlay}%`};
});
const footerSpacing=computed(()=>sectionSpacing({paddingX:design.value.shop.footerPaddingX,paddingY:design.value.shop.footerPaddingY,fullWidth:true}));
const contactVisible=computed(()=>design.value.shop.showContact&&!!(store.value?.contact?.email||store.value?.contact?.phone||store.value?.contact?.showContactForm));
const cart=computed(()=>cartFor(currentSlug.value+(isPreview.value?':preview':'')));
const contactForm=reactive({name:'',email:'',message:'',website:''});
const contactBusy=ref(false),contactSent=ref(false);
let previewSeeded=false,requestId=0,previewNavigationSequence=0,activeNavigation=null;
function reportPreviewLocation(type=PREVIEW_MESSAGE.location,navigationId){
 if(!isPreview.value||!store.value||store.value._id!==route.query.preview||store.value.slug!==currentSlug.value||window.parent===window)return;
 const page=readPreviewLocation(route.path,store.value.slug);
 if(!page)return;
 const acknowledgement=navigationId||(activeNavigation?.path===page.path?activeNavigation.navigationId:null);
 window.parent.postMessage({type,storeId:route.query.preview,...page,...(acknowledgement?{navigationId:acknowledgement}:{})},location.origin);
}
function link(suffix=''){return {path:storefrontPath(route,suffix),query:isPreview.value?{preview:route.query.preview}:{}};}
function applyPwaMetadata(){if(isPreview.value||!store.value)return;const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.setAttribute('href',`/api/public/stores/${store.value.slug}/manifest.webmanifest`);const apple=document.querySelector('link[rel="apple-touch-icon"]');if(apple)apple.setAttribute('href',store.value.pwa?.icon192Url||'/icons/icon-192.png');}
function resetPwaMetadata(){const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.setAttribute('href','/manifest.webmanifest');const apple=document.querySelector('link[rel="apple-touch-icon"]');if(apple)apple.setAttribute('href','/icons/icon-192.png');}
async function all(path){const result=await api.list(path+'?limit=500');let data=result.data;for(let page=2;data.length<(result.meta?.total||0);page++){const next=await api.list(path+`?limit=500&page=${page}`);data=[...data,...next.data];if(!next.data.length)break;}return data;}
async function load(){
 const seq=++requestId,slug=currentSlug.value,previewId=isPreview.value?route.query.preview:null;
 loading.value=true;error.value='';previewSeeded=false;menu.value=false;contactSent.value=false;activeNavigation=null;previewNavigationSequence++;
 Object.assign(contactForm,{name:'',email:'',message:'',website:''});
 try{
  if(previewId){
   const [s,p,c]=await Promise.all([api.get(`/stores/${previewId}`),all(`/stores/${previewId}/products`),all(`/stores/${previewId}/categories`)]);
   if(seq!==requestId)return;
   if(s.slug!==slug)throw new Error('La vista previa no corresponde a esta tienda.');
   store.value=s;products.value=p.filter(x=>x.active);featuredProducts.value=products.value.filter(x=>x.featured);allCategories.value=c;
   categories.value=StoreNavigationService.visibleCategories(c);catalogMeta.value={total:products.value.length};
   reportPreviewLocation(PREVIEW_MESSAGE.ready);
  }else{
   const data=await api.get(`/public/stores/${slug}?limit=24`);
   if(seq!==requestId)return;
   store.value=data.store;products.value=data.products;featuredProducts.value=data.featuredProducts||[];categories.value=data.categories;allCategories.value=data.categories;catalogMeta.value=data.meta;
  }
  document.title=store.value.name+' · Mi Tienda Ya';applyPwaMetadata();
 }catch(e){if(seq===requestId)error.value=e.message;}finally{if(seq===requestId)loading.value=false;}
}
async function getProduct(id){if(isPreview.value){const p=products.value.find(x=>x._id===id);if(!p)throw Object.assign(new Error('Producto no disponible.'),{status:404});return p;}return(await api.get(`/public/stores/${currentSlug.value}/products/${id}`)).product;}
async function navigatePreview(data){
 if(!Number.isSafeInteger(data.navigationId)||data.navigationId<1)return;
 const target=previewSectionPath(data.section,store.value.slug,data.productId);
 if(!target)return;
 if(data.section==='product'&&!products.value.some(product=>product._id===data.productId)){
  reportPreviewLocation(PREVIEW_MESSAGE.location,data.navigationId);return;
 }
 const sequence=++previewNavigationSequence;
 activeNavigation={path:target,navigationId:data.navigationId};
 try{
  if(route.path!==target)await router.push({path:target,query:{preview:route.query.preview}});
  if(sequence===previewNavigationSequence)reportPreviewLocation(PREVIEW_MESSAGE.location,data.navigationId);
 }catch{
  if(sequence===previewNavigationSequence)reportPreviewLocation(PREVIEW_MESSAGE.location,data.navigationId);
 }finally{if(sequence===previewNavigationSequence)activeNavigation=null;}
}
function receive(event){
 if(!isPreview.value||!store.value||!isTrustedPreviewMessage(event,{
  origin:location.origin,source:window.parent,storeId:route.query.preview,
  types:[PREVIEW_MESSAGE.design,PREVIEW_MESSAGE.navigate]
 }))return;
 if(event.data.type===PREVIEW_MESSAGE.navigate){navigatePreview(event.data);return;}
 const general=event.data.general;
 const previewGeneral={};
 if(typeof general?.name==='string')previewGeneral.name=general.name.slice(0,120);
 if(typeof general?.description==='string')previewGeneral.description=general.description.slice(0,5000);
 const nextDesign=normalizeDesign(event.data.design);
 if(nextDesign.brand.colorMode!==design.value.brand.colorMode||nextDesign.brand.allowThemeToggle!==design.value.brand.allowThemeToggle)storeTheme.setPreference(null);
 store.value={...store.value,...previewGeneral,design:nextDesign};
 if(event.data.sampleCart&&!previewSeeded){
  previewSeeded=true;
  if(!cart.value.count){
   for(const product of products.value){
    try{
     const variant=product.variants?.find(v=>v.stock>0||product.type==='digital'||product.madeToOrder);
     cart.value.add(product,variant,1);
     if(cart.value.state.items.length>=2)break;
    }catch{}
   }
  }
 }
}
async function sendContact(){if(isPreview.value){notify.info('Esta es una vista previa del formulario.');return;}if(contactBusy.value)return;contactBusy.value=true;try{await api.post(`/public/stores/${currentSlug.value}/contact`,contactForm);contactSent.value=true;notify.success('Tu mensaje fue enviado.');}catch(e){notify.error(e.message);}finally{contactBusy.value=false;}}
provide(storefrontKey,{store,products,featuredProducts,categories,allCategories,catalogMeta,design,cart,isPreview,link,getProduct,load,storeTheme,colorMode});
watch([()=>currentSlug.value,()=>route.query.preview],load,{immediate:true});
watch(()=>route.fullPath,()=>{menu.value=false;if(!loading.value){document.title=store.value?.name?(route.path.endsWith('/terminos')&&(design.value.terms.enabled||isPreview.value)?design.value.terms.title+' · '+store.value.name:store.value.name+' · Mi Tienda Ya'):'Mi Tienda Ya';reportPreviewLocation();}},{flush:'post'});
onMounted(()=>window.addEventListener('message',receive));onUnmounted(()=>{requestId++;previewNavigationSequence++;window.removeEventListener('message',receive);storeTheme.dispose();resetPwaMetadata();});
</script>
<template>
<div v-if="loading" class="loading store-loading"><span class="spinner"></span>Preparando tu visita…</div>
<div v-else-if="error || !store" class="store-unavailable"><Icon name="store" :size="46" /><h1>Volvemos pronto.</h1><p>{{error||'La tienda no está disponible por el momento.'}}</p><button class="btn btn-secondary" @click="load">Volver a intentar</button></div>
<div v-else class="storefront" :class="['store-layout-'+design.shop.layout,{'has-wallpaper':design.wallpaper.enabled}]" :data-store-theme="colorMode" :style="storefrontStyle" :dir="design.brand.textDirection">
  <div v-if="isPreview" class="store-preview-notice">VISTA PREVIA · Los cambios de diseño aún no publicados se muestran acá.</div>
  <div v-if="design.shop.showAnnouncement && design.shop.announcement" class="store-announcement" :style="StoreTextLayout.style(design.shop.announcementAlign)" :dir="StoreTextLayout.direction(design.shop.announcementDirection)">{{design.shop.announcement}}</div>
  <StoreNavbar @height="navbarHeight=$event"/>
  <main><RouterView :key="String(currentSlug)+String(route.query.preview||'')" /></main>
  <section v-if="contactVisible" id="store-contact" class="store-contact-section" :style="{...StoreTextLayout.style(design.shop.contactAlign),'--contact-justify':design.shop.contactAlign==='center'?'center':design.shop.contactAlign==='right'?'flex-end':'flex-start'}" :dir="StoreTextLayout.direction(design.shop.contactDirection)">
   <div><span v-if="copy.text('contactEyebrow')" class="store-eyebrow">{{copy.text('contactEyebrow')}}</span><h2 v-if="copy.text('contactTitle')">{{copy.text('contactTitle')}}</h2><p v-if="copy.text('contactDescription')">{{copy.text('contactDescription')}}</p><a v-if="store.contact.email" :href="'mailto:'+store.contact.email"><Icon name="mail" :size="17"/> <bdi>{{store.contact.email}}</bdi></a><a v-if="store.contact.phone" :href="'tel:'+store.contact.phone"><Icon name="phone" :size="17"/> <bdi>{{store.contact.phone}}</bdi></a></div>
   <form v-if="store.contact.showContactForm" class="store-contact-form" @submit.prevent="sendContact"><p v-if="contactSent" class="notice success">{{copy.text('contactSuccess')}}</p><template v-else><div class="form-grid"><div class="field"><label for="contact-name">{{copy.text('contactName')}}</label><input id="contact-name" v-model="contactForm.name" :aria-label="copy.text('contactName')||'Tu nombre'" required maxlength="100" autocomplete="name" /></div><div class="field"><label for="contact-email">{{copy.text('contactEmail')}}</label><input id="contact-email" v-model="contactForm.email" :aria-label="copy.text('contactEmail')||'Tu correo'" type="email" required maxlength="254" autocomplete="email" dir="ltr" /></div></div><div class="field"><label for="contact-message">{{copy.text('contactMessage')}}</label><textarea id="contact-message" v-model="contactForm.message" :aria-label="copy.text('contactMessage')||'Mensaje'" required minlength="5" maxlength="3000"></textarea></div><input v-model="contactForm.website" class="contact-honey" tabindex="-1" autocomplete="off" aria-hidden="true" /><button class="store-button" :disabled="contactBusy" :aria-label="copy.text('contactSend')||'Enviar consulta'">{{copy.text(contactBusy?'contactSending':'contactSend')}} <Icon name="arrow-right" :size="16"/></button></template></form>
  </section>
  <footer class="store-footer store-section" :style="{...footerSpacing,...StoreTextLayout.style(design.shop.footerAlign)}" :dir="StoreTextLayout.direction(design.shop.footerDirection)"><div><RouterLink :to="link()" class="store-brand">{{store.name}}</RouterLink><p v-if="design.shop.footerText">{{design.shop.footerText}}</p></div><div class="store-footer-links" :style="{alignItems:design.shop.footerAlign==='center'?'center':design.shop.footerAlign==='right'?'flex-end':'flex-start'}"><RouterLink v-if="design.terms.enabled" :to="link('/terminos')">{{design.terms.title}}</RouterLink><span>{{copy.text('footerCredit')}} <a :href="platformUrl">mi tienda ya</a></span></div></footer>
  <StoreWhatsapp v-if="store.contact.showWhatsapp && (store.contact.whatsapp||store.contact.phone)" :href="whatsappUrl(store.contact.whatsapp||store.contact.phone,store.contact.message)" :title="copy.text('whatsappTitle')" :subtitle="copy.text('whatsappSubtitle')"/>

</div>
</template>

<style scoped>
.store-contact-section{scroll-margin-top:calc(var(--store-header-offset,82px) + 20px)}.store-contact-section>div>a{justify-content:var(--contact-justify,flex-start)}.store-contact-section>div{text-align:inherit}.store-contact-section :is(h2,p){overflow-wrap:anywhere}.store-footer{gap:24px}.store-footer>div{min-width:0}.store-footer .store-brand{max-width:100%;overflow-wrap:anywhere}.store-footer .store-footer-links{text-align:inherit}
</style>

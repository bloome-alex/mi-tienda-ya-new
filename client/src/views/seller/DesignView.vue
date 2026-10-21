<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { api } from '../../services/api.js';
import { workspace, registerStoreSwitchGuard } from '../../services/workspace.js';
import { normalizeDesign, defaultDesign, wallpaperSpecs, storeTextFields, socialNetworks } from '../../services/design.js';
import { notify, confirmDialog, unsavedChangesDialog } from '../../services/notifications.js';
import { PREVIEW_MESSAGE, isTrustedPreviewMessage, previewSectionPath, readPreviewLocation } from '../../services/previewProtocol.js';
import { editorGroups, wallpaperFields } from '../../components/editor/fields.js';
import { validateImageFile, orientedImageDimensions, validateWallpaperDimensions } from '../../components/editor/imageValidation.js';
import Icon from '../../components/Icon.vue';
import DesignGroup from '../../components/editor/DesignGroup.vue';
import DesignField from '../../components/editor/DesignField.vue';
import DesignSectionsEditor from '../../components/editor/DesignSectionsEditor.vue';
import DesignSlidesEditor from '../../components/editor/DesignSlidesEditor.vue';
import DesignNavigationEditor from '../../components/editor/DesignNavigationEditor.vue';
import DesignCopyEditor from '../../components/editor/DesignCopyEditor.vue';
import '../../components/editor/editor.css';

const store=ref(null),draft=ref(normalizeDesign({})),saved=ref(''),savedGeneral=ref('');
const general=ref({name:'',slug:'',description:''});
const loading=ref(true),loadError=ref(''),saving=ref(false),savePhase=ref(''),saveError=ref(''),publishing=ref(false);
const section=ref('shop'),device=ref('desktop'),preview=ref(null),stage=ref(null),controls=ref(null);
const copyEditor=ref(null),navigationEditor=ref(null),sectionsEditor=ref(null);
const stageWidth=ref(1),stageHeight=ref(1),firstProduct=ref(null),rememberedProductId=ref('');
const frameLoaded=ref(false),frameSource=ref(''),frameKey=ref(0),pendingNavigation=ref(null);
const previewPage=ref({section:'shop',path:'',productId:''});
const expandedGroups=reactive({brand:'general',navbar:'title',shop:'hero',product:'layout',cart:'layout',checkout:'layout',terms:'content'});
const uploads=reactive({});
const uploadTasks=new Map();
let observer,messageTimer,releaseStoreGuard,loadSequence=0,navigationId=0,uploadGeneration=0,savePromise,leavePromise,unloadAttached=false;
const changedDesign=computed(()=>!!saved.value&&JSON.stringify(draft.value)!==saved.value);
const changedGeneral=computed(()=>!!savedGeneral.value&&JSON.stringify(general.value)!==savedGeneral.value);
const pendingUploads=computed(()=>Object.keys(uploads).length);
const dirty=computed(()=>changedDesign.value||changedGeneral.value||pendingUploads.value>0);
const protectedTabs=new Set(['brand','navbar','copy','sections']);
const sections=[
  {key:'brand',label:'Identidad',icon:'sparkles',description:'Marca, temas, fondos y datos de tu tienda.'},
  {key:'navbar',label:'Cabecera',icon:'menu',description:'Logo, título, altura y navegación propios de tu tienda.'},
  {key:'shop',label:'Tienda',icon:'store',description:'Portada, destacados y catálogo con tu estilo.'},
  {key:'sections',label:'Secciones',icon:'grid',description:'Contenido propio, organizado por secciones y complementos.'},
  {key:'copy',label:'Textos',icon:'edit',description:'Mensajes únicos, títulos complementarios y botones para cada página.'},
  {key:'product',label:'Producto',icon:'package',description:'Presentá cada producto con claridad.'},
  {key:'cart',label:'Carrito',icon:'cart',description:'Prepará una experiencia de compra simple.'},
  {key:'checkout',label:'Checkout',icon:'credit-card',description:'Datos, entrega y pago a tu manera.'},
  {key:'terms',label:'Términos',icon:'receipt',description:'Una página propia de términos y condiciones.'}
];
const current=computed(()=>sections.find(item=>item.key===section.value));
const previewPageLabel=computed(()=>sections.find(item=>item.key===previewPage.value.section)?.label||'Tienda');
const previewPath=computed(()=>store.value&&previewPage.value.path?`${previewPage.value.path}?preview=${store.value._id}`:'');
const wallpaperDevices=computed(()=>draft.value.wallpaper.mode==='responsive'?['desktop','mobile']:['shared']);
const slidesDisabledReason=computed(()=>!draft.value.shop.showHero?'Activá la portada para usar las diapositivas.':draft.value.shop.heroVariant!=='carousel'?'Elegí Carrusel en Portada principal para editar las diapositivas.':'');
const saveLabel=computed(()=>saving.value?savePhase.value||'Guardando…':pendingUploads.value?'Guardar al terminar carga':'Guardar cambios');
const generalFields=[{key:'name',label:'Nombre de la tienda',type:'text',max:120},{key:'slug',label:'Dirección de la tienda',type:'text',max:80,help:'Letras minúsculas, números y guiones, entre 3 y 80 caracteres. Cambiarla modifica el enlace público al guardar.'},{key:'description',label:'Descripción de la tienda',type:'textarea',max:5000}];
const logoField={key:'logo',label:'Imagen del logo',type:'image',help:'Podés usar un logo horizontal, vertical o cuadrado. JPG, PNG o WebP, hasta 5 MiB.'};
const palettes=[
  {name:'Estudio',description:'Negro y blanco',colors:['#18181b','#71717a','#ffffff','#202024'],dark:['#f4f4f5','#a1a1aa','#101012','#ededf0'],font:'modern',layout:'minimal',radius:10},
  {name:'Contraste',description:'Grises y calma',colors:['#3f3f46','#a1a1aa','#fafafa','#18181b'],dark:['#e4e4e7','#a1a1aa','#18181b','#f4f4f5'],font:'modern',layout:'editorial',radius:6},
  {name:'Feria',description:'Un acento de color',colors:['#27272a','#3b82f6','#ffffff','#18181b'],dark:['#f4f4f5','#93c5fd','#141418','#fafafa'],font:'modern',layout:'bold',radius:16}
];
const selectedPalette=computed(()=>palettes.find(p=>['primary','accent','background','text'].every((key,index)=>draft.value.brand[key]===p.colors[index])&&['darkPrimary','darkAccent','darkBackground','darkText'].every((key,index)=>draft.value.brand[key]===p.dark[index])&&draft.value.brand.font===p.font&&draft.value.brand.radius===p.radius&&draft.value.shop.layout===p.layout)?.name||'');
// Both dimensions come from the real remaining area. The iframe document scrolls
// independently, while this editor stays inside the dashboard viewport.
const frame=computed(()=>{
  const width=device.value==='mobile'?390:1100,bezel=device.value==='mobile'?8:1,outerWidth=width+bezel*2;
  const availableWidth=Math.max(1,stageWidth.value-24),availableHeight=Math.max(1,stageHeight.value-24);
  const scale=Math.min(1,availableWidth/outerWidth),height=Math.max(1,Math.floor(availableHeight/scale)-bezel*2),outerHeight=height+bezel*2;
  return {width,height,outerWidth,outerHeight,scale,visibleWidth:outerWidth*scale,visibleHeight:outerHeight*scale};
});
async function findPreviewProduct(storeId,sequence){
  for(let page=1;sequence===loadSequence;page++){
    const result=await api.list(`/stores/${storeId}/products?limit=100&page=${page}`),found=result.data.find(product=>product.active);
    if(found)return found;
    if(!result.data.length||page*100>=(result.meta?.total||result.data.length))return null;
  }
  return null;
}
function resetPreview(){
  if(!store.value){frameSource.value='';return;}
  frameLoaded.value=false;pendingNavigation.value=null;
  const target=protectedTabs.has(section.value)?previewPage.value.section:section.value;
  const path=previewSectionPath(target,store.value.slug,rememberedProductId.value||firstProduct.value?._id)||previewSectionPath('shop',store.value.slug);
  previewPage.value=readPreviewLocation(path,store.value.slug)||{section:'shop',path,productId:''};
  frameSource.value=`${path}?preview=${store.value._id}`;
}
async function load(){
  const sequence=++loadSequence,storeId=workspace.activeStoreId;
  loading.value=true;loadError.value='';saveError.value='';observer?.disconnect();
  try{
    if(!storeId){store.value=null;return;}
    const [record,product]=await Promise.all([api.get(`/stores/${storeId}`),findPreviewProduct(storeId,sequence)]);
    if(sequence!==loadSequence)return;
    store.value=record;draft.value=normalizeDesign(record.design);saved.value=JSON.stringify(draft.value);
    general.value={name:record.name,slug:record.slug,description:record.description||''};savedGeneral.value=JSON.stringify(general.value);
    firstProduct.value=product;rememberedProductId.value=product?._id||'';resetPreview();
  }catch(error){if(sequence!==loadSequence)return;loadError.value=error.message;notify.error(error.message);}
  finally{if(sequence===loadSequence)loading.value=false;}
}
function send(){
  if(!store.value)return;
  preview.value?.contentWindow?.postMessage({type:PREVIEW_MESSAGE.design,storeId:store.value._id,design:JSON.parse(JSON.stringify(draft.value)),sampleCart:true,general:{name:general.value.name,description:general.value.description}},location.origin);
}
function dispatchNavigation(){
  if(!frameLoaded.value||!store.value||!pendingNavigation.value)return;
  preview.value?.contentWindow?.postMessage({type:PREVIEW_MESSAGE.navigate,storeId:store.value._id,...pendingNavigation.value},location.origin);
}
function selectSection(key){
  if(!sections.some(item=>item.key===key))return;
  section.value=key;pendingNavigation.value=null;
  if(['brand','navbar','copy'].includes(key)||!store.value)return;
  const target=key==='sections'?'shop':key,productId=rememberedProductId.value||firstProduct.value?._id||'';
  if(!previewSectionPath(target,store.value.slug,productId))return;
  // No reload or command is needed when this page is already visible.
  if(frameLoaded.value&&previewPage.value.section===target&&(target!=='product'||previewPage.value.productId===productId))return;
  pendingNavigation.value={section:target,productId,navigationId:++navigationId};dispatchNavigation();
}
async function tabKeydown(event,index){
  let target;if(event.key==='ArrowRight')target=(index+1)%sections.length;else if(event.key==='ArrowLeft')target=(index+sections.length-1)%sections.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=sections.length-1;else return;
  event.preventDefault();selectSection(sections[target].key);await nextTick();document.getElementById(`design-tab-${sections[target].key}`)?.focus();
}
function acceptPreviewLocation(data,ready=false){
  const page=readPreviewLocation(data.path,store.value.slug);if(!page)return false;
  const previousPath=previewPage.value.path;
  const acknowledgement=Number.isSafeInteger(data.navigationId)&&data.navigationId>0?data.navigationId:null;
  previewPage.value=page;if(page.productId)rememberedProductId.value=page.productId;
  if(pendingNavigation.value){if(acknowledgement!==pendingNavigation.value.navigationId)return true;pendingNavigation.value=null;}
  // Late acknowledgements cannot undo a newer tab click. A repeated shop ready /
  // location message does not displace the cross-page controls.
  if(acknowledgement&&(acknowledgement!==navigationId||protectedTabs.has(section.value)))return true;
  if(protectedTabs.has(section.value)&&(ready||previousPath===page.path))return true;
  if(ready&&section.value==='product'&&!firstProduct.value)return true;
  if(acknowledgement||previousPath!==page.path) section.value=page.section;
  return true;
}
function received(event){
  if(!isTrustedPreviewMessage(event,{origin:location.origin,source:preview.value?.contentWindow,storeId:store.value?._id,types:[PREVIEW_MESSAGE.ready,PREVIEW_MESSAGE.location]}))return;
  const ready=event.data.type===PREVIEW_MESSAGE.ready;if(!acceptPreviewLocation(event.data,ready))return;
  if(ready){frameLoaded.value=true;send();dispatchNavigation();}
}
function reloadPreview(){resetPreview();frameKey.value++;}
function schedulePreview(){clearTimeout(messageTimer);messageTimer=setTimeout(send,80);}
watch(draft,schedulePreview,{deep:true});watch(general,schedulePreview,{deep:true});
watch(()=>draft.value.shop.featuredLayout,value=>{if(value==='grid')draft.value.shop.featuredAutoplay=false;});
watch(section,()=>{if(controls.value)controls.value.scrollTop=0;},{flush:'post'});
watch(stage,element=>{
  observer?.disconnect();if(!element)return;
  const rect=element.getBoundingClientRect();stageWidth.value=rect.width;stageHeight.value=rect.height;
  observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;stageWidth.value=width;stageHeight.value=height;});observer.observe(element);
},{flush:'post'});
function isPartOfDraft(target,value=draft.value){
  if(value===target)return true;
  return !!value&&typeof value==='object'&&Object.values(value).some(child=>child&&typeof child==='object'&&isPartOfDraft(target,child));
}
function requestUpload({file,target,field,scope,purpose,specification}){
  if(saving.value||!store.value)return;
  const key=`${scope}.${field}`;if(uploads[key])return;
  const id=store.value._id,generation=uploadGeneration,controller=new AbortController();uploads[key]=true;
  const task={controller,promise:null};
  task.promise=(async()=>{
    validateImageFile(file);
    if(specification)validateWallpaperDimensions(await orientedImageDimensions(file),specification);
    if(controller.signal.aborted)return false;
    const form=new FormData();form.append('files',file);if(purpose)form.append('purpose',purpose);
    const result=await api.post(`/stores/${id}/uploads`,form,{signal:controller.signal});
    if(generation!==uploadGeneration||store.value?._id!==id||!isPartOfDraft(target))return false;
    const uploaded=Array.isArray(result)?result[0]:result;
    if(!uploaded?.url)throw new Error('La imagen no se pudo procesar. Volvé a intentarlo.');
    if(specification&&Number.isFinite(uploaded.width)&&Number.isFinite(uploaded.height))validateWallpaperDimensions(uploaded,specification);
    target[field]=uploaded.url;saveError.value='';notify.success('Imagen cargada. Guardá los cambios para aplicarla.');return true;
  })().catch(error=>{if(error.name!=='AbortError'&&generation===uploadGeneration){saveError.value=error.message;notify.error(error.message);}return false;}).finally(()=>{if(uploadTasks.get(key)===task){uploadTasks.delete(key);delete uploads[key];}});
  uploadTasks.set(key,task);
  return task.promise;
}
function uploadField(field,file){requestUpload({file,target:draft.value[section.value],field:field.key,scope:section.value});}
function uploadLogo(file){requestUpload({file,target:draft.value.brand,field:'logo',scope:'brand'});}
function registerNavigationEditor(editor){navigationEditor.value=editor;}
function uploadWallpaper(deviceKey,file){const specification=wallpaperSpecs[deviceKey];requestUpload({file,target:draft.value.wallpaper,field:deviceKey+'Image',scope:'wallpaper',purpose:specification.purpose,specification});}
function wallpaperImageField(deviceKey){const spec=wallpaperSpecs[deviceKey];return {key:deviceKey+'Image',label:spec.label,type:'image',uploadOnly:true,help:`Medida sugerida: ${spec.width} × ${spec.height} px. Podés usar otra resolución o proporción. JPG, PNG o WebP, hasta 5 MiB y 25 megapíxeles.`};}
function abortUploads(){uploadGeneration++;for(const task of uploadTasks.values())task.controller.abort();uploadTasks.clear();for(const key of Object.keys(uploads))delete uploads[key];}
function preset(value){
  ['primary','accent','background','text'].forEach((key,index)=>{draft.value.brand[key]=value.colors[index];});
  ['darkPrimary','darkAccent','darkBackground','darkText'].forEach((key,index)=>{draft.value.brand[key]=value.dark[index];});
  Object.assign(draft.value.brand,{font:value.font,radius:value.radius});draft.value.shop.layout=value.layout;
  notify.info('Paletas clara y oscura aplicadas a la vista previa. Guardá para usarlas en tu tienda.');
}
async function reset(){
  if(saving.value)return;
  if(await confirmDialog({title:'Restaurar el diseño inicial',message:'Se reemplazarán las opciones de diseño, los fondos, los términos y las secciones por sus valores iniciales. Los datos generales de la tienda se conservan. Podés revisar el resultado antes de guardar.',confirmText:'Restaurar diseño',danger:true})){abortUploads();draft.value=normalizeDesign(defaultDesign);saveError.value='';notify.info('Diseño inicial cargado en la vista previa.');}
}
function problem(message,tab,group,field,extra={}){const error=new Error(message);error.designField={tab,group,field,...extra};return error;}
function validateBeforeSave(design,details){
  if(!details.name.trim()||details.name.trim().length>120)throw problem('Ingresá un nombre de tienda de hasta 120 caracteres.','brand','general','name');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(details.slug)||details.slug.length<3||details.slug.length>80)throw problem('La dirección debe tener entre 3 y 80 letras minúsculas, números o guiones.','brand','general','slug');
  for(const [tab,groups]of Object.entries(editorGroups))for(const group of groups)for(const field of group.items){
    const value=design[tab]?.[field.key];
    if(field.type==='color'&&!/^#[a-f\d]{6}$/i.test(value))throw problem(`${field.label}: usá un color hexadecimal de seis dígitos, por ejemplo #18181b.`,tab,group.key,field.key);
    if(field.type==='range'&&(!Number.isFinite(value)||!Number.isInteger(value)||value<field.min||value>field.max))throw problem(`${field.label}: ingresá un número entre ${field.min} y ${field.max}.`,tab,group.key,field.key);
    if(['text','textarea','url'].includes(field.type)&&(typeof value!=='string'||value.length>field.max))throw problem(`${field.label}: usá un texto de hasta ${field.max} caracteres.`,tab,group.key,field.key);
  }
  for(const field of storeTextFields)if(typeof design.copy[field.key]!=='string'||design.copy[field.key].length>field.max)throw problem(`${field.label}: el texto admite hasta ${field.max} caracteres.`,'copy',field.section,field.key);
  for(const link of design.navbar.links){
    const target={path:`navbar.links.${link.id}.sectionId`,itemId:link.id};
    if(link.enabled&&link.target==='section'&&!link.sectionId)throw problem(`Elegí una sección de destino para el enlace “${link.label||'sin texto'}”, o desactivalo.`,'navbar','links','sectionId',target);
  }
  for(const item of design.sections){
    if(item.type!=='social')continue;
    if(!Number.isInteger(item.socialIconSize)||item.socialIconSize<16||item.socialIconSize>64)throw problem(`El tamaño de iconos de “${item.title||'Redes sociales'}” debe estar entre 16 y 64 px.`,'sections',undefined,'socialIconSize',{path:`sections.${item.id}.socialIconSize`,sectionId:item.id});
    for(const link of item.socialLinks){
      const name=socialNetworks.find(network=>network.value===link.network)?.label||'la red social';
      const target={path:`sections.${item.id}.socialLinks.${link.id}.url`,sectionId:item.id,linkId:link.id};
      if(item.enabled&&link.enabled&&!link.url.trim())throw problem(`Completá el enlace a ${name} en “${item.title||'Redes sociales'}”, o desactivá esa red.`,'sections',undefined,'url',target);
      if(link.url){
        let valid=false;try{const url=new URL(link.url);valid=['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!/[\s\\]/.test(link.url)&&link.url.length<=2048;}catch{}
        if(!valid)throw problem(`El enlace a ${name} debe ser una dirección HTTP o HTTPS completa, de hasta 2048 caracteres y sin credenciales.`,'sections',undefined,'url',target);
      }
    }
  }
  if(design.terms.enabled&&(!design.terms.title.trim()||!design.terms.content.trim()))throw problem('Completá el título y el contenido antes de publicar los términos.','terms','content',!design.terms.title.trim()?'title':'content');
  if(design.terms.updatedAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(design.terms.updatedAt)||Number.isNaN(Date.parse(design.terms.updatedAt))||new Date(design.terms.updatedAt).toISOString().slice(0,10)!==design.terms.updatedAt))throw problem('La fecha de actualización de los términos no es válida.','terms','appearance','updatedAt');
  if(design.wallpaper.enabled){
    const keys=design.wallpaper.mode==='responsive'?['desktop','mobile']:['shared'];
    for(const key of keys)if(!design.wallpaper[key+'Image'])throw problem(`Cargá el fondo de ${wallpaperSpecs[key].label.toLowerCase()} antes de activar esta configuración.`,'brand','wallpaper',key+'Image');
  }
  for(const field of wallpaperFields.filter(field=>field.type==='range'))if(!Number.isInteger(design.wallpaper[field.key])||design.wallpaper[field.key]<field.min||design.wallpaper[field.key]>field.max)throw problem(`${field.label}: ingresá un valor entre ${field.min} y ${field.max}.`,'brand','wallpaper',field.key);
  if(JSON.stringify(design).length>160000)throw problem('El diseño supera el tamaño permitido. Reducí el contenido de textos o complementos.','sections');
}
function updateStoreRecord(record){
  if(!record||record._id!==store.value?._id)return;
  const previousSlug=store.value.slug;store.value={...store.value,...record};
  workspace.stores=workspace.stores.map(item=>item._id===record._id?{...item,...record}:item);
  if(previousSlug!==record.slug)resetPreview();
}
async function showSaveError(error){
  saveError.value=error.message;notify.error(error.message);
  const target=error.designField;if(!target)return;
  selectSection(target.tab);if(target.group)expandedGroups[target.tab]=target.group;
  await nextTick();
  if(target.tab==='copy'){await copyEditor.value?.focusField(target.field);return;}
  if(target.tab==='navbar'&&target.itemId)navigationEditor.value?.openItem(target.itemId);
  if(target.tab==='sections'&&target.sectionId)await sectionsEditor.value?.openField(target);
  await nextTick();const scope=target.group==='general'?'general':target.group==='wallpaper'?'wallpaper':target.tab;
  const element=[...(controls.value?.querySelectorAll('[data-design-field]')||[])].find(element=>element.dataset.designField===(target.path||`${scope}.${target.field}`));
  element?.scrollIntoView({block:'nearest'});element?.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])')?.focus({preventScroll:true});
}
async function performSave(){
  const id=store.value?._id;if(!id)return false;
  saving.value=true;saveError.value='';let designWritten=false;
  try{
    if(uploadTasks.size){savePhase.value='Esperando imágenes…';const results=await Promise.all([...uploadTasks.values()].map(task=>task.promise));if(results.some(result=>!result))throw new Error('Una imagen no terminó de cargarse. Revisá el archivo y volvé a guardar; tus cambios siguen en el editor.');}
    const designSnapshot=JSON.stringify(draft.value),generalSnapshot=JSON.stringify(general.value);
    const design=JSON.parse(designSnapshot),details=JSON.parse(generalSnapshot);validateBeforeSave(design,details);
    savePhase.value='Guardando cambios…';
    if(designSnapshot!==saved.value){
      const result=await api.put(`/stores/${id}/design`,{design});
      if(store.value?._id!==id)return false;
      saved.value=designSnapshot;designWritten=true;updateStoreRecord(result);
    }
    if(generalSnapshot!==savedGeneral.value){
      const result=await api.put(`/stores/${id}`,details);
      if(store.value?._id!==id)return false;
      const canonical={name:result.name,slug:result.slug,description:result.description||''};
      savedGeneral.value=JSON.stringify(canonical);
      if(JSON.stringify(general.value)===generalSnapshot)general.value=canonical;
      updateStoreRecord(result);
    }
    if(dirty.value){notify.info('Se guardaron los cambios enviados. Hay ajustes nuevos que todavía no guardaste.');return false;}
    notify.success('Los cambios de tu tienda se guardaron.');return true;
  }catch(error){if(designWritten&&changedGeneral.value)error.message=`El diseño ya se guardó. Falta actualizar los datos de la tienda: ${error.message}`;await showSaveError(error);return false;}
  finally{saving.value=false;savePhase.value='';}
}
function save(){if(savePromise)return savePromise;savePromise=performSave().finally(()=>{savePromise=undefined;});return savePromise;}
async function togglePublish(){
  if(publishing.value||saving.value)return;
  if(dirty.value){notify.info('Guardá los cambios antes de cambiar la publicación de tu tienda.');return;}
  publishing.value=true;
  try{updateStoreRecord(await api.put(`/stores/${store.value._id}`,{active:!store.value.active}));notify.success(store.value.active?'Tu tienda ya está publicada.':'La tienda dejó de estar publicada.');}
  catch(error){notify.error(error.message);}finally{publishing.value=false;}
}
function beforeUnload(event){if(dirty.value||saving.value){event.preventDefault();event.returnValue=true;}}
watch(()=>dirty.value||saving.value,needed=>{if(needed&&!unloadAttached){window.addEventListener('beforeunload',beforeUnload);unloadAttached=true;}else if(!needed&&unloadAttached){window.removeEventListener('beforeunload',beforeUnload);unloadAttached=false;}},{flush:'sync'});
async function decideLeave(){
  if(savePromise){const savedSuccessfully=await savePromise;if(!savedSuccessfully)return false;}
  if(!dirty.value)return true;
  const choice=await unsavedChangesDialog({message:pendingUploads.value?'Hay imágenes en proceso y cambios pendientes. Guardar espera a que terminen de cargar. También podés descartar todo o seguir editando.':'Tenés cambios en el diseño o en los datos de la tienda. ¿Cómo querés continuar?'});
  if(choice==='save')return await save();
  if(choice==='discard'){abortUploads();draft.value=JSON.parse(saved.value);general.value=JSON.parse(savedGeneral.value);saveError.value='';return true;}
  return false;
}
function mayLeave(){if(leavePromise)return leavePromise;leavePromise=decideLeave().finally(()=>{leavePromise=undefined;});return leavePromise;}
onBeforeRouteLeave(mayLeave);
onMounted(()=>{if(window.matchMedia('(max-width: 800px)').matches)device.value='mobile';releaseStoreGuard=registerStoreSwitchGuard(mayLeave);window.addEventListener('message',received);load();});
onUnmounted(()=>{loadSequence++;releaseStoreGuard?.();observer?.disconnect();abortUploads();clearTimeout(messageTimer);window.removeEventListener('message',received);window.removeEventListener('beforeunload',beforeUnload);});
</script>
<template>
  <div class="design-view">
    <header class="design-header">
      <div class="design-heading"><span class="design-eyebrow">TU MARCA, TU ESTILO</span><h1>Diseño de tu tienda</h1><p>Personalizá cada detalle y recorré el resultado en tiempo real.</p></div>
      <div v-if="store" class="design-top-actions"><span class="design-save-state" :class="{dirty}" aria-live="polite"><i></i>{{saving ? 'Guardando…' : pendingUploads ? 'Cargando imágenes…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}}</span><button class="btn btn-primary" :disabled="saving || publishing || !dirty" @click="save"><span v-if="saving" class="spinner"></span><Icon v-else name="check" :size="17"/><span>{{saveLabel}}</span></button></div>
    </header>
    <div v-if="loading" class="design-state loading"><span class="spinner"></span>Preparando el editor…</div>
    <div v-else-if="loadError" class="design-state card empty-state"><Icon name="info" :size="36"/><h2>No pudimos abrir el editor</h2><p>{{loadError}}</p><button class="btn btn-secondary" @click="load">Volver a intentar</button></div>
    <div v-else-if="!store" class="design-state card empty-state"><Icon name="palette" :size="40"/><h2>Tu tienda empieza acá.</h2><p>Seleccioná una tienda para personalizar su diseño.</p></div>
    <template v-else>
      <div class="design-store-status"><div class="design-store-info"><span class="badge" :class="store.active ? 'badge-success' : 'badge-warning'">{{store.active ? 'Publicada' : 'En preparación'}}</span><div class="design-store-name"><strong>{{store.name}}</strong><small>/t/{{store.slug}}</small></div></div><div class="design-store-actions"><button class="btn btn-ghost btn-sm" :disabled="publishing || saving || dirty" :title="dirty ? 'Guardá tus cambios antes de cambiar la publicación.' : ''" @click="togglePublish">{{publishing ? 'Actualizando…' : store.active ? 'Pausar tienda' : 'Publicar tienda'}}</button><a :href="'/t/' + store.slug" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><Icon name="external-link" :size="15"/><span>Ver tienda</span></a></div></div>
      <div class="design-section-tabs" role="tablist" aria-label="Secciones de diseño"><button v-for="(item,index) in sections" :key="item.key" :id="'design-tab-' + item.key" role="tab" :aria-selected="section === item.key" aria-controls="design-controls-panel" :tabindex="section === item.key ? 0 : -1" :class="{active:section===item.key}" @click="selectSection(item.key)" @keydown="tabKeydown($event,index)"><Icon :name="item.icon" :size="17"/><span>{{item.label}}</span></button></div>
      <div class="design-editor">
        <aside id="design-controls-panel" ref="controls" class="design-controls" role="tabpanel" :aria-labelledby="'design-tab-' + section" tabindex="0">
          <div class="design-controls-title"><h2>{{current.label}}</h2><p>{{current.description}}</p></div>
          <div v-if="saveError" class="ed-error" role="alert"><Icon name="warning" :size="16"/><span>{{saveError}}</span><button type="button" aria-label="Cerrar mensaje de error" @click="saveError=''">×</button></div>
          <DesignSectionsEditor v-if="section==='sections'" ref="sectionsEditor" v-model="draft.sections" :uploads="uploads" :disabled="saving" :design="draft" @upload="requestUpload"/>
          <DesignCopyEditor v-if="section==='copy'" ref="copyEditor" v-model="draft.copy" :active-page="previewPage.section" :disabled="saving"/>
          <DesignGroup v-for="group in (editorGroups[section] || [])" :key="section + '-' + group.key" :title="group.title" :description="group.description" :model-value="expandedGroups[section]===group.key" @update:model-value="expandedGroups[section]=$event?group.key:''">
            <form v-if="group.special==='general'" class="ed-general-form" @submit.prevent="save"><DesignField v-for="field in generalFields" :key="field.key" v-model="general[field.key]" :field="field" scope="general"/><div class="ed-address-preview"><Icon name="link" :size="14"/><span>/t/{{general.slug || 'tu-tienda'}}</span></div><p class="ed-help">Los datos generales se guardan junto con el diseño usando <strong>Guardar cambios</strong>. La vista previa mantiene la dirección actual hasta guardar.</p></form>
            <template v-if="group.special==='presets'"><div class="design-presets"><button v-for="palette in palettes" :key="palette.name" type="button" :class="{selected:selectedPalette===palette.name}" :aria-pressed="selectedPalette===palette.name" @click="preset(palette)"><span class="palette-swatches"><i v-for="(color,index) in palette.colors" :key="index" :style="{background:color}"></i></span><strong>{{palette.name}}<Icon v-if="selectedPalette===palette.name" name="check" :size="12"/></strong><small>{{palette.description}}</small></button></div><p class="ed-help">Cada estilo incluye paletas clara y oscura. Conserva tus imágenes, textos y secciones.</p></template>
            <DesignField v-if="group.special==='logo'" v-model="draft.brand.logo" :field="logoField" scope="brand" :disabled="saving" :busy="!!uploads['brand.logo']" @upload="uploadLogo"/>
            <DesignField v-for="field in group.items" :key="field.key" v-model="draft[section][field.key]" :field="field" :scope="section" :disabled="saving && field.type==='image'" :reason="field.needs?.(draft) || ''" :busy="!!uploads[section+'.'+field.key]" @upload="uploadField(field,$event)"/>
            <p v-if="group.special==='logo'" class="ed-notice">El logo se adapta a la altura disponible de la cabecera sin deformarse. Para verlo más grande, aumentá también esa altura en Tamaño y posición.</p>
            <DesignNavigationEditor v-if="group.special==='navigation'" :ref="registerNavigationEditor" v-model="draft.navbar.links" :design="draft" :disabled="saving"/>
            <DesignSlidesEditor v-if="group.special==='slides'" v-model="draft.shop.heroSlides" :disabled="saving" :reason="slidesDisabledReason" :uploads="uploads" :design="draft" @upload="requestUpload"/>
            <template v-if="group.special==='wallpaper'">
              <DesignField v-for="field in wallpaperFields.slice(0,2)" :key="field.key" v-model="draft.wallpaper[field.key]" :field="field" scope="wallpaper"/>
              <div class="ed-wallpaper-specs"><DesignField v-for="deviceKey in wallpaperDevices" :key="deviceKey" v-model="draft.wallpaper[deviceKey+'Image']" :field="wallpaperImageField(deviceKey)" scope="wallpaper" :disabled="saving" :busy="!!uploads['wallpaper.'+deviceKey+'Image']" @upload="uploadWallpaper(deviceKey,$event)"/></div>
              <p class="ed-notice"><Icon name="image" :size="15"/><span>{{draft.wallpaper.mode==='responsive' ? 'Cargá una imagen para cada dispositivo. Las medidas son recomendaciones; las imágenes conservan su resolución y proporción.' : 'Podés usar una imagen horizontal, vertical o cuadrada. Revisá cómo se adapta en escritorio y celular; el ajuste Cubrir puede recortar sus bordes.'}}</span></p>
              <DesignField v-for="field in wallpaperFields.slice(2)" :key="field.key" v-model="draft.wallpaper[field.key]" :field="field" scope="wallpaper" :reason="!draft.wallpaper.enabled?'Activá la imagen de fondo para ver este ajuste.':''"/>
            </template>
            <p v-if="['light-colors','dark-colors'].includes(group.key)" class="ed-help">Elegí textos y fondos con suficiente contraste. Podés probar ambos modos con el selector de tema de la vista previa.</p>
          </DesignGroup>
          <button class="design-reset" :disabled="saving" @click="reset">Restaurar diseño inicial</button>
        </aside>
        <section class="design-preview-area" aria-label="Vista previa interactiva">
          <header class="design-preview-toolbar"><div><span class="preview-live-dot" :class="{connected:frameLoaded}"></span><strong>Vista previa</strong><span class="design-preview-caption">{{frameLoaded?'Cambios en tiempo real':'Conectando…'}}</span></div><div class="preview-device-buttons" role="group" aria-label="Tamaño de vista previa"><button :class="{active:device==='desktop'}" :aria-pressed="device==='desktop'" @click="device='desktop'" aria-label="Vista de escritorio"><Icon name="monitor" :size="18"/></button><button :class="{active:device==='mobile'}" :aria-pressed="device==='mobile'" @click="device='mobile'" aria-label="Vista de teléfono"><Icon name="phone" :size="18"/></button></div></header>
          <div class="design-browser-chrome"><button class="preview-reload" @click="reloadPreview" aria-label="Recargar vista previa" title="Recargar vista previa"><Icon name="refresh" :size="14"/></button><div><Icon name="shield" :size="11"/><span>{{store.slug}} <b>/ {{previewPageLabel}}</b></span></div><small>{{frame.width}} × {{frame.height}}</small><a :href="previewPath" target="_blank" rel="noopener" aria-label="Abrir vista previa en otra pestaña"><Icon name="external-link" :size="14"/></a></div>
          <p v-if="!firstProduct && ['product','cart','checkout'].includes(section)" class="design-preview-hint">Cargá y activá un producto para revisar la experiencia de compra completa.</p>
          <div ref="stage" class="design-preview-stage" :class="{'is-mobile':device==='mobile'}"><div class="design-frame-viewport" :style="{width:frame.visibleWidth+'px',height:frame.visibleHeight+'px'}"><div class="design-frame-scaler" :style="{width:frame.outerWidth+'px',height:frame.outerHeight+'px',transform:'scale('+frame.scale+')'}"><iframe :key="frameKey" ref="preview" :src="frameSource" title="Vista previa interactiva de tu tienda" @load="send" :style="{width:frame.width+'px',height:frame.height+'px'}"></iframe></div></div></div>
          <footer class="design-preview-footer"><Icon name="info" :size="14"/><span>La navegación sincroniza los controles. Los cambios se aplican a tu tienda al guardar.</span></footer>
        </section>
      </div>
    </template>
  </div>
</template>
<style scoped>
:global(.p-main.p-main-design) {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  padding-top: calc(var(--p-navbar-height, 76px) + 16px);
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
}
.design-view { width: 100%; min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 12px; color: var(--text, #18181b); }
.design-view button, .design-view summary { cursor: pointer; }
.design-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex: none; min-width: 0; }
.design-heading { min-width: 0; }
.design-eyebrow { display: block; margin-bottom: 5px; font-size: 9px; letter-spacing: 1.3px; font-weight: 650; color: var(--muted, #71717a); }
.design-heading h1 { font-family: inherit; font-size: 24px; font-weight: 700; line-height: 1.25; letter-spacing: -.75px; margin: 0; color: var(--text, #18181b); }
.design-heading p { font-size: 12px; line-height: 1.5; color: var(--muted, #71717a); margin: 5px 0 0; }
.design-top-actions { display: flex; align-items: center; gap: 16px; flex: none; }
.design-save-state { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted, #71717a); white-space: nowrap; }
.design-save-state > i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted, #71717a); }
.design-save-state.dirty { color: var(--text, #18181b); }
.design-save-state.dirty > i { background: var(--primary, #18181b); box-shadow: 0 0 0 3px var(--surface-alt, #f4f4f5); }
.design-state { flex: 1; min-height: 0; overflow: auto; align-content: center; }
.design-store-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; padding: 8px 12px; background: var(--surface, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 9px; }
.design-store-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
.design-store-info .badge { flex: none; font-size: 10px; }
.design-store-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.design-store-name strong { font-size: 12px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.design-store-name small { font-size: 10px; color: var(--muted, #71717a); white-space: nowrap; }
.design-store-actions { display: flex; gap: 7px; flex: none; }
.design-view .design-store-actions .btn { min-height: 31px; padding: 6px 10px; font-size: 11px; }
.design-section-tabs { display: flex; gap: 5px; flex: none; overflow-x: auto; border-bottom: 1px solid var(--line, #e4e4e7); scrollbar-width: thin; }
.design-section-tabs > button { display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-bottom: 2px solid transparent; border-radius: 5px 5px 0 0; padding: 10px 14px; color: var(--muted, #71717a); font-size: 12px; font-weight: 500; background: transparent; white-space: nowrap; }
.design-section-tabs > button:hover { background: var(--surface-alt, #f4f4f5); color: var(--text, #18181b); }
.design-section-tabs > button.active { color: var(--text, #18181b); border-bottom-color: var(--primary, #18181b); font-weight: 650; }
.design-editor { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.design-controls { min-height: 0; min-width: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; scrollbar-width: thin; background: var(--surface, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 10px; }
.design-controls-title { padding: 18px; border-bottom: 1px solid var(--line, #e4e4e7); background: var(--surface-alt, #f4f4f5); }
.design-controls-title h2 { font-family: inherit; font-size: 16px; font-weight: 650; line-height: 1.3; letter-spacing: -.2px; margin: 0 0 5px; color: var(--text, #18181b); }
.design-controls-title p { font-size: 11px; line-height: 1.55; color: var(--muted, #71717a); margin: 0; }
.design-group { border-bottom: 1px solid var(--line, #e4e4e7); }
.design-group > summary { font-size: 12px; list-style: none; font-weight: 600; padding: 17px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text, #18181b); }
.design-group > summary::-webkit-details-marker { display: none; }
.design-group > summary > svg { flex: none; color: var(--muted, #71717a); transition: transform .15s; }
.design-group[open] > summary > svg { transform: rotate(180deg); }
.design-fields { display: flex; flex-direction: column; gap: 18px; padding: 0 18px 20px; }
.design-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.design-field > label:not(.design-toggle) { font-size: 11px; font-weight: 550; color: var(--text, #18181b); }
.design-field > input, .design-field > textarea, .design-field > select, .design-image-field > input, .design-url > input { width: 100%; padding: 10px; border: 1px solid var(--line, #e4e4e7); border-radius: 6px; color: var(--text, #18181b); background: var(--surface, #fff); font-size: 12px; min-width: 0; }
.design-field > textarea { resize: vertical; min-height: 74px; line-height: 1.6; }
.design-view input::placeholder, .design-view textarea::placeholder { color: var(--muted, #71717a); opacity: .8; }
.design-view :is(input, select, textarea, button, summary, a):focus-visible { outline: 2px solid var(--primary, #18181b); outline-offset: 2px; }
.design-field-help { font-size: 10px; color: var(--muted, #71717a); line-height: 1.65; margin: 0; }
.design-toggle { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; font-size: 11px; font-weight: 500; color: var(--text, #18181b); cursor: pointer; }
.design-toggle > span { flex: 1; }
.design-toggle input { position: absolute; right: 0; width: 38px; height: 26px; opacity: 0; cursor: pointer; margin: 0; z-index: 1; }
.design-toggle i { display: block; position: relative; width: 34px; height: 20px; background: var(--muted, #71717a); border-radius: 20px; flex: none; transition: background .15s; }
.design-toggle i:after { content: ''; position: absolute; left: 3px; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--surface, #fff); transition: transform .15s; }
.design-toggle input:checked + i { background: var(--primary, #18181b); }
.design-toggle input:checked + i:after { transform: translateX(14px); background: var(--on-primary, #fff); }
.design-toggle input:focus-visible + i { outline: 2px solid var(--primary, #18181b); outline-offset: 3px; }
.design-range { display: flex; align-items: center; gap: 12px; }
.design-range input { flex: 1; width: 100%; min-width: 0; accent-color: var(--primary, #18181b); height: 24px; }
.design-range output { font-size: 11px; padding: 6px 8px; border: 1px solid var(--line, #e4e4e7); border-radius: 6px; background: var(--surface-alt, #f4f4f5); color: var(--text, #18181b); min-width: 38px; text-align: center; white-space: nowrap; }
.design-color-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.design-color-row > label { font-size: 11px; font-weight: 500; color: var(--text, #18181b); }
.design-color-row > div { border: 1px solid var(--line, #e4e4e7); border-radius: 6px; display: flex; align-items: center; padding: 4px; gap: 6px; }
.design-color-row input[type=color] { width: 23px; height: 26px; border: 0; padding: 0; background: none; cursor: pointer; }
.design-color-row input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
.design-color-row input[type=color]::-webkit-color-swatch { border: 0; border-radius: 4px; }
.design-color-row input[type=text] { width: 62px; border: 0; font-size: 11px; color: var(--text, #18181b); background: none; padding: 0; }
.design-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; padding: 0 14px 20px; }
.design-presets > button { background: var(--surface, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 7px; text-align: left; padding: 8px; min-width: 0; }
.design-presets > button:hover { border-color: var(--primary, #18181b); }
.palette-swatches { display: flex; height: 22px; margin-bottom: 8px; border-radius: 4px; border: 1px solid var(--line, #e4e4e7); overflow: hidden; }
.palette-swatches > i { flex: 1; }
.design-presets strong { display: block; font-size: 10px; font-weight: 600; color: var(--text, #18181b); }
.design-presets small { display: block; font-size: 9px; line-height: 1.5; color: var(--muted, #71717a); margin-top: 3px; }
.design-image-field { display: flex; flex-direction: column; gap: 9px; }
.design-image-preview { position: relative; background: var(--surface-alt, #f4f4f5); border: 1px solid var(--line, #e4e4e7); border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: center; height: 110px; }
.design-image-preview > img { width: 100%; height: 100%; object-fit: contain; }
.design-image-preview > .icon-button { position: absolute; top: 6px; right: 6px; width: 29px; height: 29px; background: var(--surface, #fff); color: var(--text, #18181b); border: 1px solid var(--line, #e4e4e7); }
.design-upload { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border: 1px dashed var(--muted, #71717a); border-radius: 6px; color: var(--text, #18181b); background: var(--surface-alt, #f4f4f5); font-size: 11px; font-weight: 500; overflow: hidden; cursor: pointer; }
.design-upload > input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.design-upload:focus-within { outline: 2px solid var(--primary, #18181b); outline-offset: 2px; }
.design-url { display: flex; align-items: center; border: 1px solid var(--line, #e4e4e7); border-radius: 6px; overflow: hidden; }
.design-url > span { padding: 9px; background: var(--surface-alt, #f4f4f5); font-size: 12px; color: var(--muted, #71717a); }
.design-url > input { border: 0; border-radius: 0; }
.design-reset { display: block; width: 100%; background: var(--surface-alt, #f4f4f5); border: 0; color: var(--muted, #71717a); padding: 17px; font-size: 11px; }
.design-reset:hover { color: var(--text, #18181b); text-decoration: underline; }
.design-preview-area { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-radius: 10px; border: 1px solid var(--line, #e4e4e7); background: var(--surface-alt, #f4f4f5); }
.design-preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 13px; background: var(--surface, #fff); border-bottom: 1px solid var(--line, #e4e4e7); flex: none; }
.design-preview-toolbar > div:first-child { display: flex; align-items: center; gap: 7px; min-width: 0; }
.preview-live-dot { width: 6px; height: 6px; background: var(--muted, #71717a); border-radius: 50%; flex: none; }
.preview-live-dot.connected { background: var(--primary, #18181b); }
.design-preview-toolbar strong { font-size: 12px; font-weight: 600; color: var(--text, #18181b); white-space: nowrap; }
.design-preview-caption { font-size: 10px; color: var(--muted, #71717a); white-space: nowrap; }
.preview-device-buttons { display: flex; background: var(--surface-alt, #f4f4f5); border-radius: 6px; padding: 3px; gap: 2px; flex: none; }
.preview-device-buttons > button { border: 0; border-radius: 4px; background: transparent; width: 32px; height: 28px; display: grid; place-items: center; color: var(--muted, #71717a); }
.preview-device-buttons > button.active { background: var(--surface, #fff); color: var(--text, #18181b); box-shadow: 0 1px 3px #00000012; }
.design-browser-chrome { display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: var(--surface-alt, #f4f4f5); border-bottom: 1px solid var(--line, #e4e4e7); color: var(--muted, #71717a); flex: none; min-height: 32px; }
.design-browser-chrome > div { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; font-size: 10px; }
.design-browser-chrome > div > svg { flex: none; }
.design-browser-chrome > div > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.design-browser-chrome b { font-weight: 400; }
.design-browser-chrome > small { font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.design-browser-chrome > a, .preview-reload { color: var(--muted, #71717a); display: grid; place-items: center; width: 23px; height: 23px; border: 0; border-radius: 4px; background: transparent; flex: none; }
.design-browser-chrome > a:hover, .preview-reload:hover { color: var(--text, #18181b); background: var(--surface, #fff); }
.design-preview-stage { width: 100%; flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; background: var(--bg, #f4f4f5); }
.design-frame-viewport { position: relative; flex: none; max-width: 100%; max-height: 100%; }
.design-frame-scaler { position: absolute; inset: 0 auto auto 0; transform-origin: top left; background: var(--surface, #fff); border: 1px solid var(--line, #e4e4e7); border-radius: 5px; box-shadow: 0 4px 18px #00000010; overflow: hidden; box-sizing: border-box; }
.is-mobile .design-frame-scaler { border: 8px solid var(--text, #18181b); border-radius: 24px; }
.design-frame-scaler iframe { border: 0; background: var(--surface, #fff); display: block; }
.design-preview-footer { background: var(--surface, #fff); padding: 9px 12px; border-top: 1px solid var(--line, #e4e4e7); color: var(--muted, #71717a); display: flex; align-items: center; gap: 7px; font-size: 10px; line-height: 1.5; flex: none; }
.design-preview-footer > svg { flex: none; }
.design-preview-hint { font-size: 10px; line-height: 1.5; color: var(--text, #18181b); padding: 8px 12px; margin: 0; background: var(--surface-alt, #f4f4f5); border-bottom: 1px solid var(--line, #e4e4e7); flex: none; }
@media (max-width: 1280px) {
  .design-editor { grid-template-columns: 275px minmax(0, 1fr); gap: 12px; }
  .design-preview-caption { display: none; }
  .design-store-name small { display: none; }
  .design-save-state { font-size: 10px; }
  .design-top-actions { gap: 10px; }
}
@media (max-width: 1050px) {
  .design-editor { grid-template-columns: 250px minmax(0, 1fr); gap: 10px; }
  .design-heading p { display: none; }
  .design-save-state { display: none; }
  .design-section-tabs > button { padding: 9px 11px; font-size: 11px; }
  .design-fields { padding-inline: 14px; }
  .design-group > summary { padding-inline: 14px; }
  .design-presets { padding-inline: 10px; gap: 5px; }
  .design-presets > button { padding: 6px; }
}
@media (max-width: 800px) {
  :global(.p-main.p-main-design) { padding-top: calc(var(--p-navbar-height, 112px) + 10px); padding-bottom: 10px; }
  .design-view { gap: 8px; }
  .design-header { gap: 10px; }
  .design-eyebrow { display: none; }
  .design-heading h1 { font-size: 20px; letter-spacing: -.5px; }
  .design-top-actions > .btn { font-size: 11px; min-height: 36px; padding: 8px 11px; }
  .design-store-status { padding: 6px 9px; }
  .design-store-info { gap: 8px; }
  .design-store-info .badge { font-size: 9px; }
  .design-store-actions { gap: 3px; }
  .design-view .design-store-actions .btn { padding: 5px 7px; font-size: 10px; }
  .design-store-actions > a > span { display: none; }
  .design-section-tabs { gap: 0; }
  .design-section-tabs > button { flex: 1; padding: 9px 6px; font-size: 10px; gap: 5px; }
  .design-section-tabs > button > svg { width: 15px; height: 15px; }
  .design-editor { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1.1fr) minmax(0, 1fr); gap: 8px; }
  .design-preview-area { grid-row: 1; }
  .design-controls { grid-row: 2; }
  .design-controls-title { padding: 13px 16px; }
  .design-controls-title h2 { font-size: 14px; margin-bottom: 3px; }
  .design-fields { padding: 0 16px 18px; }
  .design-group > summary { padding: 15px 16px; }
  .design-field > label:not(.design-toggle), .design-toggle { font-size: 12px; }
  .design-field > input, .design-field > textarea, .design-field > select, .design-image-field > input, .design-url > input { font-size: 16px; }
  .design-preview-toolbar { padding: 6px 10px; }
  .design-preview-toolbar strong { font-size: 11px; }
  .preview-device-buttons > button { width: 31px; height: 25px; }
  .design-browser-chrome { min-height: 27px; padding: 2px 8px; }
  .design-preview-footer { display: none; }
  .design-preview-hint { font-size: 9px; padding: 5px 9px; }
  .design-presets { padding: 0 16px 18px; gap: 10px; }
  .design-presets > button { padding: 10px; }
  .design-presets strong { font-size: 12px; }
  .design-presets small { font-size: 10px; }
  .design-color-row > label { font-size: 12px; }
  .design-color-row input[type=text] { width: 77px; font-size: 14px; }
}
@media (max-width: 420px) {
  .design-heading h1 { font-size: 18px; }
  .design-top-actions > .btn { padding: 7px 9px; font-size: 10px; }
  .design-top-actions > .btn > svg { display: none; }
  .design-store-name strong { max-width: 100px; font-size: 11px; }
  .design-store-info .badge { max-width: 80px; text-align: center; line-height: 1.25; white-space: normal; }
  .design-section-tabs > button { flex-direction: column; gap: 3px; padding: 7px 5px; font-size: 9px; }
}
@media (max-height: 700px) and (min-width: 801px) {
  .design-eyebrow, .design-heading p { display: none; }
  .design-view { gap: 8px; }
  .design-heading h1 { font-size: 21px; }
  .design-store-status { padding-block: 5px; }
  .design-preview-footer { display: none; }
}
@media (prefers-reduced-motion: reduce) { .design-group > summary > svg, .design-toggle i, .design-toggle i:after { transition: none; } }
</style>

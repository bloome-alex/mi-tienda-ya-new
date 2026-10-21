import { defaultDesign } from './design.js';
import { storeTextFields, storeTextSections } from './storeCopy.js';

const sectionLabels = Object.freeze({
  common:'Textos comunes', navbar:'Cabecera y navegación', shop:'Tienda, portada y catálogo', contact:'Contacto y WhatsApp',
  product:'Producto', cart:'Carrito', checkout:'Checkout', terms:'Términos', tracking:'Seguimiento del pedido', sections:'Secciones personalizadas'
});
const fixed = [
  ['navbar.title','navbar','Título personalizado de la cabecera','text',240],
  ['shop.announcement','shop','Texto de la barra de anuncio','text',240],['shop.heroTitle','shop','Título principal de portada','text',240],['shop.heroSubtitle','shop','Descripción de portada','textarea',240],['shop.heroButton','shop','Texto del botón de portada','text',240],
  ['shop.featuredTitle','shop','Título de productos destacados','text',240],['shop.catalogTitle','shop','Título del catálogo','text',240],['shop.footerText','shop','Mensaje al pie de la tienda','textarea',4000],
  ['product.addButton','product','Texto para agregar al carrito','text',240],['product.madeToOrderText','product','Aviso para productos a pedido','textarea',4000],['product.relatedTitle','product','Título de productos relacionados','text',240],['product.recommendationTitle','product','Título de recomendaciones','text',240],
  ['cart.title','cart','Título de la página del carrito','text',240],['cart.recommendationTitle','cart','Título de sugerencias del carrito','text',240],['cart.buttonText','cart','Texto para continuar al pago','text',240],['cart.emptyText','cart','Mensaje de carrito vacío','textarea',4000],['cart.trustMessage','cart','Mensaje de confianza del carrito','text',240],
  ['checkout.title','checkout','Título de la página de checkout','text',240],['checkout.trustMessage','checkout','Mensaje de confianza del checkout','text',240],['checkout.termsLabel','checkout','Texto de aceptación de términos','text',240],['checkout.thankYouTitle','checkout','Título de agradecimiento','text',240],['checkout.thankYouMessage','checkout','Mensaje de agradecimiento','textarea',4000],
  ['terms.title','terms','Título de la página de términos','text',240],['terms.intro','terms','Introducción de términos','textarea',4000],['terms.content','terms','Contenido de términos','textarea',20000],
];
const get = (value,path) => path.split('.').reduce((current,key)=>current?.[key],value);
const set = (value,path,next) => {
  const parts=path.split('.');let current=value;
  for(let i=0;i<parts.length-1;i++)current=current[Number.isInteger(Number(parts[i]))?Number(parts[i]):parts[i]];
  current[Number.isInteger(Number(parts.at(-1)))?Number(parts.at(-1)):parts.at(-1)]=next;
};
const field = (path,section,label,type='text',max=240,extra={}) => ({id:path,path,section,label,type,max,...extra});
// The design received from Vue is a reactive Proxy. structuredClone(Proxy) throws
// DataCloneError in browsers, which used to abort text edits before the parent
// v-model received an update. The storefront contract is JSON-serializable by
// design, so this creates a plain snapshot that is safe to modify and emit.
const cloneDesign = value => JSON.parse(JSON.stringify(value ?? {}));
const dynamic = (design) => {
  const result=[];
  design.navbar?.links?.forEach((item,index)=>result.push(field(`navbar.links.${index}.label`,'navbar',`Enlace del menú · ${item.label||item.target||index+1}`,'text',120,{dynamic:true})));
  design.shop?.heroSlides?.forEach((slide,index)=>{
    const prefix=`shop.heroSlides.${index}`;const name=slide.title||`Diapositiva ${index+1}`;
    result.push(field(`${prefix}.title`,'shop',`${name} · Título`,'text',240,{dynamic:true}),field(`${prefix}.subtitle`,'shop',`${name} · Descripción`,'textarea',240,{dynamic:true}),field(`${prefix}.buttonText`,'shop',`${name} · Texto del botón`,'text',240,{dynamic:true}));
  });
  design.sections?.forEach((item,index)=>{
    const prefix=`sections.${index}`,name=item.title||`Sección ${index+1}`;
    result.push(field(`${prefix}.title`,'sections',`${name} · Título`,'text',240,{dynamic:true}),field(`${prefix}.subtitle`,'sections',`${name} · Subtítulo`,'text',240,{dynamic:true}),field(`${prefix}.body`,'sections',`${name} · Texto`,'textarea',4000,{dynamic:true}),field(`${prefix}.buttonText`,'sections',`${name} · Texto del botón`,'text',240,{dynamic:true}));
    item.blocks?.forEach((block,blockIndex)=>{
      const bp=`${prefix}.blocks.${blockIndex}`,bn=block.title||`Complemento ${blockIndex+1}`;
      if(block.type!=='button')result.push(field(`${bp}.title`,'sections',`${name} · ${bn} · Título`,'text',240,{dynamic:true}));
      if(['text','benefit','faq','image'].includes(block.type))result.push(field(`${bp}.text`,'sections',`${name} · ${bn} · ${block.type==='faq'?'Respuesta':'Texto'}`,'textarea',4000,{dynamic:true}));
      if(block.type==='button')result.push(field(`${bp}.buttonText`,'sections',`${name} · ${bn} · Texto del botón`,'text',240,{dynamic:true}));
    });
    item.socialLinks?.forEach((link,linkIndex)=>result.push(field(`${prefix}.socialLinks.${linkIndex}.label`,'sections',`${name} · ${link.network||'Red social'} · Texto personalizado`,'text',120,{dynamic:true})));
  });
  return result;
};

export class DesignTextCatalog {
  constructor(design){this.design=design||{};}
  fields(){
    const copy=storeTextFields.map(item=>field(`copy.${item.key}`,item.section,item.label,item.type,item.max,{default:item.default,hasDefault:true,key:item.key}));
    const legacy=fixed.map(([path,section,label,type,max])=>field(path,section,label,type,max,{default:get(defaultDesign,path),hasDefault:true}));
    return [...copy,...legacy,...dynamic(this.design)];
  }
  sections(){return sectionLabels;}
  value(entry){return get(this.design,entry.path)??'';}
  update(entry,value){const next=cloneDesign(this.design);set(next,entry.path,value);return next;}
  edited(entry){return entry.hasDefault ? this.value(entry)!==entry.default : Boolean(this.value(entry));}
  static sectionLabels=sectionLabels;
}

export const designTextSections=sectionLabels;

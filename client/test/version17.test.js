import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDesign, createDesignSection, blockTemplate } from '../src/services/design.js';
import { DesignTextCatalog } from '../src/services/designTextCatalog.js';
import { StoreCopy } from '../src/services/storeCopy.js';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

function field(catalog,path){
  const entry=catalog.fields().find(item=>item.path===path);
  assert.ok(entry,`Falta el campo ${path} en Textos`);
  return entry;
}

test('Textos puede editar un diseño reactivo sin structuredClone sobre Proxy',()=>{
  const raw=normalizeDesign({});
  const reactiveLike=new Proxy(raw,{});
  const before=JSON.stringify(reactiveLike);
  const catalog=new DesignTextCatalog(reactiveLike);
  const next=catalog.update(field(catalog,'shop.heroTitle'),'Una portada nueva');
  assert.equal(next.shop.heroTitle,'Una portada nueva');
  assert.notEqual(JSON.stringify(next),before);
  assert.equal(raw.shop.heroTitle,'Tu estilo. Tus elegidos.');
});

test('cualquier campo publicado por Textos produce un borrador diferente y conserva el resto del diseño',()=>{
  const section=createDesignSection('faq','preguntas');
  section.blocks.push({...structuredClone(blockTemplate),id:'respuesta-extra',type:'text',title:'Más información',text:'Texto original'});
  section.socialLinks=[{id:'instagram',network:'instagram',label:'Seguinos',url:'https://instagram.com/tienda',enabled:true}];
  const design=normalizeDesign({sections:[section],shop:{heroSlides:[{id:'slide-1',image:'',title:'Slide',subtitle:'Bajada',buttonText:'Comprar',buttonTarget:'catalog'}]}});
  const catalog=new DesignTextCatalog(new Proxy(design,{}));
  for(const entry of catalog.fields()){
    const before=JSON.stringify(design);
    const value=entry.max===0?'':`Texto ${entry.path}`.slice(0,Math.max(1,Math.min(entry.max,80)));
    const next=catalog.update(entry,value);
    assert.notEqual(JSON.stringify(next),before,entry.path);
    assert.equal(new DesignTextCatalog(next).value(entry),value,entry.path);
    assert.equal(design.brand.primary,next.brand.primary,entry.path+' debe conservar el resto del diseño');
  }
});

test('Términos se actualiza desde Textos y queda detectable como cambio sin guardar',()=>{
  const design=normalizeDesign({terms:{enabled:true,title:'Términos anteriores',intro:'Intro',content:'Contenido anterior'}});
  const saved=JSON.stringify(design);
  let catalog=new DesignTextCatalog(new Proxy(design,{}));
  const title=catalog.update(field(catalog,'terms.title'),'Condiciones de compra');
  catalog=new DesignTextCatalog(new Proxy(title,{}));
  const next=catalog.update(field(catalog,'terms.content'),'Contenido actualizado\n\nSegundo párrafo');
  assert.equal(next.terms.title,'Condiciones de compra');
  assert.equal(next.terms.content,'Contenido actualizado\n\nSegundo párrafo');
  assert.notEqual(JSON.stringify(next),saved);
  const terms=source('views/public/TermsView.vue');
  assert.match(terms,/\{\{settings\.title\}\}/);
  assert.match(terms,/settings\.value\.content/);
});

test('secciones y complementos personalizados actualizan exactamente el contenido que renderiza la vista previa',()=>{
  const section=createDesignSection('faq','faq-principal');
  section.title='Preguntas';
  section.blocks=[{...structuredClone(blockTemplate),id:'faq-1',type:'faq',title:'¿Cómo compro?',text:'Respuesta anterior'}];
  let design=normalizeDesign({sections:[section]});
  let catalog=new DesignTextCatalog(new Proxy(design,{}));
  design=catalog.update(field(catalog,'sections.0.title'),'Preguntas de compra');
  catalog=new DesignTextCatalog(new Proxy(design,{}));
  design=catalog.update(field(catalog,'sections.0.blocks.0.title'),'¿Cómo hago mi pedido?');
  catalog=new DesignTextCatalog(new Proxy(design,{}));
  design=catalog.update(field(catalog,'sections.0.blocks.0.text'),'Elegí tus productos y confirmá el pedido.');
  assert.equal(design.sections[0].title,'Preguntas de compra');
  assert.equal(design.sections[0].blocks[0].title,'¿Cómo hago mi pedido?');
  assert.equal(design.sections[0].blocks[0].text,'Elegí tus productos y confirmá el pedido.');
  const sections=source('components/StoreSections.vue');
  const block=source('components/StoreDesignBlock.vue');
  assert.match(sections,/\{\{section\.title\}\}/);
  assert.match(block,/\{\{block\.title/);
  assert.match(block,/\{\{block\.text\}\}/);
});

test('los textos del registro copy cambian el valor consumido por la vista previa',()=>{
  const design=normalizeDesign({});
  const catalog=new DesignTextCatalog(new Proxy(design,{}));
  const next=catalog.update(field(catalog,'copy.checkoutConfirm'),'Finalizar mi compra');
  const copy=new StoreCopy(()=>next);
  assert.equal(copy.text('checkoutConfirm'),'Finalizar mi compra');
});

test('Diseño sigue derivando el botón Guardar de cualquier diferencia del draft y Textos reemplaza el draft completo',()=>{
  const view=source('views/seller/DesignView.vue');
  const editor=source('components/editor/DesignCopyEditor.vue');
  assert.match(view,/JSON\.stringify\(draft\.value\)!==saved\.value/);
  assert.match(view,/<DesignCopyEditor[^>]+v-model="draft"/);
  assert.match(view,/:disabled="saving \|\| publishing \|\| !dirty"/);
  assert.match(editor,/emit\('update:modelValue',catalog\.value\.update\(field,value\)\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDesign } from '../src/utils/design.js';
import { auditChanges, auditFieldLabel } from '../src/services/AuditService.js';
import { auditLabels, auditValue } from '../../client/src/services/audit.js';
import { defaultDesign, navItemTemplate, socialLinkTemplate, sectionTemplate, createDesignSection, storeTextFields } from '../../client/src/services/design.js';

const social = (links=[]) => ({...createDesignSection('social','social-one'),socialLinks:links});
const link = (id='instagram',extra={}) => ({...socialLinkTemplate,id,network:'instagram',label:'Nuestro Instagram',url:'https://www.instagram.com/ejemplo/',...extra});
const nav = (id='catalog',extra={}) => ({...navItemTemplate,id,target:'catalog',label:'Productos',...extra});

test('diseños anteriores conservan identidad y los títulos vacíos no se rellenan al guardar',()=>{
  const old=validateDesign({brand:{logo:'https://example.test/logo.png'},shop:{heroTitle:'Marca anterior'}});
  assert.equal(old.navbar.showTitle,false); assert.equal(old.shop.heroTitle,'Marca anterior');
  assert.equal(old.navbar.links.length,2); assert.equal(old.copy.catalogSearch,'Buscar productos');
  const next=validateDesign({navbar:{showTitle:true,useStoreName:false,title:''},copy:{contactTitle:'',checkoutConfirm:'Reservar mi pedido'}});
  assert.equal(next.navbar.title,''); assert.equal(next.navbar.useStoreName,false);
  assert.equal(next.copy.contactTitle,''); assert.equal(next.copy.checkoutConfirm,'Reservar mi pedido');
  assert.equal(validateDesign({navbar:{links:[]}}).navbar.links.length,0);
  const another=validateDesign({}); next.navbar.links[0].label='Sólo esta tienda';
  assert.equal(another.navbar.links[0].label,'Tienda'); assert.equal(defaultDesign.navbar.links[0].label,'Tienda');
});

test('cabecera valida alturas, tamaño de logos, enlaces ordenables y referencias a secciones',()=>{
  const design=validateDesign({navbar:{height:220,mobileHeight:48,logoWidth:480,logoHeight:24,mobileLogoWidth:24,mobileLogoHeight:144,logoShape:'circle',links:[nav('catalog'),nav('social',{target:'social',label:'Seguinos'}),nav('custom',{target:'section',sectionId:'historia',label:'Historia'})]}});
  assert.equal(design.navbar.links[2].sectionId,'historia');
  for(const input of [
    {navbar:{height:221}},{navbar:{mobileHeight:47}},{navbar:{logoShape:'triangle'}},{navbar:{logoFit:'stretch'}},
    {navbar:{links:[nav('same'),nav('same')]}},{navbar:{links:[nav('bad/id')]}},
    {navbar:{links:[nav('custom',{target:'section'})]}},{navbar:{links:[nav('custom',{target:'section',sectionId:'../../secret'})]}},
    {navbar:{links:[nav('bad',{target:'javascript:alert(1)'})]}},
    {navbar:{links:Array.from({length:13},(_,i)=>nav('item-'+i))}},
    {navbar:{links:[nav('long',{label:'x'.repeat(121)})]}},{navbar:{links:null}},
  ]) assert.throws(()=>validateDesign(input));
  assert.equal(validateDesign({navbar:{links:[nav('later',{target:'section',enabled:false})]}}).navbar.links[0].sectionId,'');
});

test('redes sociales guardan selección, orden y estilo sin aceptar enlaces ejecutables ni credenciales',()=>{
  const input={sections:[social([link(),link('youtube',{network:'youtube',label:'Tutoriales',url:'https://www.youtube.com/@ejemplo'}),link('later',{network:'website',enabled:false,url:''})])]};
  const saved=validateDesign(input); assert.equal(saved.sections[0].type,'social'); assert.equal(saved.sections[0].socialLinks.length,3);
  assert.equal(saved.sections[0].socialLinks[2].enabled,false);
  for(const url of ['javascript:alert(1)','data:text/html,<script>','//example.test/red','https://user:password@example.test/red','https://example.test/espacio no','https://example.test\\red','/demo/remera.svg']) assert.throws(()=>validateDesign({sections:[social([link('invalid',{url})])]}),url);
  for(const extra of [{network:'unknown'},{label:'x'.repeat(121)},{url:''}]) assert.throws(()=>validateDesign({sections:[social([link('invalid',extra)])]}));
  assert.throws(()=>validateDesign({sections:[social([link('same'),link('same')])]}));
  assert.throws(()=>validateDesign({sections:[social(Array.from({length:13},(_,i)=>link('red-'+i)))]}));
  assert.throws(()=>validateDesign({sections:[{...social(),socialIconSize:65}]}));
  assert.equal(validateDesign({sections:[{...social(),socialVariant:'icons',socialNewTab:false}]}).sections[0].socialNewTab,false);
});

test('textos de tienda respetan sus límites, tipos y vacíos y no comparten datos con otra tienda',()=>{
  for(const field of storeTextFields){
    assert.equal(validateDesign({copy:{[field.key]:''}}).copy[field.key],'',field.key);
    assert.throws(()=>validateDesign({copy:{[field.key]:null}}),field.key);
    assert.throws(()=>validateDesign({copy:{[field.key]:'x'.repeat(field.max+1)}}),field.key);
  }
  const literal='<img src=x onerror=alert(1)>'; assert.equal(validateDesign({copy:{contactTitle:literal}}).copy.contactTitle,literal);
  assert.equal(validateDesign({copy:{unknownText:'No se publica'}}).copy.unknownText,undefined);
  assert.throws(()=>validateDesign(JSON.parse('{"copy":{"__proto__":{"polluted":true}}}')));
});

test('alineación y dirección son independientes por zona, página, sección y complemento',()=>{
  const design=validateDesign({brand:{textDirection:'rtl'},shop:{catalogAlign:'left',catalogDirection:'ltr',categoryNavigation:'navbar'},product:{textAlign:'right',textDirection:'auto'},sections:[{...sectionTemplate,id:'text',alignment:'center',textDirection:'inherit'}]});
  assert.equal(design.brand.textDirection,'rtl'); assert.equal(design.shop.catalogAlign,'left'); assert.equal(design.product.textDirection,'auto');
  for(const input of [{brand:{textDirection:'inherit'}},{shop:{catalogDirection:'right'}},{cart:{textAlign:'rtl'}},{checkout:{textDirection:'sideways'}},{shop:{categoryNavigation:'popup'}}]) assert.throws(()=>validateDesign(input));
});

test('auditoría describe textos, cabecera y redes por identificador estable con valores españoles',()=>{
  for(const section of Object.values(defaultDesign)) if(section && !Array.isArray(section)) for(const key of Object.keys(section)) assert.ok(Object.hasOwn(auditLabels,key),'Etiqueta: '+key);
  for(const template of [navItemTemplate,socialLinkTemplate,sectionTemplate]) for(const key of Object.keys(template)) assert.ok(Object.hasOwn(auditLabels,key),'Etiqueta: '+key);
  const before={design:validateDesign({navbar:{links:[nav('one'),nav('two',{label:'Novedades'})]},sections:[social([link('one'),link('two',{label:'Videos',network:'youtube',url:'https://www.youtube.com/@antes'})])]})};
  const after=structuredClone(before); after.design.navbar.links.reverse(); after.design.navbar.links[0].label='Lo nuevo';
  after.design.sections[0].socialLinks.reverse(); after.design.sections[0].socialLinks[0].url='https://www.youtube.com/@despues'; after.design.copy.contactTitle='Conversemos';
  const changes=auditChanges(before,after);
  assert.ok(changes.some(change=>change.field==='design.navbar.links.order' && change.label.includes('Orden de los enlaces')));
  assert.ok(changes.some(change=>change.field.endsWith('.socialLinks.order') && change.label.includes('Orden de las redes sociales')));
  assert.equal(changes.find(change=>change.field.endsWith('.socialLinks.0.url')).before,'https://www.youtube.com/@antes');
  assert.match(changes.find(change=>change.field.endsWith('.socialLinks.0.url')).label,/Red social.*Videos.*Enlace/);
  assert.equal(auditFieldLabel('design.copy.contactTitle'),'Diseño · Textos de la tienda · Título de contacto');
  assert.equal(auditValue('rtl','textDirection'),'De derecha a izquierda'); assert.equal(auditValue('navbar','categoryNavigation'),'Submenús en la cabecera');
});

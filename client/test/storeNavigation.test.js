import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, createDesignSection } from '../src/services/design.js';
import { StoreNavigationService as Navigation, StoreTextLayout } from '../src/services/storeNavigation.js';

test('la marca respeta título vacío y sólo logo sin reponer el nombre administrativo',()=>{
  const design=normalizeDesign({navbar:{useStoreName:false,title:'',showTitle:true}});
  assert.equal(Navigation.title(design.navbar,'Feria Central'),'');
  assert.equal(Navigation.title({...design.navbar,title:'  Otra identidad  '},'Feria Central'),'Otra identidad');
  assert.equal(Navigation.title({...design.navbar,useStoreName:true},'Feria Central'),'Feria Central');
  assert.equal(Navigation.title({...design.navbar,showTitle:false,useStoreName:true},'Feria Central'),'');
  const migrated=normalizeDesign({brand:{logo:'/uploads/logo.png'}});
  assert.equal(Navigation.title(migrated.navbar,'Feria Central'),'');
});

test('la vista previa sólo muestra categorías cuya cadena completa es visible, en cualquier orden',()=>{
  const nodes=[
    {_id:'root',active:true},{_id:'level2',parentId:'root',active:true},{_id:'level3',parentId:'level2',active:true},{_id:'level4',parentId:'level3',active:true},
    {_id:'hidden',parentId:'root',active:false},{_id:'hidden-child',parentId:'hidden',active:true},{_id:'hidden-grandchild',parentId:'hidden-child',active:true},
    {_id:'orphan',parentId:'missing',active:true},{_id:'orphan-child',parentId:'orphan',active:true},
    {_id:'archived',parentId:'root',active:true,archived:true},{_id:'archived-child',parentId:'archived',active:true},
    {_id:'cycle-a',parentId:'cycle-b',active:true},{_id:'cycle-b',parentId:'cycle-a',active:true},{_id:'cycle-child',parentId:'cycle-a',active:true},
    {_id:'populated',parentId:{_id:'level4'},active:true}
  ];
  for(const input of [nodes,[...nodes].reverse()]){
    assert.deepEqual(Navigation.visibleCategories(input).map(node=>node._id).sort(),['level2','level3','level4','populated','root']);
  }
});

test('el navbar resuelve secciones reales, conserva la tienda y oculta destinos deshabilitados',()=>{
  const design=normalizeDesign(),base={path:'/t/feria-central',query:{preview:'012345678901234567890123'}},store={contact:{email:'feria@example.test'}};
  const context={base,design,store,products:[{active:true,featured:true}]};
  const item=(target,extra={})=>({enabled:true,label:'Ir',target,...extra});
  assert.deepEqual(Navigation.destination(item('catalog'),context),{...base,hash:'#catalogo'});
  assert.deepEqual(Navigation.destination(item('contact'),context),{...base,hash:'#store-contact'});
  assert.deepEqual(Navigation.destination(item('featured'),context),{...base,hash:'#destacados'});
  assert.equal(Navigation.destination(item('terms'),context),null);
  design.terms.enabled=true;
  assert.deepEqual(Navigation.destination(item('terms'),context),{...base,path:base.path+'/terminos'});
  design.shop.showCatalog=false;
  assert.equal(Navigation.destination(item('catalog'),context),null);
  assert.equal(Navigation.destination(item('home',{enabled:false}),context),null);
  assert.equal(Navigation.destination(item('home',{label:'  '}),context),null);
  assert.equal(Navigation.destination(item('section',{sectionId:'missing'}),context),null);
  const social=createDesignSection('social','social-one');design.sections=[social];
  assert.equal(Navigation.destination(item('social'),context),null);
  social.socialLinks=[{enabled:true,url:'https://www.instagram.com/feria',network:'instagram'}];
  assert.deepEqual(Navigation.destination(item('social'),context),{...base,hash:'#store-section-social-one'});
  assert.deepEqual(Navigation.destination(item('section',{sectionId:'social-one'}),context),{...base,hash:'#store-section-social-one'});
  social.enabled=false;
  assert.equal(Navigation.destination(item('social'),context),null);
  assert.equal(Navigation.destination(item('section',{sectionId:'social-one'}),context),null);
});

test('los enlaces sociales excluyen esquemas ejecutables, URLs con credenciales y enlaces desactivados',()=>{
  const urls=['https://instagram.com/feria','http://example.test/path','javascript:alert(1)','data:text/html,test','https://usuario:clave@example.test/','https://','', '/relative'];
  const section={socialLinks:urls.map((url,index)=>({id:String(index),network:'website',url,enabled:true})).concat({id:'off',url:'https://example.test',enabled:false})};
  assert.deepEqual(Navigation.socialLinks(section).map(item=>item.url),urls.slice(0,2));
  assert.deepEqual(StoreTextLayout.style('right','rtl'),{textAlign:'right',direction:'rtl'});
  assert.equal(StoreTextLayout.direction('auto'),'auto');
  assert.equal(StoreTextLayout.direction('inherit'),undefined);
  assert.deepEqual(StoreTextLayout.style('unset; color:red','bad'),{textAlign:'inherit'});
});

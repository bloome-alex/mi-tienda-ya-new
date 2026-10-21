import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDesign, createDesignSection } from '../src/services/design.js';
import { DesignTextCatalog } from '../src/services/designTextCatalog.js';
import { editorGroups } from '../src/components/editor/fields.js';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('Textos centraliza copy, cabecera, páginas, carrusel y contenido anidado sin mutar el diseño original',()=>{
  const design=normalizeDesign({navbar:{links:[{id:'catalog',target:'catalog',label:'Productos',enabled:true}]}});
  design.shop.heroSlides=[{id:'slide-1',image:'',title:'Colección',subtitle:'Nueva temporada',buttonText:'Ver',buttonTarget:'catalog'}];
  const social=createDesignSection('social','social-1');social.title='Seguinos';social.socialLinks=[{id:'instagram',network:'instagram',label:'Instagram de la feria',url:'https://instagram.com/feria',enabled:true}];
  design.sections=[social];
  const catalog=new DesignTextCatalog(design),fields=catalog.fields(),paths=new Set(fields.map(field=>field.path));
  for(const path of ['copy.catalogSearch','navbar.title','navbar.links.0.label','shop.heroTitle','shop.heroSlides.0.title','product.addButton','cart.title','checkout.termsLabel','terms.content','sections.0.title','sections.0.socialLinks.0.label']) assert.ok(paths.has(path),path);
  const field=fields.find(item=>item.path==='shop.heroTitle'),next=catalog.update(field,'Una tienda distinta');
  assert.equal(next.shop.heroTitle,'Una tienda distinta');assert.notEqual(next,design);assert.notEqual(next.shop,design.shop);assert.notEqual(design.shop.heroTitle,'Una tienda distinta');
});

test('las pestañas visuales ya no exponen editores duplicados para textos dinámicos',()=>{
  const designView=source('views/seller/DesignView.vue');
  assert.match(designView,/DesignCopyEditor[^>]+v-model="draft"/);
  assert.match(designView,/group\.items\.filter\(item=>!\['text','textarea'\]\.includes\(item\.type\)\)/);
  assert.doesNotMatch(source('components/editor/DesignNavigationEditor.vue'),/v-model="item\.label"/);
  assert.doesNotMatch(source('components/editor/DesignSocialEditor.vue'),/v-model="item\.label"/);
  assert.doesNotMatch(source('components/editor/DesignSlidesEditor.vue'),/key:'title'.*type:'text'/);
  const sections=source('components/editor/DesignSectionsEditor.vue');
  assert.doesNotMatch(sections,/sectionFields[\s\S]*?key:'title'.*?type:'text'/);
});

test('las categorías de cabecera abren por hover y el panel desplegable queda dentro del catálogo',()=>{
  const navigation=source('components/StoreCategoryNavigation.vue');
  assert.match(navigation,/@mouseenter="openCategory\(item\)"/);
  assert.match(navigation,/class="category-inline-panel"/);
  assert.doesNotMatch(navigation,/category-drawer-layer/);
  assert.doesNotMatch(navigation,/position:fixed;inset:0/);
});

test('el selector claro y oscuro fuerza centrado vertical dentro de la cabecera',()=>{
  const toggle=source('components/StoreThemeToggle.vue');
  assert.match(toggle,/align-items:center/);assert.match(toggle,/justify-content:center/);assert.match(toggle,/align-self:center/);assert.match(toggle,/padding:0/);
});


test('el ABM de categorías muestra sólo raíces al inicio y no parte una rama desplegada entre páginas',()=>{
  const view=source('views/seller/CategoriesView.vue');
  assert.match(view,/tree\.value\.visibleRows\(expanded\.value, search\.value\)/);
  assert.match(view,/:limit="Math\.max\(rows\.length,1\)"/);
  assert.match(view,/aria-expanded="isExpanded\(row\)"/);
});


test('Textos cubre cada campo escrito que se oculta de las pestanas visuales',()=>{
  const design=normalizeDesign({});const paths=new Set(new DesignTextCatalog(design).fields().map(field=>field.path));const missing=[];
  for(const [section,groups] of Object.entries(editorGroups))for(const group of groups)for(const field of group.items||[])if(['text','textarea'].includes(field.type)&&!paths.has(section+'.'+field.key))missing.push(section+'.'+field.key);
  assert.deepEqual(missing,[]);
});

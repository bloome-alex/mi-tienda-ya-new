import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue';
import { normalizeDesign, defaultDesign, wallpaperSpecs, storeTextFields, socialNetworks, createDesignSection } from '../src/services/design.js';
import { PREVIEW_MESSAGE, isTrustedPreviewMessage, previewSectionPath, readPreviewLocation } from '../src/services/previewProtocol.js';
import { editorGroups, wallpaperFields } from '../src/components/editor/fields.js';
import { validateImageFile, orientedImageDimensions, validateWallpaperDimensions } from '../src/components/editor/imageValidation.js';

// Exercise the actual SFC setup with memory-only boundaries. No browser, auth,
// HTTP server, or production API implementation is replaced in the application.
const { descriptor } = parse(readFileSync(new URL('../src/views/seller/DesignView.vue', import.meta.url), 'utf8'));
const setupSource = compileScript(descriptor, { id: 'designer-state-test', genDefaultAs: 'EditorComponent' }).content.replace(/^import .*;\n/gm, '');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function editorFixture(t, { choice = 'cancel', put, post } = {}) {
  const server = { _id: '64aaaaaaaaaaaaaaaaaaaaaa', name: 'Tienda de prueba', slug: 'tienda-prueba', description: 'Descripción inicial', active: false, design: normalizeDesign({}) };
  const calls = [], messages = [], listeners = new Map(), cleanup = [], scope = effectScope();
  const workspace = reactive({ activeStoreId: server._id, stores: [clone(server)] });
  const environment = {
    ref, reactive, computed, watch, nextTick,
    onMounted() {}, onUnmounted(callback) { cleanup.push(callback); }, onBeforeRouteLeave() {},
    api: {
      async get() { return clone(server); }, async list() { return { data: [], meta: { total: 0 } }; },
      async put(path, body) { calls.push({ path, body: clone(body) }); if (put) await put(path, body, server); if (path.endsWith('/design')) server.design = clone(body.design); else Object.assign(server, clone(body)); return clone(server); },
      async post(path, body, options) { calls.push({ path, body, options }); if (!post) throw new Error('Unexpected upload in test'); return await post(path, body, options); }
    },
    workspace, registerStoreSwitchGuard() { return () => {}; },
    normalizeDesign, defaultDesign, wallpaperSpecs, storeTextFields, socialNetworks,
    notify: { success(message) { messages.push(message); }, error(message) { messages.push(message); }, info(message) { messages.push(message); } },
    confirmDialog: async () => true, unsavedChangesDialog: async () => choice,
    PREVIEW_MESSAGE, isTrustedPreviewMessage, previewSectionPath, readPreviewLocation,
    editorGroups, wallpaperFields, validateImageFile, orientedImageDimensions, validateWallpaperDimensions,
    Icon: {}, DesignGroup: {}, DesignField: {}, DesignSectionsEditor: {}, DesignSlidesEditor: {}, DesignNavigationEditor: {}, DesignCopyEditor: {},
    window: { addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name) { listeners.delete(name); } },
    document: { getElementById() { return null; } }, location: { origin: 'https://preview.example' },
    ResizeObserver: class { disconnect() {} observe() {} }
  };
  const component = new Function(...Object.keys(environment), setupSource + '\nreturn EditorComponent;')(...Object.values(environment));
  const view = scope.run(() => component.setup({}, { expose() {} }));
  t.after(() => { for (const callback of cleanup) callback(); scope.stop(); });
  await view.load();
  return { view, server, workspace, calls, messages, listeners };
}

test('guardar datos generales actualiza nombre, enlace del iframe y navbar sin enviar diseño sin cambios', async t => {
  const { view, workspace, calls } = await editorFixture(t);
  view.general.value.name = 'Mi nueva marca'; view.general.value.slug = 'mi-nueva-marca';
  assert.equal(view.dirty.value, true);
  assert.equal(await view.save(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path.endsWith('/design'), false);
  assert.equal(view.dirty.value, false);
  assert.equal(workspace.stores[0].name, 'Mi nueva marca');
  assert.equal(view.frameSource.value, '/t/mi-nueva-marca?preview=64aaaaaaaaaaaaaaaaaaaaaa');
});

test('un fallo de datos generales conserva ese borrador y el diseño ya guardado no se reenvía al reintentar', async t => {
  let fail = true;
  const { view, calls } = await editorFixture(t, { put: async path => { if (fail && !path.endsWith('/design')) throw new Error('La dirección ya existe.'); } });
  view.draft.value.shop.heroTitle = 'Una colección nueva'; view.general.value.name = 'Marca pendiente';
  assert.equal(await view.save(), false);
  assert.equal(view.changedDesign.value, false);
  assert.equal(view.changedGeneral.value, true);
  assert.equal(view.general.value.name, 'Marca pendiente');
  assert.equal(view.draft.value.shop.heroTitle, 'Una colección nueva');
  fail = false;
  assert.equal(await view.save(), true);
  assert.equal(calls.filter(call => call.path.endsWith('/design')).length, 1);
});

test('guardar antes de salir espera el servidor y mantiene el editor si aparecieron cambios posteriores', async t => {
  const waiting = deferred();
  const { view } = await editorFixture(t, { choice: 'save', put: () => waiting.promise });
  view.draft.value.shop.heroTitle = 'Snapshot enviado';
  const leaving = view.mayLeave();
  await nextTick();
  assert.equal(view.saving.value, true);
  view.draft.value.shop.heroTitle = 'Edición más reciente';
  waiting.resolve();
  assert.equal(await leaving, false);
  assert.equal(view.draft.value.shop.heroTitle, 'Edición más reciente');
  assert.equal(JSON.parse(view.saved.value).shop.heroTitle, 'Snapshot enviado');
  assert.equal(view.dirty.value, true);
});

test('seguir editando cancela la salida y conserva tanto diseño como datos generales', async t => {
  const { view, calls } = await editorFixture(t, { choice: 'cancel' });
  view.draft.value.shop.heroTitle = 'Sin guardar'; view.general.value.description = 'Descripción pendiente';
  assert.equal(await view.mayLeave(), false);
  assert.equal(view.draft.value.shop.heroTitle, 'Sin guardar');
  assert.equal(view.general.value.description, 'Descripción pendiente');
  assert.equal(calls.length, 0);
});

test('descartar limpia ambas clases de cambios, aborta cargas y no acepta una respuesta tardía', async t => {
  const uploaded = deferred(); let signal;
  const { view } = await editorFixture(t, { choice: 'discard', post: (_path, _form, options) => { signal = options.signal; return uploaded.promise; } });
  view.general.value.name = 'Nombre que se descarta'; view.draft.value.shop.heroTitle = 'Texto que se descarta';
  const request = view.requestUpload({ file: new File(['bytes'], 'logo.png', { type: 'image/png' }), target: view.draft.value.brand, field: 'logo', scope: 'brand' });
  assert.equal(view.pendingUploads.value, 1);
  assert.equal(await view.mayLeave(), true);
  assert.equal(signal.aborted, true);
  assert.equal(view.dirty.value, false);
  uploaded.resolve([{ url: '/uploads/images/late.webp' }]);
  await request;
  assert.equal(view.draft.value.brand.logo, '');
  assert.equal(view.general.value.name, 'Tienda de prueba');
  assert.equal(view.dirty.value, false);
});

test('guardar con una carga pendiente incluye su URL sólo cuando finaliza y entonces permite salir', async t => {
  const uploaded = deferred();
  const { view, calls } = await editorFixture(t, { choice: 'save', post: () => uploaded.promise });
  view.requestUpload({ file: new File(['bytes'], 'logo.png', { type: 'image/png' }), target: view.draft.value.brand, field: 'logo', scope: 'brand' });
  const leaving = view.mayLeave();
  await nextTick();
  assert.equal(view.saving.value, true);
  assert.equal(calls.filter(call => call.path.endsWith('/design')).length, 0);
  uploaded.resolve([{ url: '/uploads/images/completed.webp' }]);
  assert.equal(await leaving, true);
  assert.equal(calls.find(call => call.path.endsWith('/design')).body.design.brand.logo, '/uploads/images/completed.webp');
  assert.equal(view.dirty.value, false);
});

test('los ACK repetidos preservan los controles generales y una navegación real sí sincroniza', async t => {
  const { view } = await editorFixture(t);
  view.frameLoaded.value=true;
  for (const tab of ['brand', 'navbar', 'copy', 'sections']) {
    view.selectSection(tab);
    view.acceptPreviewLocation({ path: '/t/tienda-prueba' }, true);
    view.acceptPreviewLocation({ path: '/t/tienda-prueba' });
    assert.equal(view.section.value, tab);
  }
  view.acceptPreviewLocation({ path: '/t/tienda-prueba/terminos' });
  assert.equal(view.section.value, 'terms');
  assert.equal(view.previewPage.value.section, 'terms');
});

test('guarda un título de cabecera vacío, textos vacíos, dirección y redes sin cambiar el nombre de la tienda', async t => {
  const { view, server, calls } = await editorFixture(t);
  const social=createDesignSection('social','social-principal');
  social.socialLinks=[{id:'instagram',network:'instagram',label:'Seguinos',url:'https://www.instagram.com/tienda/',enabled:true}];
  social.textDirection='rtl';social.alignment='right';view.draft.value.sections.push(social);
  Object.assign(view.draft.value.navbar,{title:'',useStoreName:false,showTitle:true,height:120,logoShape:'circle'});
  view.draft.value.navbar.links=[{id:'redes',target:'section',sectionId:social.id,label:'Nuestra comunidad',enabled:true}];
  view.draft.value.copy.contactTitle='';view.draft.value.copy.checkoutConfirm='Crear mi pedido';
  view.draft.value.shop.categoryNavigation='navbar';view.draft.value.shop.catalogDirection='rtl';
  assert.equal(await view.save(),true);
  assert.equal(calls.length,1);assert.equal(calls[0].path.endsWith('/design'),true);
  assert.equal(server.name,'Tienda de prueba');assert.equal(server.design.navbar.title,'');assert.equal(server.design.navbar.useStoreName,false);
  assert.equal(server.design.copy.contactTitle,'');assert.equal(server.design.copy.checkoutConfirm,'Crear mi pedido');
  assert.equal(server.design.sections[0].socialLinks[0].url,'https://www.instagram.com/tienda/');
  assert.equal(server.design.shop.categoryNavigation,'navbar');assert.equal(server.design.shop.catalogDirection,'rtl');
  assert.equal(view.dirty.value,false);
});

test('una red visible sin URL impide guardar, conserva el borrador y permite corregirla', async t => {
  const { view, calls } = await editorFixture(t);
  const social=createDesignSection('social','social-pendiente');
  social.socialLinks=[{id:'perfil',network:'instagram',label:'',url:'',enabled:true}];
  view.draft.value.sections.push(social);
  assert.equal(await view.save(),false);assert.equal(calls.length,0);
  assert.equal(view.section.value,'sections');assert.equal(view.dirty.value,true);
  assert.match(view.saveError.value,/Instagram/);
  view.draft.value.sections[0].socialLinks[0].url='javascript:alert(1)';
  assert.equal(await view.save(),false);assert.equal(calls.length,0);assert.match(view.saveError.value,/HTTP o HTTPS/);
  view.draft.value.sections[0].socialLinks[0].url='https://instagram.com/mi-tienda';
  assert.equal(await view.save(),true);assert.equal(calls.length,1);
});

test('un enlace de cabecera sin sección seleccionada dirige al grupo de navegación y no envía cambios incompletos', async t => {
  const { view, calls } = await editorFixture(t);
  view.draft.value.navbar.links.push({id:'personalizada',target:'section',sectionId:'',label:'Nuestra historia',enabled:true});
  assert.equal(await view.save(),false);assert.equal(calls.length,0);
  assert.equal(view.section.value,'navbar');assert.equal(view.expandedGroups.navbar,'links');
  assert.match(view.saveError.value,/Nuestra historia/);
  view.draft.value.navbar.links.at(-1).enabled=false;
  assert.equal(await view.save(),true);
});

test('los límites de cabecera y textos se verifican antes de enviar y mantienen las ediciones', async t => {
  const { view, calls } = await editorFixture(t);
  view.draft.value.navbar.height=221;
  assert.equal(await view.save(),false);assert.equal(view.section.value,'navbar');assert.equal(view.expandedGroups.navbar,'size');
  view.draft.value.navbar.height=100;
  const field=storeTextFields.find(field=>field.key==='contactTitle');
  view.draft.value.copy[field.key]='x'.repeat(field.max+1);
  assert.equal(await view.save(),false);assert.equal(view.section.value,'copy');assert.equal(calls.length,0);
  assert.equal(view.draft.value.copy[field.key].length,field.max+1);assert.equal(view.dirty.value,true);
});

test('beforeunload se agrega sólo con cambios y se retira al descartar', async t => {
  const { view, listeners } = await editorFixture(t, { choice: 'discard' });
  assert.equal(listeners.has('beforeunload'), false);
  view.general.value.description = 'Texto pendiente';
  assert.equal(listeners.has('beforeunload'), true);
  let prevented = false; const event = { preventDefault() { prevented = true; }, returnValue: '' };
  listeners.get('beforeunload')(event);
  assert.equal(prevented, true); assert.equal(event.returnValue, true);
  await view.mayLeave();
  assert.equal(listeners.has('beforeunload'), false);
});

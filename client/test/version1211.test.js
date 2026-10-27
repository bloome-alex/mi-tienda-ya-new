import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

function documentWithMeta(values){
  return { querySelector(selector){
    const match=selector.match(/^meta\[name="([^"]+)"\]$/);
    if(!match)return null;
    const value=values[match[1]];
    return value===undefined?null:{content:String(value)};
  }};
}

async function loadHost(values,tag){
  globalThis.document=documentWithMeta(values);
  globalThis.location={origin:'https://www.mitiendaya.com.ar'};
  return import(`../src/services/storeHost.js?case=${tag}-${Date.now()}`);
}

test('una tienda cargada por /t/:slug usa siempre las rutas con prefijo aunque tenga dominio principal',async()=>{
  const host=await loadHost({
    'mty-store-slug':'kagewear',
    'mty-store-url':'https://kagewear.example',
    'mty-store-path-url':'https://www.mitiendaya.com.ar/t/kagewear',
    'mty-store-hosted':'0',
    'mty-platform-url':'https://www.mitiendaya.com.ar',
  },'path');
  assert.equal(host.isHostedStorefront(),false);
  assert.equal(host.storePathFor('kagewear'),'/t/kagewear');
  assert.equal(host.storePathFor('kagewear','/carrito'),'/t/kagewear/carrito');
  assert.equal(host.hostedStorefront.pathUrl,'https://www.mitiendaya.com.ar/t/kagewear');
});

test('una tienda resuelta por dominio conserva rutas limpias del hostname',async()=>{
  const host=await loadHost({
    'mty-store-slug':'kagewear',
    'mty-store-url':'https://kagewear.example',
    'mty-store-path-url':'https://www.mitiendaya.com.ar/t/kagewear',
    'mty-store-hosted':'1',
    'mty-platform-url':'https://www.mitiendaya.com.ar',
  },'host');
  assert.equal(host.isHostedStorefront(),true);
  assert.equal(host.storePathFor('kagewear'),'/');
  assert.equal(host.storePathFor('kagewear','/carrito'),'/carrito');
});

test('el diseñador mantiene la vista previa sobre /t/:slug y no sobre el dominio personalizado',()=>{
  const design=source('views/seller/DesignView.vue');
  const protocol=source('services/previewProtocol.js');
  assert.match(design,/previewSectionPath\(target,store\.value\.slug/);
  assert.match(design,/frameSource\.value=`\$\{path\}\?preview=/);
  assert.match(protocol,/const base = `\/t\/\$\{slug\}`/);
});

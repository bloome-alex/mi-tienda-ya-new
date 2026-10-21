import test from 'node:test';
import assert from 'node:assert/strict';
import { CartService } from '../src/services/cart.js';
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const product = { _id:'111111111111111111111111',name:'Cuaderno',type:'physical',active:true,stock:2,price:1000,images:[],variants:[] };

test('el carrito evita sumar más unidades físicas que el stock y permite productos a pedido',()=>{
  const cart=new CartService('stock-test');cart.add(product,null,2);
  assert.throws(()=>cart.add(product,null,1),/stock/);
  assert.equal(cart.count,2);
  cart.add({...product,_id:'222222222222222222222222',madeToOrder:true,stock:0},null,4);
  assert.equal(cart.count,6);
});
test('las variantes se mantienen separadas y se usa su precio propio',()=>{
  const cart=new CartService('variant-test');const p={...product,variants:[{id:'rojo',name:'Rojo',stock:4,price:1300},{id:'azul',name:'Azul',stock:4}]};
  assert.throws(()=>cart.add(p,null,1),/variante/);
  cart.add(p,p.variants[0],2);cart.add(p,p.variants[1],1);
  assert.equal(cart.state.items.length,2);assert.equal(cart.subtotal,3600);
});
test('una actualización detecta bajas y variantes removidas sin ocultar un fallo de conexión',async()=>{
  const cart=new CartService('refresh-test');cart.add(product,null,1);
  await cart.refresh(async()=>({...product,price:1400,active:false}));
  assert.equal(cart.state.items[0].price,1400);assert.equal(cart.state.items[0].unavailable,true);
  await assert.rejects(cart.refresh(async()=>{throw Object.assign(new Error('Sin conexión'),{status:0});}),/conexión/);
});
test('la clave de checkout se conserva para reintentos y recargas, y cambia para una compra modificada',()=>{
  const cart=new CartService('retry-test');cart.add(product,null,1);
  const first=cart.checkoutKey('pedido-a');assert.equal(cart.checkoutKey('pedido-a'),first);
  const reloaded=new CartService('retry-test');assert.equal(reloaded.checkoutKey('pedido-a'),first);
  assert.notEqual(reloaded.checkoutKey('pedido-b'),first);
  const isolated=new CartService('otra-tienda');assert.equal(isolated.count,0);
});

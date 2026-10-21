import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreCopy, storeTextFields, defaultStoreCopy } from '../src/services/storeCopy.js';

test('StoreCopy conserva vacíos y sólo usa textos de reserva cuando faltan valores válidos',()=>{
  const copy=new StoreCopy({copy:{contactTitle:'',catalogSearch:'Buscá una remera',cartSummaryTitle:null}});
  assert.equal(copy.text('contactTitle'),''); assert.equal(copy.text('catalogSearch'),'Buscá una remera');
  assert.equal(copy.text('cartSummaryTitle'),defaultStoreCopy.cartSummaryTitle); assert.equal(copy.text('missing'),'');
  assert.equal(new StoreCopy({contactTitle:'Hola'}).get('contactTitle'),'Hola');
});
test('StoreCopy sigue el draft actual sin congelar el contenido durante la previsualización',()=>{
  let draft={copy:{catalogCount:'{count} opciones para vos'}}; const copy=new StoreCopy(()=>draft);
  assert.equal(copy.text('catalogCount',{count:7}),'7 opciones para vos');
  draft={copy:{catalogCount:'Descubrí {count} novedades'}}; assert.equal(copy.text('catalogCount',{count:4}),'Descubrí 4 novedades');
});
test('las variables se sustituyen como texto y no interpretan HTML, código ni propiedades heredadas',()=>{
  const value=StoreCopy.format('{storeName} · {count} · {constructor} · {unknown}',{storeName:'<script>literal</script>',count:0,constructor:'prohibido'});
  assert.equal(value,'<script>literal</script> · 0 · {constructor} · {unknown}');
  assert.equal(StoreCopy.format('{storeName}',Object.create({storeName:'Heredado'})),'{storeName}');
  assert.equal(StoreCopy.format('{amount}',{amount:'$ 12.500'}),'$ 12.500');
});
test('el registro de textos no duplica claves y ofrece límites y etiquetas para cada campo del editor',()=>{
  assert.equal(new Set(storeTextFields.map(field=>field.key)).size,storeTextFields.length);
  for(const field of storeTextFields){ assert.ok(field.label); assert.ok(field.section); assert.ok(field.max>=field.default.length); assert.equal(defaultStoreCopy[field.key],field.default); }
});

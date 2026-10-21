import test from 'node:test';
import assert from 'node:assert/strict';
import { CategoryTree } from '../src/services/categories.js';

const categories = [
  { _id: 'ropa', name: 'Ropa', parentId: null, active: true },
  { _id: 'buzos', name: 'Buzos', parentId: { _id: 'ropa' }, active: true },
  { _id: 'remeras', name: 'Remeras', parentId: 'ropa', active: true },
  { _id: 'algodon', name: 'Algodón', parentId: 'remeras', active: true },
  { _id: 'talles', name: 'Talles especiales', parentId: 'algodon', active: true },
  { _id: 'hogar', name: 'Hogar', parentId: null, active: true },
  { _id: 'vieja', name: 'Archivada', parentId: 'ropa', archived: true },
];

test('cada nivel reúne sus propios productos y todos sus descendientes conservando la ruta completa', () => {
  const tree = new CategoryTree(categories);
  const products = [{name:'Campera',categoryId:'ropa'}, {name:'Buzo gris',categoryId:'buzos'}, {name:'Remera blanca',categoryId:{_id:'remeras'}}, {name:'Remera XXL',categoryId:'talles'}, {name:'Lámpara',categoryId:'hogar'}];
  const select = category => products.filter(product => tree.branchIds(category).includes(CategoryTree.id(product.categoryId))).map(product => product.name);
  assert.deepEqual(select('ropa'), ['Campera', 'Buzo gris', 'Remera blanca', 'Remera XXL']);
  assert.deepEqual(select('remeras'), ['Remera blanca', 'Remera XXL']);
  assert.deepEqual(select('algodon'), ['Remera XXL']);
  assert.deepEqual(select('buzos'), ['Buzo gris']);
  assert.deepEqual(select('inexistente'), []);
  assert.equal(tree.root({_id:'talles'})._id, 'ropa');
  assert.equal(tree.label('buzos'), 'Ropa / Buzos');
  assert.deepEqual(tree.trail('ropa').map(category => category._id), ['ropa']);
  assert.deepEqual(tree.trail('talles').map(category => category._id), ['ropa', 'remeras', 'algodon', 'talles']);
  assert.equal(tree.label('talles'), 'Ropa / Remeras / Algodón / Talles especiales');
  assert.equal(tree.parent('talles')._id, 'algodon');
  assert.deepEqual(tree.children('algodon').map(category => category._id), ['talles']);
});

test('el selector permite padres a cualquier nivel, excluye el propio subárbol y el listado informa nivel y ubicación', () => {
  const tree = new CategoryTree(categories);
  assert.deepEqual(tree.assignableRoots('ropa').map(category => category._id), ['hogar']);
  assert.deepEqual(tree.assignableParents('remeras').map(category => category._id), ['hogar', 'ropa', 'buzos']);
  assert.deepEqual(tree.assignableParents('buzos').map(category => category._id), ['hogar', 'ropa', 'remeras', 'algodon', 'talles']);
  assert.equal(tree.assignableParents().length, 6);
  assert.deepEqual(tree.rows().map(category => [category._id, category.depth, category.parentName, category.childCount]), [
    ['hogar', 0, '', 0], ['ropa', 0, '', 2], ['buzos', 1, 'Ropa', 0], ['remeras', 1, 'Ropa', 1], ['algodon', 2, 'Remeras', 1], ['talles', 3, 'Algodón', 0],
  ]);
  const last=tree.rows().at(-1);
  assert.equal(last.parentPath, 'Ropa / Remeras / Algodón'); assert.equal(last.categoryPath, 'Ropa / Remeras / Algodón / Talles especiales');
  assert.equal(tree.get('vieja'), null);
  assert.equal(categories.find(category => category._id === 'talles').depth, undefined, 'las filas no mutan el catálogo original');
});

test('navegar árboles profundos no depende de recursión ni de un máximo fijo de niveles', () => {
  const chain=Array.from({length:12000},(_,index)=>({_id:'c'+index,name:'Nivel '+index,parentId:index?'c'+(index-1):null}));
  const tree=new CategoryTree(chain);
  assert.equal(tree.trail('c11999').length,12000);
  assert.equal(tree.root('c11999')._id,'c0');
  assert.equal(tree.branchIds('c0').length,12000);
  assert.equal(tree.branchIds('c6000').length,6000);
});

test('datos importados malformados no causan bucles y siguen siendo inspeccionables', () => {
  const tree=new CategoryTree([{_id:'a',name:'A',parentId:'b'},{_id:'b',name:'B',parentId:'a'},{_id:'orphan',name:'Huérfana',parentId:'missing'}]);
  assert.deepEqual(tree.branchIds('a'),['a','b']);
  assert.equal(tree.trail('a').length,2); assert.equal(tree.rows().length,3);
  assert.deepEqual(tree.assignableParents('a').map(category=>category._id),['orphan']);
  assert.deepEqual(tree.children(null),[]); assert.equal(tree.get(null),null);
});

test('el listado ABM parte de categorías principales y revela cada rama de forma progresiva', () => {
  const tree = new CategoryTree(categories);
  assert.deepEqual(tree.visibleRows().map(row => row._id), ['hogar','ropa']);
  assert.deepEqual(tree.visibleRows(['ropa']).map(row => row._id), ['hogar','ropa','buzos','remeras']);
  assert.deepEqual(tree.visibleRows(['ropa','remeras']).map(row => row._id), ['hogar','ropa','buzos','remeras','algodon']);
  assert.deepEqual(tree.visibleRows(['ropa','remeras','algodon']).map(row => row._id), ['hogar','ropa','buzos','remeras','algodon','talles']);
});

test('buscar en el árbol muestra coincidencias con todos sus ancestros sin exigir desplegarlos', () => {
  const tree = new CategoryTree(categories);
  assert.deepEqual(tree.visibleRows([], 'Talles especiales').map(row => row._id), ['ropa','remeras','algodon','talles']);
  assert.deepEqual(tree.visibleRows([], 'algodon').map(row => row._id), ['ropa','remeras','algodon','talles']);
  assert.deepEqual(tree.visibleRows([], 'no existe'), []);
});

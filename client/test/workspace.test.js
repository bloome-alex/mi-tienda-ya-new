import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace, registerStoreSwitchGuard, ensureWorkspaceCanLeave, selectStore } from '../src/services/workspace.js';

test('el cambio de tienda y la salida consultan el mismo guard y respetan cancelar', async () => {
  workspace.stores = [{ _id: 'one' }, { _id: 'two' }]; workspace.activeStoreId = 'one';
  let calls = 0;
  const release = registerStoreSwitchGuard(async () => { calls++; return false; });
  try {
    assert.equal(await ensureWorkspaceCanLeave(), false);
    assert.equal(await selectStore('two'), false);
    assert.equal(workspace.activeStoreId, 'one');
    assert.equal(calls, 2);
  } finally { release(); }
});
test('el guard de salida espera el resultado del guardado antes de cambiar contexto', async () => {
  workspace.stores = [{ _id: 'one' }, { _id: 'two' }]; workspace.activeStoreId = 'one';
  let finish;
  const release = registerStoreSwitchGuard(() => new Promise(resolve => { finish = resolve; }));
  try {
    const pending = selectStore('two');
    assert.equal(workspace.activeStoreId, 'one');
    finish(true);
    assert.equal(await pending, true);
    assert.equal(workspace.activeStoreId, 'two');
  } finally { release(); }
});
test('un guard liberado no bloquea otras pantallas y una tienda inexistente no cambia contexto', async () => {
  workspace.stores = [{ _id: 'one' }]; workspace.activeStoreId = 'one';
  const release = registerStoreSwitchGuard(() => false); release();
  assert.equal(await ensureWorkspaceCanLeave(), true);
  assert.equal(await selectStore('unknown'), false);
  assert.equal(workspace.activeStoreId, 'one');
});

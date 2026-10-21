import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmation, confirmDialog, choiceDialog, unsavedChangesDialog, resolveConfirmation, cancelConfirmation } from '../src/services/notifications.js';
import { validateImageFile, validateWallpaperDimensions, orientedImageDimensions } from '../src/components/editor/imageValidation.js';
import { wallpaperSpecs } from '../src/services/design.js';

test('el diálogo para salir distingue guardar, descartar y seguir editando', async () => {
  for (const answer of ['save', 'discard', 'cancel']) {
    const pending = unsavedChangesDialog();
    assert.equal(confirmation.mode, 'choice');
    assert.deepEqual(confirmation.choices.map(choice => choice.value), ['discard', 'save']);
    if (answer === 'cancel') cancelConfirmation(); else resolveConfirmation(answer);
    assert.equal(await pending, answer);
    assert.equal(confirmation.open, false);
  }
});

test('las confirmaciones anteriores siguen devolviendo booleanos, sin aceptar opciones ajenas', async () => {
  let pending = confirmDialog({ title: 'Eliminar' });
  resolveConfirmation(true);
  assert.equal(await pending, true);
  pending = confirmDialog();
  resolveConfirmation('save');
  assert.equal(await pending, false);
  pending = unsavedChangesDialog();
  resolveConfirmation('unexpected');
  assert.equal(await pending, 'cancel');
});

test('reemplazar un diálogo cancela su promesa anterior y no deja una navegación pendiente', async () => {
  const leave = unsavedChangesDialog();
  const remove = confirmDialog();
  assert.equal(await leave, 'cancel');
  cancelConfirmation();
  assert.equal(await remove, false);
  assert.throws(() => choiceDialog({ choices: [{ value: 'same' }, { value: 'same' }] }), TypeError);
});

test('los fondos aceptan solamente formatos de imagen previstos y hasta 5 MiB exactos', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.doesNotThrow(() => validateImageFile({ type, size: 5 * 1024 * 1024 }));
  }
  assert.throws(() => validateImageFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MiB/);
  assert.throws(() => validateImageFile({ type: 'image/svg+xml', size: 100 }), /JPG, PNG o WebP/);
  assert.throws(() => validateImageFile({ type: 'image/png', size: 0 }), /vacía/);
});

test('los fondos admiten distintas resoluciones y proporciones dentro del límite de píxeles', () => {
  for (const specification of Object.values(wallpaperSpecs)) {
    assert.doesNotThrow(() => validateWallpaperDimensions({ width: specification.width, height: specification.height }, specification));
    for (const actual of [{width:1280,height:720},{width:800,height:1200},{width:3000,height:1000},{width:1,height:1},{width:5000,height:5000}]) {
      assert.doesNotThrow(() => validateWallpaperDimensions(actual, specification));
    }
  }
  assert.doesNotThrow(() => validateWallpaperDimensions({ width: 1080, height: 1920 }, wallpaperSpecs.desktop));
  assert.doesNotThrow(() => validateWallpaperDimensions({ width: 1920, height: 1080 }, wallpaperSpecs.mobile));
  assert.throws(() => validateWallpaperDimensions({width:5001,height:5000}), /25 megapíxeles/);
  for(const actual of [null,{width:0,height:10},{width:10,height:-1},{width:100.5,height:50},{width:Infinity,height:50},{width:'800',height:600}]) {
    assert.throws(() => validateWallpaperDimensions(actual), /resolución válida/);
  }
});

test('la lectura de dimensiones aplica orientación EXIF y libera el bitmap decodificado', async () => {
  const previous = globalThis.createImageBitmap;
  let closed = false, received;
  globalThis.createImageBitmap = async (_file, options) => {
    received = options;
    return { width: 1080, height: 1920, close() { closed = true; } };
  };
  try {
    assert.deepEqual(await orientedImageDimensions({}), { width: 1080, height: 1920 });
    assert.deepEqual(received, { imageOrientation: 'from-image' });
    assert.equal(closed, true);
  } finally {
    if (previous === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = previous;
  }
});

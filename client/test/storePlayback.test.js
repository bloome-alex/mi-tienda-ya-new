import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, nextTick, reactive } from 'vue';
import { useStorePlayback } from '../src/services/storePlayback.js';

class Events {
  handlers = new Map();
  addEventListener(type, listener) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(listener); }
  removeEventListener(type, listener) { this.handlers.get(type)?.delete(listener); }
  emit(type) { for (const listener of this.handlers.get(type) || []) listener(); }
  count() { return [...this.handlers.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function mountPlayback(t, { reducedMotion = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const media = Object.assign(new Events(), { matches: reducedMotion });
  const document = Object.assign(new Events(), { hidden: false });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => media } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  const renderer = createRenderer({
    createElement: type => ({ type, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
    insert(node, parent) { node.parent = parent; parent.children.push(node); },
    remove(node) { node.parent.children.splice(node.parent.children.indexOf(node), 1); },
    setText(node, text) { node.text = text; }, setElementText(node, text) { node.text = text; },
    parentNode: node => node.parent, nextSibling: () => null, patchProp() {}
  });
  const state = reactive({ enabled: true, interval: 3, pauseOnHover: true });
  let advances = 0, playback;
  const app = renderer.createApp({ setup() {
    playback = useStorePlayback({ enabled: () => state.enabled, interval: () => state.interval, pauseOnHover: () => state.pauseOnHover, advance: () => { advances++; } });
    return () => null;
  } });
  app.mount({ children: [] });
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; app.unmount(); } };
  t.after(() => {
    unmount();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  });
  return { media, document, state, playback, unmount, get advances() { return advances; } };
}

test('hero y destacados pausan por foco, hover y pestaña oculta sin acumular temporizadores', async t => {
  const f = mountPlayback(t);
  t.mock.timers.tick(3000); assert.equal(f.advances, 1);
  f.playback.pointerEnter({ pointerType: 'mouse' }); await nextTick();
  t.mock.timers.tick(9000); assert.equal(f.advances, 1);
  f.playback.pointerLeave(); await nextTick();
  t.mock.timers.tick(3000); assert.equal(f.advances, 2);
  f.playback.focusIn(); await nextTick();
  f.playback.focusOut({ currentTarget: { contains: () => true }, relatedTarget: {} }); await nextTick();
  t.mock.timers.tick(6000); assert.equal(f.advances, 2);
  f.playback.focusOut({ currentTarget: { contains: () => false }, relatedTarget: null }); await nextTick();
  f.document.hidden = true; f.document.emit('visibilitychange'); await nextTick();
  t.mock.timers.tick(6000); assert.equal(f.advances, 2);
  f.document.hidden = false; f.document.emit('visibilitychange'); await nextTick();
  f.playback.pointerEnter({ pointerType: 'touch' }); await nextTick();
  t.mock.timers.tick(3000); assert.equal(f.advances, 3);
  f.state.pauseOnHover = false; f.playback.pointerEnter({ pointerType: 'mouse' }); await nextTick();
  t.mock.timers.tick(3000); assert.equal(f.advances, 4);
  f.playback.pause(); await nextTick();
  t.mock.timers.tick(9000); assert.equal(f.advances, 4);
  f.playback.toggle(); await nextTick();
  f.state.interval = 2; await nextTick();
  t.mock.timers.tick(1999); assert.equal(f.advances, 4);
  t.mock.timers.tick(1); assert.equal(f.advances, 5);
  f.state.enabled = false; await nextTick();
  t.mock.timers.tick(6000); assert.equal(f.advances, 5);
  f.state.enabled = true; await nextTick();
  t.mock.timers.tick(2000); assert.equal(f.advances, 6);
  f.unmount();
  assert.equal(f.media.count(), 0); assert.equal(f.document.count(), 0);
  t.mock.timers.tick(20000); assert.equal(f.advances, 6);
});

test('movimiento reducido bloquea autoplay inicial y dinámico y una pausa manual sigue vigente', async t => {
  const f = mountPlayback(t, { reducedMotion: true });
  t.mock.timers.tick(6000); assert.equal(f.advances, 0);
  f.media.matches = false; f.media.emit('change'); await nextTick();
  t.mock.timers.tick(3000); assert.equal(f.advances, 1);
  f.media.matches = true; f.media.emit('change'); await nextTick();
  t.mock.timers.tick(6000); assert.equal(f.advances, 1);
  f.playback.pause(); f.media.matches = false; f.media.emit('change'); await nextTick();
  t.mock.timers.tick(6000); assert.equal(f.advances, 1);
  f.playback.toggle(); await nextTick();
  t.mock.timers.tick(3000); assert.equal(f.advances, 2);
  f.unmount();
  f.media.matches = true; f.media.emit('change');
  assert.equal(f.playback.reducedMotion.value, false);
  assert.equal(f.media.count(), 0); assert.equal(f.document.count(), 0);
});

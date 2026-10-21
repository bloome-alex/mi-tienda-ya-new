import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDesign, normalizeDesign, createDesignSection, sectionSpacing, designStyle, storeColorMode } from '../src/services/design.js';

test('cada diseño y complemento se clona sin compartir arrays ni modificar tiendas anteriores', () => {
  const old = { shop: { heroTitle: 'Mi título' }, brand: { primary: '#18181b' } };
  const first = normalizeDesign(old), second = normalizeDesign(old);
  const section = createDesignSection('benefits', 'benefits-one');
  first.sections.push(section); section.blocks[0].title = 'Propio';
  assert.equal(second.sections.length, 0);
  assert.equal(defaultDesign.sections.length, 0);
  assert.equal(old.shop.heroVariant, undefined);
  assert.equal(first.shop.heroTitle, 'Mi título');
  const third = normalizeDesign(first); third.sections[0].blocks[0].title = 'Otra copia';
  assert.equal(first.sections[0].blocks[0].title, 'Propio');
});
test('la preferencia de cliente sólo gana cuando su tienda permite ambos modos', () => {
  const design = normalizeDesign({ brand: { colorMode: 'light', allowThemeToggle: true } });
  assert.equal(storeColorMode(design, 'dark'), 'light');
  assert.equal(storeColorMode(design, 'light', 'dark'), 'dark');
  design.brand.allowThemeToggle = false;
  assert.equal(storeColorMode(design, 'dark', 'dark'), 'light');
  design.brand.colorMode = 'system'; assert.equal(storeColorMode(design, 'dark', 'light'), 'dark');
});
test('la paleta oscura propia se aplica sin perder la paleta clara ni cambiar el draft', () => {
  const design = normalizeDesign({ brand: { darkPrimary: '#eeeeee', darkBackground: '#181821', darkText: '#ffffff', colorMode: 'dark' } });
  const snapshot = JSON.stringify(design);
  assert.equal(designStyle(design)['--store-bg'], '#181821');
  assert.equal(designStyle(design)['--store-primary'], '#eeeeee');
  assert.equal(designStyle(design, 'light', 'light')['--store-bg'], '#ffffff');
  assert.equal(JSON.stringify(design), snapshot);
});
test('el espaciado cero permite borde a borde y los valores inválidos no inyectan CSS', () => {
  assert.deepEqual(sectionSpacing({ paddingX: 0, paddingY: 0, fullWidth: true }), { '--section-px': '0px', '--section-py': '0px', '--section-max': '100%' });
  assert.equal(sectionSpacing({ paddingX: 'url(https://example.test)' })['--section-px'], '32px');
  assert.equal(sectionSpacing({ paddingX: 300 })['--section-px'], '160px');
});

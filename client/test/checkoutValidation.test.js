import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCheckout, checkoutTerms } from '../src/services/checkoutValidation.js';
const valid = () => ({ customer: { name: 'Ana Pérez', email: 'ana@example.test', phone: '1112345678', address: 'Calle 12', city: 'Córdoba', postalCode: '5000', notes: '' }, delivery: { id: 'pickup' }, payment: { id: 'cash' }, termsAccepted: true });

test('confirmar revisa datos de todos los pasos aunque los inputs anteriores estén desmontados', () => {
  const result = validateCheckout({ ...valid(), customer: { name: '   ', email: 'correo-incompleto', phone: '' }, requiresPhone: true, termsRequired: true, termsAccepted: false });
  assert.deepEqual(result.map(issue => issue.field), ['name', 'email', 'phone', 'terms']);
  assert.equal(result[0].step, 1);
  assert.equal(result.at(-1).id, 'buyer-terms');
});
test('validar un paso no bloquea con campos de los pasos posteriores', () => {
  const data = { customer: { name: 'Ana', email: 'ana@example.test' } };
  assert.deepEqual(validateCheckout({ ...data, scope: 'customer' }), []);
  assert.deepEqual(validateCheckout({ ...data, scope: 'delivery' }).map(issue => issue.field), ['delivery']);
});
test('una entrega con dirección obligatoria exige calle, localidad y código postal', () => {
  const data = { ...valid(), customer: { name: 'Ana', email: 'ana@example.test', phone: '1111111111' } };
  assert.deepEqual(validateCheckout({ ...data, requiresAddress: true }).map(issue => issue.field), ['address', 'city', 'postalCode']);
  assert.deepEqual(validateCheckout(data), []);
});
test('los términos internos y el enlace anterior exigen aceptación explícita', () => {
  assert.deepEqual(checkoutTerms({ terms: { enabled: true }, checkout: { termsUrl: 'https://example.test/viejos' } }), { internal: true, required: true, url: '' });
  const legacy = checkoutTerms({ checkout: { termsUrl: 'https://example.test/terminos' } });
  assert.equal(legacy.required, true);
  for (const termsAccepted of [undefined, false, 'true', 1]) assert.equal(validateCheckout({ ...valid(), termsRequired: true, termsAccepted }).at(-1).field, 'terms');
  assert.deepEqual(validateCheckout({ ...valid(), termsRequired: false, termsAccepted: false }), []);
});
test('los medios de entrega y pago ausentes producen errores accionables', () => {
  const issues = validateCheckout({ ...valid(), delivery: null, payment: null });
  assert.deepEqual(issues.map(issue => [issue.field, issue.id, issue.step]), [['delivery', 'delivery-options', 2], ['payment', 'payment-options', 3]]);
});
test('teléfono configurable y límites se validan sin mutar los datos del comprador', () => {
  const data = valid(); data.customer.phone = ''; data.customer.notes = 'a'.repeat(1501);
  assert.deepEqual(validateCheckout({ ...data, requiresPhone: true }).map(issue => issue.field), ['phone', 'notes']);
  assert.equal(data.customer.notes.length, 1501);
  data.customer.notes = ''; assert.deepEqual(validateCheckout(data), []);
});

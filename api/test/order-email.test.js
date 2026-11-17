// Plantilla de mails del pedido (1.25.3): fotos, totales, entrega/pago y escape de datos del comprador.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ENCRYPTION_KEY ||= '78'.repeat(32);
process.env.SESSION_SECRET ||= 'order-email-secret';
const { renderOrderConfirmation, renderDigitalDelivery } = await import('../src/services/OrderEmailTemplate.js');

const store = { name: 'Café <Aurora>', design: { brand: { primary: '#f5f5f5', logo: 'javascript:alert(1)' } } };
const order = (overrides = {}) => ({
  number: 'MT-1', status: 'pending', subtotal: 27400, deliveryCost: 3500, total: 30900,
  customer: { name: '<b>Ana</b>', email: 'ana@example.com', address: 'Calle 1', city: 'CABA', postalCode: '1043' },
  items: [
    { name: 'Blend', variantName: 'Molido', quantity: 1, unitPrice: 18900, lineTotal: 18900, image: 'https://cdn.example.com/a.webp' },
    { name: 'Taza', quantity: 1, unitPrice: 8500, lineTotal: 8500, image: 'http://inseguro.example.com/b.png' },
  ],
  delivery: { name: 'Envío', description: 'En 48 h' },
  payment: { type: 'transfer', name: 'Transferencia', instructions: 'Enviá el comprobante', bank: { holder: 'Ana SA', cbu: '0000003100000000000001', alias: 'cafe.aurora' } },
  ...overrides,
});

test('la confirmación incluye fotos https, variantes, totales en pesos y datos de entrega y pago', () => {
  const { subject, html, text } = renderOrderConfirmation({ store, order: order(), orderUrl: 'https://mitiendaya.com.ar/pedido/1?token=t' });
  assert.equal(subject, 'Recibimos tu pedido MT-1');
  assert.match(html, /<img src="https:\/\/cdn\.example\.com\/a\.webp"/);
  assert.ok(!html.includes('http://inseguro.example.com'), 'no incrusta imágenes sin HTTPS');
  assert.match(html, /Molido/);
  assert.match(html, /\$\s?30\.900,00/);
  assert.match(html, /0000003100000000000001/);
  assert.match(html, /cafe\.aurora/);
  assert.match(html, /href="https:\/\/mitiendaya\.com\.ar\/pedido\/1\?token=t"/);
  assert.match(text, /Total: \$\s?30\.900,00/);
});

test('escapa los datos del comprador y de la tienda e ignora logos que no son https', () => {
  const { html } = renderOrderConfirmation({ store, order: order(), orderUrl: 'https://x/pedido/1' });
  assert.ok(!html.includes('<b>Ana</b>'));
  assert.match(html, /&lt;b&gt;Ana&lt;\/b&gt;/);
  assert.match(html, /Café &lt;Aurora&gt;/);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /color:#111111/, 'texto oscuro sobre un color de marca claro');
});

test('el mensaje cambia según el estado y el medio de pago', () => {
  const paid = renderOrderConfirmation({ store, order: order({ status: 'paid' }), orderUrl: 'https://x' });
  assert.equal(paid.subject, 'Confirmamos tu compra MT-1');
  assert.match(paid.html, /Pago confirmado/);
  const mp = renderOrderConfirmation({ store, order: order({ status: 'awaiting_payment', payment: { type: 'mercadopago', name: 'Mercado Pago' } }), orderUrl: 'https://x' });
  assert.match(mp.html, /Esperando confirmación del pago/);
});

test('la entrega digital lista los enlaces de descarga', () => {
  const { subject, html, text } = renderDigitalDelivery({ store, order: order({ status: 'paid' }), orderUrl: 'https://x', digitalItems: [{ name: 'Ebook', digitalUrl: 'https://files.example.com/ebook.pdf' }] });
  assert.equal(subject, 'Tu compra digital · MT-1');
  assert.match(html, /href="https:\/\/files\.example\.com\/ebook\.pdf"/);
  assert.match(text, /Ebook: https:\/\/files\.example\.com\/ebook\.pdf/);
});

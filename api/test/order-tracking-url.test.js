// Regresión 1.25.3: el retorno de Mercado Pago y el mail de confirmación apuntaban a
// /t/:slug/pedido/:id, ruta inexistente en el cliente (404 tras pagar).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ENCRYPTION_KEY ||= '56'.repeat(32);
process.env.SESSION_SECRET ||= 'order-tracking-url-secret';
const { DomainService } = await import('../src/services/DomainService.js');

const service = new DomainService({ appUrl: 'https://mitiendaya.com.ar/', storefront: { baseDomain: 'mitiendaya.com.ar', cnameTarget: 'stores.mitiendaya.com.ar', verificationPrefix: '_mty', reservedSubdomains: [] } });

test('sin dominio propio el seguimiento usa /pedido/:id de la plataforma', () => {
  const url = service.orderTrackingUrl({ slug: 'cafe-aurora', domain: {} }, 'abc123', 'tok en');
  assert.equal(url, 'https://mitiendaya.com.ar/pedido/abc123?token=tok%20en');
  assert.ok(!url.includes('/t/'));
});

test('con dominio propio verificado el seguimiento usa ese dominio', () => {
  const url = service.orderTrackingUrl({ slug: 'x', domain: { mode: 'custom', customDomain: 'tienda.example.com', status: 'verified' } }, 'abc123', 't');
  assert.equal(url, 'https://tienda.example.com/pedido/abc123?token=t');
});

test('con subdominio administrado el seguimiento usa el subdominio', () => {
  const url = service.orderTrackingUrl({ slug: 'x', domain: { mode: 'subdomain', subdomain: 'cafe' } }, 'abc123', 't');
  assert.equal(url, 'https://cafe.mitiendaya.com.ar/pedido/abc123?token=t');
});

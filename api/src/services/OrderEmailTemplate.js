import { escapeHtml } from '../utils/http.js';
import { normalizeDesign } from '../../../client/src/services/design.js';

/**
 * Mails transaccionales del pedido (confirmación y entrega digital).
 * HTML con tablas y estilos en línea para que se vea bien en Gmail, Outlook y clientes móviles.
 */

const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value) || 0);
const safeImage = value => /^https:\/\/[^\s"'<>]+$/i.test(String(value || '')) ? String(value) : '';
const safeHex = (value, fallback) => /^#[a-f\d]{6}$/i.test(String(value || '')) ? String(value) : fallback;

function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111111' : '#ffffff';
}

function brandOf(store) {
  let brand = {};
  try { brand = normalizeDesign(store.design || {}).brand || {}; } catch { brand = {}; }
  const primary = safeHex(brand.primary, '#18181b');
  return { primary, onPrimary: readableOn(primary), logo: safeImage(brand.logo), name: store.name || 'Tu tienda' };
}

const paragraph = text => escapeHtml(text).replace(/\r?\n/g, '<br>');

function statusMessage(order) {
  const type = order.payment?.type;
  if (order.status === 'paid') return { title: '¡Gracias por tu compra!', lead: 'Tu pago está confirmado. Te avisamos cuando el pedido avance.', badge: 'Pago confirmado', tone: '#15803d' };
  if (type === 'mercadopago') return { title: 'Recibimos tu pedido', lead: 'Si ya completaste el pago en Mercado Pago, la confirmación llega en unos minutos. Podés seguir el estado desde el enlace de abajo.', badge: 'Esperando confirmación del pago', tone: '#b45309' };
  return { title: 'Recibimos tu pedido', lead: 'Tu pedido quedó reservado. Todavía tiene que ser abonado y confirmado por la tienda.', badge: 'Pendiente de pago', tone: '#b45309' };
}

function itemsTable(order, brand) {
  const rows = order.items.map(item => {
    const image = safeImage(item.image);
    const thumb = image
      ? `<img src="${escapeHtml(image)}" width="64" height="64" alt="${escapeHtml(item.name)}" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid #e7e5e4">`
      : `<div style="width:64px;height:64px;border-radius:10px;background:#f5f5f4;border:1px solid #e7e5e4"></div>`;
    return `<tr>
      <td width="76" style="padding:12px 12px 12px 0;vertical-align:top">${thumb}</td>
      <td style="padding:12px 0;vertical-align:top;font-size:15px;color:#1c1917">
        <div style="font-weight:600">${escapeHtml(item.name)}</div>
        ${item.variantName ? `<div style="font-size:13px;color:#78716c;margin-top:2px">${escapeHtml(item.variantName)}</div>` : ''}
        <div style="font-size:13px;color:#78716c;margin-top:4px">${item.quantity} × ${money(item.unitPrice)}</div>
      </td>
      <td align="right" style="padding:12px 0;vertical-align:top;font-size:15px;font-weight:600;color:#1c1917;white-space:nowrap">${money(item.lineTotal)}</td>
    </tr>`;
  }).join('<tr><td colspan="3" style="border-top:1px solid #f0efee;font-size:0;line-height:0">&nbsp;</td></tr>');
  const delivery = order.deliveryCost > 0 ? money(order.deliveryCost) : 'Sin costo';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;border-top:1px solid #e7e5e4">
      <tr><td style="padding:12px 0 4px;font-size:14px;color:#57534e">Productos</td><td align="right" style="padding:12px 0 4px;font-size:14px;color:#57534e">${money(order.subtotal)}</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#57534e">Entrega</td><td align="right" style="padding:4px 0;font-size:14px;color:#57534e">${delivery}</td></tr>
      <tr><td style="padding:12px 0 0;font-size:17px;font-weight:700;color:#1c1917">Total</td><td align="right" style="padding:12px 0 0;font-size:20px;font-weight:700;color:${brand.primary}">${money(order.total)}</td></tr>
    </table>`;
}

function infoBlock(title, body) {
  return `<td width="50%" style="padding:16px;vertical-align:top;background:#fafaf9;border:1px solid #f0efee;border-radius:12px">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a8a29e;font-weight:600;margin-bottom:6px">${title}</div>
    <div style="font-size:14px;line-height:1.5;color:#292524">${body}</div>
  </td>`;
}

function deliveryAndPayment(order) {
  const delivery = order.delivery || {};
  const customer = order.customer || {};
  const address = [customer.address, [customer.city, customer.postalCode].filter(Boolean).join(' ')].filter(Boolean).map(escapeHtml).join('<br>');
  const deliveryBody = `<strong>${escapeHtml(delivery.name || 'Entrega')}</strong>${delivery.description ? `<br><span style="color:#78716c">${paragraph(delivery.description)}</span>` : ''}${address ? `<br>${address}` : ''}`;
  const payment = order.payment || {};
  const bank = payment.type === 'transfer' && payment.bank ? payment.bank : null;
  const bankLines = bank ? [['Titular', bank.holder], ['Banco', bank.bank], ['CBU/CVU', bank.cbu], ['Alias', bank.alias], ['CUIT', bank.cuit]].filter(([, v]) => v).map(([k, v]) => `${k}: <strong>${escapeHtml(v)}</strong>`).join('<br>') : '';
  const paymentBody = `<strong>${escapeHtml(payment.name || 'Pago')}</strong>${payment.instructions ? `<br><span style="color:#78716c">${paragraph(payment.instructions)}</span>` : ''}${bankLines ? `<br>${bankLines}` : ''}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 0"><tr>${infoBlock('Entrega', deliveryBody)}<td width="12" style="width:12px;min-width:12px;font-size:0;line-height:0">&nbsp;</td>${infoBlock('Pago', paymentBody)}</tr></table>`;
}

function layout({ brand, preheader, badge, title, lead, content, button, footer }) {
  const header = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}" height="40" style="display:block;max-height:40px;max-width:200px;height:auto;border:0">`
    : `<span style="font-size:20px;font-weight:700;color:${brand.onPrimary}">${escapeHtml(brand.name)}</span>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4">
  <tr><td style="background:${brand.primary};padding:20px 28px">${header}</td></tr>
  <tr><td style="padding:28px 28px 8px">
    ${badge ? `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;color:${badge.tone};background:${badge.tone}14;border:1px solid ${badge.tone}33">${escapeHtml(badge.text)}</span>` : ''}
    <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.25;color:#1c1917">${escapeHtml(title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#57534e">${lead}</p>
  </td></tr>
  <tr><td style="padding:16px 28px">${content}</td></tr>
  ${button ? `<tr><td align="center" style="padding:8px 28px 28px"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:${brand.primary};color:${brand.onPrimary};text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:10px">${escapeHtml(button.label)}</a></td></tr>` : ''}
  <tr><td style="padding:18px 28px;background:#fafaf9;border-top:1px solid #f0efee;font-size:12px;line-height:1.5;color:#a8a29e">${footer}</td></tr>
</table>
</td></tr></table></body></html>`;
}

const textLines = order => order.items.map(item => `${item.quantity} × ${item.name}${item.variantName ? ` (${item.variantName})` : ''}: ${money(item.lineTotal)}`).join('\n');

export function renderOrderConfirmation({ store, order, orderUrl }) {
  const brand = brandOf(store);
  const status = statusMessage(order);
  const subject = order.status === 'paid' ? `Confirmamos tu compra ${order.number}` : `Recibimos tu pedido ${order.number}`;
  const html = layout({
    brand,
    preheader: `${brand.name} · Pedido ${order.number} · ${money(order.total)}`,
    badge: { text: status.badge, tone: status.tone },
    title: status.title,
    lead: `Hola ${escapeHtml(order.customer.name)}, ${escapeHtml(status.lead.charAt(0).toLowerCase() + status.lead.slice(1))}`,
    content: `<div style="font-size:13px;color:#78716c;margin-bottom:4px">Pedido <strong style="color:#1c1917">${escapeHtml(order.number)}</strong></div>${itemsTable(order, brand)}<div style="height:20px"></div>${deliveryAndPayment(order)}`,
    button: { href: orderUrl, label: 'Ver estado del pedido' },
    footer: `Recibiste este correo porque hiciste un pedido en ${escapeHtml(brand.name)}. ${order.status === 'paid' ? '' : 'La recepción del pedido no confirma su pago. '}Si tenés dudas, contactá a la tienda mencionando el número ${escapeHtml(order.number)}.`,
  });
  const payment = order.payment || {};
  const text = [
    `Hola ${order.customer.name}, ${status.lead.charAt(0).toLowerCase()}${status.lead.slice(1)}`,
    '', `${store.name} · Pedido ${order.number}`, '', textLines(order), '',
    `Productos: ${money(order.subtotal)}`, `Entrega (${order.delivery?.name || ''}): ${order.deliveryCost > 0 ? money(order.deliveryCost) : 'sin costo'}`, `Total: ${money(order.total)}`, '',
    `Pago: ${payment.name || ''}${payment.instructions ? `\n${payment.instructions}` : ''}`, '',
    `Consultá el estado del pedido: ${orderUrl}`,
  ].join('\n');
  return { subject, text, html };
}

export function renderDigitalDelivery({ store, order, orderUrl, digitalItems }) {
  const brand = brandOf(store);
  const list = digitalItems.map(item => `<tr><td style="padding:10px 0;border-bottom:1px solid #f0efee;font-size:15px;color:#1c1917"><strong>${escapeHtml(item.name)}</strong></td><td align="right" style="padding:10px 0;border-bottom:1px solid #f0efee"><a href="${escapeHtml(item.digitalUrl)}" style="color:${brand.primary};font-weight:600;text-decoration:none">Descargar →</a></td></tr>`).join('');
  const html = layout({
    brand,
    preheader: `Tu compra en ${brand.name} está lista para descargar`,
    badge: { text: 'Pago confirmado', tone: '#15803d' },
    title: 'Tu compra está lista',
    lead: `Hola ${escapeHtml(order.customer.name)}, confirmamos tu pago en ${escapeHtml(brand.name)}. Estos son tus enlaces de descarga:`,
    content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${list}</table>`,
    button: { href: orderUrl, label: `Ver pedido ${order.number}` },
    footer: `Guardá este correo: los enlaces son personales. Pedido ${escapeHtml(order.number)} en ${escapeHtml(brand.name)}.`,
  });
  const text = `Hola ${order.customer.name}, tu pago en ${store.name} está confirmado.\n\n${digitalItems.map(item => `${item.name}: ${item.digitalUrl}`).join('\n')}\n\nPedido: ${orderUrl}`;
  return { subject: `Tu compra digital · ${order.number}`, text, html };
}

/** Pure checkout validation shared by the form's step and final submission flows. */
const clean = value => typeof value === 'string' ? value.trim() : '';
const fields = {
  name: { id: 'buyer-name', label: 'Nombre y apellido', max: 150, step: 1 },
  email: { id: 'buyer-email', label: 'Correo electrónico', max: 254, step: 1 },
  phone: { id: 'buyer-phone', label: 'Teléfono', max: 50, step: 1 },
  address: { id: 'buyer-address', label: 'Dirección de entrega', max: 300, step: 2 },
  city: { id: 'buyer-city', label: 'Localidad', max: 120, step: 2 },
  postalCode: { id: 'buyer-postal', label: 'Código postal', max: 30, step: 2 },
  notes: { id: 'buyer-notes', label: 'Notas para el vendedor', max: 1500, step: 3 }
};
export function checkoutTerms(design) {
  const internal = design?.terms?.enabled === true;
  const url = clean(design?.checkout?.termsUrl);
  return { internal, required: internal || !!url, url: internal ? '' : url };
}
export function validateCheckout({ customer = {}, requiresPhone = false, requiresAddress = false, delivery = null, payment = null, termsRequired = false, termsAccepted = false, scope = 'all' } = {}) {
  const issues = [];
  const include = step => scope === 'all' || scope === 'customer' && step === 1 || scope === 'delivery' && step === 2;
  const required = new Set(['name', 'email', ...(requiresPhone ? ['phone'] : []), ...(requiresAddress ? ['address', 'city', 'postalCode'] : [])]);
  for (const [field, rule] of Object.entries(fields)) {
    if (!include(rule.step)) continue;
    const value = clean(customer[field]);
    let message = '';
    if (required.has(field) && !value) message = `Completá ${rule.label.toLocaleLowerCase('es')}.`;
    else if (value.length > rule.max) message = `${rule.label} admite hasta ${rule.max} caracteres.`;
    else if (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = 'Ingresá un correo electrónico válido.';
    if (message) issues.push({ field, id: rule.id, step: rule.step, message });
  }
  if (include(2) && !delivery) issues.push({ field: 'delivery', id: 'delivery-options', step: 2, message: 'Elegí cómo querés recibir el pedido.' });
  if (include(3) && !payment) issues.push({ field: 'payment', id: 'payment-options', step: 3, message: 'Elegí un medio de pago disponible para esa entrega.' });
  if (include(3) && termsRequired && termsAccepted !== true) issues.push({ field: 'terms', id: 'buyer-terms', step: 3, message: 'Aceptá los términos y condiciones para confirmar el pedido.' });
  return issues.sort((a, b) => a.step - b.step);
}

export const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value || 0));
export const date = value => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
export const dateTime = value => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const statusLabels = { pending: 'Pendiente', awaiting_payment: 'Esperando pago', processing: 'En proceso', paid: 'Pagado', cancelled: 'Cancelado', unfulfilled: 'Sin preparar', preparing: 'Preparando', shipped: 'Enviado', delivered: 'Entregado' };
export const whatsappUrl = (phone, message = '') => `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

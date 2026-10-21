/** Carga optativa de ejemplos. Nunca se ejecuta durante npm start ni crea accesos alternativos. */
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { config, validateConfig } from '../api/src/config.js';
import { bootstrap, SettingsService, EntitlementService } from '../api/src/services/core.js';
import { quotaService } from '../api/src/services/QuotaService.js';
import { categoryService } from '../api/src/services/CategoryService.js';
import { User, Store, Category, Product } from '../api/src/models/index.js';
import { normalizeDesign, createDesignSection } from '../client/src/services/design.js';

const email = String(process.env.DEMO_EMAIL || 'demo@example.com').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('DEMO_EMAIL debe ser una dirección de correo válida.');
const stableId = value => new mongoose.Types.ObjectId(createHash('sha256').update(value).digest('hex').slice(0, 24));
try {
  validateConfig();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await bootstrap();
  let owner = await User.findOne({ email });
  if (owner && owner.role !== 'vendedor') throw new Error('DEMO_EMAIL pertenece al administrador. Usá un correo de vendedor.');
  const existingStore = await Store.findOne({ slug: 'feria-estudio' });
  if (existingStore && (!owner || String(existingStore.ownerId) !== String(owner._id))) throw new Error('El identificador feria-estudio ya pertenece a otra tienda. No se modificó su contenido.');
  const settings = await SettingsService.get();
  if (!owner) owner = await User.create({ role: 'vendedor', name: 'Cuenta de demostración', email, active: true, trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + settings.trialDays * 86400000) });
  const entitlement = await EntitlementService.forUser(owner);
  const design = normalizeDesign({
    brand: { primary: '#18181b', accent: '#71717a', background: '#ffffff', text: '#202024', font: 'modern', radius: 10, colorMode: 'system', allowThemeToggle: true },
    shop: { layout: 'editorial', announcement: 'Tienda de demostración · Productos de ejemplo', heroTitle: 'Tu estilo. Todos los días.', heroSubtitle: 'Remeras, accesorios y creaciones para llevar con vos. Una colección de ejemplo para descubrir tu próxima tienda.', heroImage: '/demo/remera.svg', heroButton: 'Ver la colección', footerText: 'Feria Estudio · Tienda de demostración de Mi Tienda Ya.', columns: 3, showFeatured: true, featuredTitle: 'Los elegidos de la colección', featuredLayout: 'rail', featuredAutoplay: false, cardVariant: 'bordered', productHoverSwap: true, productHoverEffect: 'lift' },
    product: { relatedTitle: 'Completá tu selección', madeToOrderText: 'Lo preparamos a pedido. Consultá el plazo de elaboración.' },
    sections: [createDesignSection('benefits', 'demo-benefits')],
  });
  const store = existingStore || await quotaService.createStore({
    ownerId: owner._id, name: 'Feria Estudio', slug: 'feria-estudio', description: 'Tienda de demostración. Todos los productos y precios son ejemplos para recorrer la aplicación.', active: entitlement.allowed, design,
    contact: { email, phone: '', whatsapp: '', message: '¡Hola, Feria Estudio! Quiero hacer una consulta.', showWhatsapp: false, showContactForm: false },
    deliveries: [{ id: 'pickup', type: 'pickup', name: 'Retiro en el local', description: 'Ejemplo: coordinar con el vendedor.', price: 0, active: true }, { id: 'shipping', type: 'shipping', name: 'Envío a domicilio', description: 'Ejemplo: envío con costo fijo.', price: 3800, active: true }, { id: 'digital', type: 'digital', name: 'Entrega por correo', description: 'El enlace se envía al confirmar el pago. El recurso de esta demo es ilustrativo.', price: 0, active: true }],
    payments: [{ id: 'cash', type: 'cash', name: 'Efectivo al retirar', instructions: 'Medio de cobro de demostración.', deliveryIds: ['pickup'], active: true }, { id: 'transfer', type: 'transfer', name: 'Transferencia bancaria', instructions: 'Datos de ejemplo. No realizar una transferencia real.', deliveryIds: ['pickup', 'shipping', 'digital'], active: true, bank: { holder: 'CUENTA DE EJEMPLO — NO TRANSFERIR', bank: 'Banco de ejemplo', cbu: '', alias: 'EJEMPLO.NO.TRANSFERIR', cuit: '' } }],
  }, { reuseSlug: true });
  const categories = {};
  const categoryEntries = [['clothes','Indumentaria',null],['shirts','Remeras','clothes'],['hoodies','Buzos','clothes'],['accessories','Accesorios',null],['bags','Bolsas de tela','accessories'],['digital','Digital',null]];
  for (const [key, name, parent] of categoryEntries) {
    const parentId = parent ? categories[parent]._id : null;
    categories[key] = await Category.findOne({ storeId: store._id, name, parentId, archived: { $ne: true } }) || await categoryService.create(store._id, { name, parentId, description: 'Categoría de demostración.', active: true });
  }
  const entries = [
    { key: 'remera', category: 'shirts', name: 'Remera Estudio', description: 'Remera de algodón de corte clásico. Un básico para combinar con tu estilo. Producto de demostración.', price: 15900, previousPrice: 18900, featured: true, stock: 0, variants: [{ id: 'remera-s', name: 'Blanca / S', sku: 'DEMO-RE-S', stock: 12, attributes: { Color: 'Blanco', Talle: 'S' } }, { id: 'remera-m', name: 'Blanca / M', sku: 'DEMO-RE-M', stock: 9, attributes: { Color: 'Blanco', Talle: 'M' } }, { id: 'remera-l', name: 'Blanca / L', sku: 'DEMO-RE-L', stock: 7, attributes: { Color: 'Blanco', Talle: 'L' } }] },
    { key: 'buzo', category: 'hoodies', name: 'Buzo Esencial', description: 'Buzo con capucha, bolsillo frontal y corte cómodo. Producto de demostración.', price: 32900, previousPrice: 36900, featured: true, stock: 0, variants: [{ id: 'buzo-m', name: 'Negro / M', sku: 'DEMO-BU-M', stock: 6, attributes: { Color: 'Negro', Talle: 'M' } }, { id: 'buzo-l', name: 'Negro / L', sku: 'DEMO-BU-L', stock: 8, attributes: { Color: 'Negro', Talle: 'L' } }] },
    { key: 'tote', category: 'bags', name: 'Tote de feria', description: 'Bolsa de tela reutilizable, con asas reforzadas y estampa original. Producto de demostración.', price: 8900, featured: true, stock: 18 },
    { key: 'gorra', category: 'accessories', name: 'Gorra Estudio', description: 'Gorra regulable en negro con bordado frontal. Producto de demostración.', price: 12900, stock: 15 },
    { key: 'pines', category: 'accessories', name: 'Set de pines a pedido', description: 'Tres pines para personalizar una mochila o una prenda. Se realizan a pedido; consultá los diseños disponibles. Producto de demostración.', price: 5900, stock: 0, madeToOrder: true },
    { key: 'kit-digital', category: 'digital', name: 'Kit digital para tu marca', description: 'Ejemplo de producto digital. El enlace dirige a example.com y NO contiene un archivo descargable real. Reemplazalo por tu recurso antes de vender.', price: 4900, stock: 0, type: 'digital', digitalUrl: 'https://example.com/recurso-de-demostracion' },
  ];
  const productIds = entries.map(entry => stableId(`mi-tienda-ya-2-demo:${store._id}:product:${entry.key}`));
  for (const [index, entry] of entries.entries()) {
    const { key, category, ...product } = entry;
    if (!await Product.exists({ _id: productIds[index] })) await quotaService.createProduct(store._id, { _id: productIds[index], ...product, type: product.type || 'physical', categoryId: categories[category]._id, images: key === 'remera' ? ['/demo/remera.svg', '/demo/remera-dorso.svg'] : [`/demo/${key}.svg`], active: true, relatedProductIds: [productIds[(index + 1) % entries.length], productIds[(index + 2) % entries.length]] });
  }
  console.log(`Demo configurada: ${config.appUrl}/t/feria-estudio`);
  console.log(`Ingresá por enlace usando DEMO_EMAIL: ${email}`);
  console.log('Para recibir el enlace, DEMO_EMAIL debe ser tu correo real y SMTP debe estar configurado. No se crearon contraseñas de vendedor ni accesos alternativos.');
  if (!entitlement.allowed) console.log('La cuenta existente no tiene una prueba o un plan vigente. Asigná uno desde administración para publicar.');
  console.log('Los ejemplos existentes no se sobrescribieron. El período de prueba no se renueva al repetir este comando.');
} catch (error) {
  console.error(`No se pudo preparar la demo: ${error.message}`); process.exitCode = 1;
} finally { await mongoose.disconnect(); }

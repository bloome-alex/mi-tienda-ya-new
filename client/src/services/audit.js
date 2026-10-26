import { designEnums, storeTextFields } from './design.js';
const values = {
  admin: 'Administración', vendedor: 'Vendedor', user: 'Usuario', customer: 'Cliente', system: 'Sistema', integration: 'Integración', unknown: 'No registrado',
  pending: 'Pendiente', awaiting_payment: 'Esperando pago', processing: 'En proceso', paid: 'Pagado', cancelled: 'Cancelado', creating: 'En preparación',
  unfulfilled: 'Sin preparar', preparing: 'En preparación', shipped: 'Enviado', delivered: 'Entregado',
  physical: 'Físico', digital: 'Digital', cash: 'Efectivo', transfer: 'Transferencia', mercadopago: 'Mercado Pago', pickup: 'Retiro', shipping: 'Envío', custom: 'Entrega personalizada',
  internal: 'Página de términos de la tienda', external: 'Enlace externo', manual: 'Pedido manual: sin aceptación del comprador', none: 'No aplica',
  image: 'Imagen', 'wallpaper-desktop': 'Fondo de escritorio', 'wallpaper-mobile': 'Fondo de celular', 'wallpaper-shared': 'Fondo compartido',
  modern: 'Moderna', classic: 'Clásica', friendly: 'Cercana', light: 'Claro', dark: 'Oscuro', shared: 'Compartido', responsive: 'Por dispositivo',
  left: 'Izquierda', center: 'Centro', right: 'Derecha', top: 'Arriba', bottom: 'Abajo', scroll: 'Se desplaza', fixed: 'Fijo', cover: 'Cubrir', contain: 'Contener',
  minimal: 'Minimalista', editorial: 'Editorial', bold: 'Expresivo', split: 'Dividido', centered: 'Centrado', carousel: 'Carrusel', grid: 'Cuadrícula', rail: 'Carrusel horizontal',
  compact: 'Compacto', bordered: 'Con borde', elevated: 'Con relieve', overlay: 'Superposición', lift: 'Elevación', zoom: 'Ampliación', square: 'Cuadrada', portrait: 'Vertical', landscape: 'Horizontal',
  thumbnails: 'Miniaturas', focus: 'Enfocado', wide: 'Amplio', stacked: 'Apilado', card: 'Tarjeta', cards: 'Tarjetas', steps: 'Pasos', single: 'Una página', narrow: 'Angosto', normal: 'Normal',
  text: 'Texto', imageText: 'Imagen y texto', banner: 'Banner', benefits: 'Beneficios', faq: 'Preguntas frecuentes', gallery: 'Galería', plain: 'Simple', contrast: 'Contraste',
  beforeCatalog: 'Antes del catálogo', afterCatalog: 'Después del catálogo', transparent: 'Transparente', surface: 'Superficie', muted: 'Suave', button: 'Botón', benefit: 'Beneficio',
  catalog: 'Catálogo', contact: 'Contacto', terms: 'Términos', star: 'Estrella', heart: 'Corazón', truck: 'Camión', shield: 'Protección', store: 'Tienda', package: 'Paquete', check: 'Confirmación', gift: 'Regalo', mail: 'Correo',
  ltr: 'De izquierda a derecha', rtl: 'De derecha a izquierda', auto: 'Automática', inherit: 'Heredada',
  natural: 'Proporción libre', rounded: 'Bordes redondeados', circle: 'Circular', chips: 'Categorías por niveles', navbar: 'Submenús en la cabecera', drawer: 'Panel desplegable', select: 'Selector compacto', sidebar: 'Panel lateral fijo',
  home: 'Inicio', featured: 'Destacados', social: 'Redes sociales', section: 'Sección personalizada', path: 'Enlace clásico', subdomain: 'Subdominio', custom: 'Dominio propio', verified: 'Verificado', unconfigured: 'Sin configurar', icons: 'Iconos', labels: 'Iconos y nombres',
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', pinterest: 'Pinterest', threads: 'Threads', twitch: 'Twitch', whatsapp: 'WhatsApp', website: 'Sitio web',
};
export const auditLabels = {
  id: 'Identificador', attributes: 'Atributos', sku: 'SKU', order: 'Orden', storeId: 'Tienda',
  name: 'Nombre', email: 'Correo', phone: 'Teléfono', whatsapp: 'WhatsApp', message: 'Mensaje inicial', showWhatsapp: 'Botón de WhatsApp', showContactForm: 'Formulario de contacto',
  active: 'Activo', visible: 'Visible públicamente', archived: 'Archivado', featured: 'Destacado', price: 'Precio', previousPrice: 'Precio anterior', durationDays: 'Duración en días', features: 'Funcionalidades',
  maxStores: 'Máximo de tiendas', maxProducts: 'Máximo de productos', sortOrder: 'Orden', icon: 'Icono', role: 'Rol', planId: 'Plan', planExpiresAt: 'Vencimiento del plan',
  trialDays: 'Días de prueba', magicLinkMinutes: 'Duración del enlace de acceso', slug: 'Dirección de la tienda', description: 'Descripción', ownerId: 'Vendedor asignado', domain: 'Dominio', subdomain: 'Subdominio', customDomain: 'Dominio propio', publicUrl: 'URL pública', verifiedAt: 'Fecha de verificación', verification: 'Verificación DNS', baseDomain: 'Dominio base', cnameTarget: 'Destino DNS', dnsVerifiedAt: 'DNS verificado', provisionedAt: 'HTTPS activado', provisioningError: 'Error de aprovisionamiento',
  parentId: 'Categoría principal', categoryId: 'Categoría', type: 'Tipo', stock: 'Stock', variants: 'Variantes', images: 'Imágenes', madeToOrder: 'Hecho a pedido', relatedProductIds: 'Productos relacionados',
  payments: 'Medios de pago', deliveries: 'Formas de entrega', deliveryIds: 'Entregas compatibles', instructions: 'Instrucciones', bank: 'Datos bancarios', holder: 'Titular', cbu: 'CBU', alias: 'Alias', cuit: 'CUIT',
  mercadopago: 'Mercado Pago', sandbox: 'Modo de prueba', hasAccessToken: 'Credencial de pago configurada', hasWebhookSecret: 'Firma de notificaciones configurada', integrations: 'Integraciones',
  home: 'Inicio de la plataforma', contact: 'Contacto', design: 'Diseño', brand: 'Identidad', wallpaper: 'Fondo', shop: 'Tienda', product: 'Página de producto', cart: 'Carrito', checkout: 'Pago', terms: 'Términos', sections: 'Secciones',
  status: 'Estado del pedido', fulfillmentStatus: 'Estado de entrega', paidAt: 'Fecha de pago', cancelledAt: 'Fecha de cancelación', title: 'Título', subtitle: 'Subtítulo', content: 'Contenido', intro: 'Introducción',
  primary: 'Color principal', accent: 'Color de acento', background: 'Fondo', text: 'Texto', darkPrimary: 'Principal oscuro', darkAccent: 'Acento oscuro', darkBackground: 'Fondo oscuro', darkText: 'Texto oscuro',
  font: 'Tipografía', radius: 'Radio de bordes', logo: 'Logotipo', favicon: 'Icono del sitio', colorMode: 'Apariencia inicial', allowThemeToggle: 'Permitir cambiar apariencia',
  enabled: 'Habilitado', mode: 'Modo', desktopImage: 'Fondo de escritorio', mobileImage: 'Fondo de celular', sharedImage: 'Fondo compartido', overlay: 'Superposición clara', darkOverlay: 'Superposición oscura', position: 'Posición', attachment: 'Desplazamiento', fit: 'Ajuste',
  layout: 'Distribución', announcement: 'Anuncio', showAnnouncement: 'Mostrar anuncio', heroTitle: 'Título de portada', heroSubtitle: 'Subtítulo de portada', heroImage: 'Imagen de portada', heroButton: 'Botón de portada',
  showHero: 'Mostrar portada', heroVariant: 'Formato de portada', heroShowText: 'Texto de portada', heroShowButton: 'Mostrar botón de portada', heroAlign: 'Alineación de portada', heroTextColor: 'Color de texto de portada', heroOverlay: 'Superposición de portada',
  heroHeight: 'Altura en escritorio', heroMobileHeight: 'Altura en celular', heroFullWidth: 'Portada a todo el ancho', heroPaddingX: 'Espacio horizontal de portada', heroPaddingY: 'Espacio vertical de portada',
  heroSlides: 'Diapositivas de portada', heroAutoplay: 'Reproducción automática de portada', heroInterval: 'Intervalo de portada', showSearch: 'Mostrar búsqueda', showCategories: 'Mostrar categorías',
  showCatalog: 'Mostrar catálogo', catalogTitle: 'Título del catálogo', showFeatured: 'Mostrar destacados', featuredTitle: 'Título de destacados', featuredLayout: 'Distribución de destacados',
  featuredAutoplay: 'Avance automático de destacados', featuredInterval: 'Intervalo de destacados', featuredSpeed: 'Velocidad de destacados', featuredLoop: 'Repetir destacados', featuredPauseOnHover: 'Pausa al pasar el cursor',
  featuredPaddingX: 'Espacio horizontal de destacados', featuredPaddingY: 'Espacio vertical de destacados', featuredFullWidth: 'Destacados a todo el ancho',
  catalogPaddingX: 'Espacio horizontal del catálogo', catalogPaddingY: 'Espacio vertical del catálogo', catalogFullWidth: 'Catálogo a todo el ancho', catalogVariant: 'Formato del catálogo',
  columns: 'Columnas en escritorio', mobileColumns: 'Columnas en celular', featuredColumns: 'Columnas de destacados en escritorio', featuredMobileColumns: 'Columnas de destacados en celular', catalogColumns: 'Columnas del catálogo en escritorio', catalogMobileColumns: 'Columnas del catálogo en celular', galleryColumns: 'Columnas de galería en escritorio', galleryMobileColumns: 'Columnas de galería en celular', imageRatio: 'Proporción de imágenes', cardVariant: 'Formato de tarjeta', cardShowButton: 'Botón de tarjeta', productHoverSwap: 'Alternar imagen al pasar el cursor', productHoverEffect: 'Efecto al pasar el cursor',
  showPreviousPrice: 'Mostrar precio anterior', showStock: 'Mostrar stock', showDescription: 'Mostrar descripción', footerText: 'Texto del pie', showContact: 'Mostrar contacto', footerPaddingX: 'Espacio horizontal del pie', footerPaddingY: 'Espacio vertical del pie',
  galleryLayout: 'Galería de producto', paddingX: 'Espacio horizontal', paddingY: 'Espacio vertical', fullWidth: 'Todo el ancho', showBreadcrumbs: 'Mostrar ruta de navegación', showCategory: 'Mostrar categoría', showSku: 'Mostrar SKU',
  showRelated: 'Mostrar relacionados', showRecommendations: 'Mostrar recomendaciones', relatedTitle: 'Título de relacionados', recommendationTitle: 'Título de recomendaciones', addButton: 'Botón para agregar',
  madeToOrderText: 'Texto para productos a pedido', showShare: 'Compartir producto', summaryStyle: 'Estilo del resumen', showImages: 'Mostrar imágenes', showNotes: 'Mostrar notas', showContinueShopping: 'Mostrar seguir comprando',
  buttonText: 'Texto del botón', buttonTarget: 'Destino del botón', emptyText: 'Mensaje de carrito vacío', trustMessage: 'Mensaje de confianza', style: 'Estilo', showOrderSummary: 'Mostrar resumen', showPhone: 'Mostrar teléfono',
  requirePhone: 'Exigir teléfono', showTrust: 'Mostrar mensaje de confianza', thankYouTitle: 'Título de agradecimiento', thankYouMessage: 'Mensaje de agradecimiento', termsUrl: 'Enlace de términos externos', termsLabel: 'Texto de aceptación',
  showUpdatedAt: 'Mostrar fecha de términos', updatedAt: 'Fecha de actualización', contentWidth: 'Ancho del contenido', body: 'Contenido', image: 'Imagen', alignment: 'Alineación', variant: 'Variante visual', placement: 'Ubicación', blocks: 'Complementos',
  number: 'Número de pedido', total: 'Total', manual: 'Creado manualmente', verifiedPayment: 'Pago verificado', note: 'Nota', reason: 'Motivo', count: 'Cantidad', purpose: 'Uso de imagen',
  width: 'Ancho en píxeles', height: 'Alto en píxeles', updated: 'Ajustes realizados', conflicts: 'Conflictos de stock', adjustments: 'Cantidades modificadas', conflictDetails: 'Cantidades en conflicto',
  navbar: 'Cabecera', copy: 'Textos de la tienda', mobileHeight: 'Altura en celular', sticky: 'Fijar la cabecera al desplazar', showTitle: 'Mostrar título', useStoreName: 'Usar el nombre de la tienda',
  logoWidth: 'Ancho del logo', logoHeight: 'Alto del logo', mobileLogoWidth: 'Ancho del logo en celular', mobileLogoHeight: 'Alto del logo en celular', logoShape: 'Forma del logo', logoRadius: 'Radio de bordes del logo', logoFit: 'Ajuste de imagen del logo', linksAlign: 'Alineación de enlaces', links: 'Enlaces de navegación', target: 'Destino del enlace', sectionId: 'Sección de destino', label: 'Texto visible',
  textAlign: 'Alineación de texto', textDirection: 'Dirección de lectura', announcementAlign: 'Alineación del anuncio', announcementDirection: 'Dirección del anuncio', heroDirection: 'Dirección de portada',
  featuredAlign: 'Alineación de destacados', featuredDirection: 'Dirección de destacados', catalogAlign: 'Alineación del catálogo', catalogDirection: 'Dirección del catálogo', cardAlign: 'Alineación de tarjetas', cardDirection: 'Dirección de tarjetas',
  contactAlign: 'Alineación de contacto', contactDirection: 'Dirección de contacto', footerAlign: 'Alineación del pie', footerDirection: 'Dirección del pie', categoryNavigation: 'Presentación de categorías',
  socialVariant: 'Presentación de redes', socialIconSize: 'Tamaño de iconos de redes', socialNewTab: 'Abrir redes en otra pestaña', socialLinks: 'Redes sociales', network: 'Red social', url: 'Enlace',
  before: 'Antes', after: 'Después', delta: 'Diferencia', productId: 'Producto', productName: 'Producto', variantId: 'Variante', variantName: 'Variante', currentStock: 'Stock actual',
  adAccountId: 'Cuenta publicitaria', pageId: 'Página de Facebook', campaignId: 'Campaña de Facebook', adId: 'Anuncio de Facebook', connectionMode: 'Modo de conexión', currency: 'Moneda', dailyBudget: 'Presupuesto diario', countryCode: 'País objetivo',
  featureKeys: 'Funcionalidades del plan', inheritsPlanId: 'Plan base', recipientEmail: 'Email destinatario', previousOwnerId: 'Dueño anterior', newOwnerId: 'Nuevo dueño', previousTransferId: 'Transferencia anterior', kind: 'Tipo de transferencia', unassignedProducts: 'Productos que quedaron sin categoría', fileType: 'Tipo de comprobante', replaced: 'Reemplazó un comprobante anterior', expiresAt: 'Vencimiento', planName: 'Plan asignado', previousPlanName: 'Plan anterior', credentialsUpdated: 'Credenciales actualizadas', fields: 'Campos registrados', termsAccepted: 'Aceptación de términos', termsSource: 'Origen de términos',
  ...Object.fromEntries(storeTextFields.map(field=>[field.key,field.label])),
};

export const auditAction = entry => entry?.actionLabel || 'Actividad registrada';
export const auditActor = entry => entry?.actor?.name || 'Nombre del actor no registrado';
const enumFields = new Set(['role','status','fulfillmentStatus','type','purpose','termsSource','source',...Object.keys(designEnums).map(key=>key.split('.').at(-1))]);
export function auditValue(value, field = '', depth = 0) {
  const last = String(field).split('.').at(-1);
  if (value === undefined) return 'No registrado';
  if (value === null || value === '') return 'Sin valor';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(value);
  if (typeof value === 'string') {
    if (enumFields.has(last) && Object.hasOwn(values, value)) return values[value];
    if (/At$/.test(last) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) return new Intl.DateTimeFormat('es-AR', { dateStyle:'medium',timeStyle:'short' }).format(new Date(value));
    return value;
  }
  if (depth > 8) return 'Detalle anidado';
  if (Array.isArray(value)) return value.length ? value.map((item, index) => (typeof item === 'object' && item ? (index + 1) + '. ' : '') + auditValue(item, field, depth + 1)).join('\n') : 'Lista vacía';
  return Object.entries(value).map(([key, item]) => (Object.hasOwn(auditLabels, key) ? auditLabels[key] : key) + ': ' + auditValue(item, key, depth + 1)).join('\n');
}

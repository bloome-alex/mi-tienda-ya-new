/** Public copy registry and safe text interpolation. No HTML, Vue or browser dependencies. */
const groups = {
  common: [
    ['backToStore','Volver a la tienda','Volver a la tienda'], ['continueShopping','Seguir comprando','Seguir eligiendo'],
    ['add','Agregar producto','Agregar'], ['chooseOptions','Elegir variantes','Elegir opciones'], ['soldOut','Producto sin stock','Sin stock'],
    ['digitalBadge','Etiqueta digital','Digital'], ['featuredBadge','Etiqueta destacado','Destacado'],
    ['madeToOrderBadge','Etiqueta hecho a pedido','A pedido'], ['discountBadge','Etiqueta de descuento','{count}% OFF'],
    ['viewCart','Abrir carrito','Ver carrito'], ['freeDelivery','Entrega sin costo','Sin costo'],
    ['subtotal','Subtotal','Subtotal'], ['delivery','Entrega','Entrega'], ['total','Total','Total'],
    ['quantity','Cantidad','Cantidad'], ['remove','Quitar producto','Quitar'], ['share','Compartir producto','Compartir'],
    ['previous','Página anterior','Anterior'], ['next','Página siguiente','Siguiente'], ['pause','Pausar carrusel','Pausar'], ['resume','Reanudar carrusel','Reanudar'],
  ],
  shop: [
    ['heroEyebrow','Texto superior de portada','{storeName}'],
    ['featuredEyebrow','Texto superior de destacados','UNA SELECCIÓN ESPECIAL'], ['featuredDescription','Descripción de destacados',''],
    ['featuredCatalogLink','Enlace al catálogo','Ver todo el catálogo'],
    ['catalogEyebrow','Texto superior del catálogo','ELEGIDO PARA VOS'], ['catalogDescription','Descripción del catálogo',''],
    ['catalogCount','Cantidad de productos','{count} productos para descubrir'], ['catalogSearch','Placeholder del buscador','Buscar productos'],
    ['catalogSort','Etiqueta de orden','Ordenar'], ['sortRecent','Orden por recientes','Más recientes'], ['sortPriceAsc','Orden por menor precio','Menor precio'],
    ['sortPriceDesc','Orden por mayor precio','Mayor precio'], ['sortName','Orden por nombre','Nombre A–Z'],
    ['allCategories','Todas las categorías','Todos los productos'], ['categoryLabel','Título de categorías','Categorías'],
    ['categoryButton','Abrir filtros de categorías','Explorar categorías'], ['categoryClose','Etiqueta accesible y ayuda para cerrar filtros','Cerrar categorías'], ['clearCategory','Ver categoría completa','Ver todos los productos'],
    ['catalogEmptyTitle','Título de catálogo vacío','Nuestra colección está en camino.'], ['catalogEmptyDescription','Descripción de catálogo vacío','Muy pronto vas a encontrar nuevos productos acá.'],
    ['catalogNoResultsTitle','Título sin resultados','No encontramos productos.'], ['catalogNoResultsDescription','Descripción sin resultados','Probá con otra búsqueda o elegí una categoría diferente.'],
    ['catalogClearSearch','Restablecer búsqueda','Ver todos los productos'], ['catalogPagination','Estado de paginación','Página {current} de {pages}'],
    ['stockAvailable','Stock visible en tarjetas','{count} disponibles'],
  ],
  contact: [
    ['contactEyebrow','Texto superior de contacto','SIEMPRE CERCA'], ['contactTitle','Título de contacto','Hablemos.'],
    ['contactDescription','Descripción de contacto','¿Tenés una pregunta? Nos encanta ayudarte.'],
    ['contactName','Etiqueta de nombre','Tu nombre'], ['contactEmail','Etiqueta de correo','Tu correo'], ['contactMessage','Etiqueta de consulta','¿En qué podemos ayudarte?'],
    ['contactSend','Botón enviar consulta','Enviar consulta'], ['contactSending','Botón durante el envío','Enviando…'],
    ['contactSuccess','Mensaje de consulta recibida','Recibimos tu consulta. Te responderemos a tu correo.'],
    ['whatsappTitle','Texto del botón WhatsApp','¿Te ayudamos?'], ['whatsappSubtitle','Descripción del botón WhatsApp','Hablemos por WhatsApp'],
    ['footerCredit','Texto de firma al pie','Creada con'],
  ],
  product: [
    ['productDigitalNote','Descripción de entrega digital','Recibí el enlace de descarga en tu correo después de confirmar el pago.'],
    ['productVariantLabel','Etiqueta de variantes','Elegí tu opción'], ['productStock','Stock disponible','{count} disponibles'], ['productSku','Etiqueta SKU','Código'],
    ['productQuantity','Etiqueta cantidad','Cantidad'], ['productViewCart','Botón después de agregar','Ver carrito'],
    ['productTrust','Mensaje debajo de comprar','Compra simple, atención cercana.'], ['productDescriptionTitle','Título de descripción','Descripción'],
    ['relatedEyebrow','Texto superior de relacionados','UNA BUENA COMBINACIÓN'], ['recommendationEyebrow','Texto superior de recomendaciones','ELEGIDO PARA VOS'],
  ],
  cart: [
    ['cartEyebrow','Texto superior del carrito','TUS ELEGIDOS'], ['cartUnitPrice','Precio por unidad','{amount} c/u'],
    ['cartItems','Cantidad de productos en el resumen','Productos ({count})'], ['cartDeliveryPending','Entrega a coordinar','A coordinar'],
    ['cartSubtitle','Descripción de la página','Una buena elección empieza por acá.'], ['cartEmptyTitle','Título de carrito vacío','Tu próxima elección te espera.'],
    ['cartEmptyButton','Botón de carrito y checkout vacíos','Explorar la tienda'], ['cartSummaryEyebrow','Texto superior del resumen','TU SELECCIÓN'], ['cartSummaryTitle','Título del resumen','Resumen de tu pedido'],
    ['cartDeliveryHint','Ayuda de entrega','La entrega se calcula en el siguiente paso.'], ['cartNotesLabel','Etiqueta de notas','¿Querés dejarnos una nota?'],
    ['cartNotesPlaceholder','Placeholder de notas','Algo que debamos saber sobre tu pedido…'], ['cartRecommendationsEyebrow','Texto superior de sugerencias','COMPLETÁ TU ELECCIÓN'],
  ],
  checkout: [
    ['checkoutEmptyTitle','Título de checkout sin productos','Primero, elegí algo que te encante.'],
    ['checkoutSubtitle','Descripción de la página','Unos pocos datos, y tu pedido está en camino.'], ['checkoutBack','Volver al carrito','Volver al carrito'],
    ['checkoutStepCustomer','Nombre del paso de datos','Tus datos'], ['checkoutStepDelivery','Nombre del paso de entrega','Entrega'], ['checkoutStepPayment','Nombre del paso de pago','Pago'],
    ['checkoutCustomerTitle','Título de datos del comprador','Un poco sobre vos'], ['checkoutCustomerDescription','Descripción de datos','Usaremos tu correo para informarte sobre el pedido.'],
    ['checkoutDeliveryTitle','Título de entrega','¿Cómo lo recibís?'], ['checkoutDeliveryDescription','Descripción de entrega','Elegí la opción más cómoda para vos.'],
    ['checkoutPaymentTitle','Título de pago','Tu forma de pagar'], ['checkoutPaymentDescription','Descripción de pago','Estas opciones están disponibles para la entrega elegida.'],
    ['checkoutName','Etiqueta nombre','Nombre y apellido'], ['checkoutEmail','Etiqueta correo','Correo electrónico'], ['checkoutPhone','Etiqueta teléfono','Teléfono'],
    ['checkoutNamePlaceholder','Placeholder del nombre','Tu nombre completo'], ['checkoutEmailPlaceholder','Placeholder del correo','vos@ejemplo.com'], ['checkoutPhonePlaceholder','Placeholder del teléfono','Código de área + número'],
    ['checkoutAddress','Etiqueta dirección','Dirección de entrega'], ['checkoutCity','Etiqueta localidad','Localidad'], ['checkoutPostal','Etiqueta código postal','Código postal'],
    ['checkoutAddressPlaceholder','Placeholder de dirección','Calle, número, piso y departamento'], ['checkoutNotesPlaceholder','Placeholder de notas','Contanos cualquier detalle de tu pedido.'],
    ['checkoutNotes','Etiqueta notas','Notas para el vendedor (opcional)'], ['checkoutEmailHelp','Ayuda del correo','Si comprás productos digitales, los vas a recibir en este correo.'],
    ['checkoutRequiredHelp','Ayuda de campos requeridos','Los campos con * son obligatorios.'],
    ['checkoutTermsHelp','Ayuda de aceptación de términos','Podés leerlos en otra pestaña antes de aceptar.'], ['checkoutDeliveryPending','Entrega pendiente de selección','A seleccionar'],
    ['checkoutContinue','Botón siguiente paso','Continuar'], ['checkoutPrevious','Botón paso anterior','Volver'],
    ['checkoutConfirm','Botón confirmar pedido','Confirmar pedido'], ['checkoutProcessing','Botón al procesar','Confirmando…'],
    ['checkoutTotal','Etiqueta del importe final','Total a pagar'], ['checkoutSummaryEyebrow','Texto superior del resumen','LO QUE ESTÁS ELIGIENDO'], ['checkoutSummaryTitle','Título del resumen','Tu pedido'],
  ],
  terms: [
    ['termsEyebrow','Texto superior de condiciones','{storeName}'], ['termsUpdated','Etiqueta de fecha','Última actualización'],
  ],
  tracking: [
    ['trackingEyebrow','Texto superior de seguimiento','TU PEDIDO'], ['trackingSummaryTitle','Título del detalle','Detalle del pedido'],
    ['trackingDeliveryTitle','Título de entrega','Entrega'], ['trackingContactTitle','Título de contacto','¿Necesitás ayuda?'],
  ]
};
export const storeTextSections = Object.freeze({common:'Textos comunes',shop:'Tienda y catálogo',contact:'Contacto y WhatsApp',product:'Producto',cart:'Carrito',checkout:'Checkout',terms:'Términos',tracking:'Seguimiento del pedido'});
export const storeTextFields = Object.freeze(Object.entries(groups).flatMap(([section, rows]) => rows.map(([key,label,value]) => Object.freeze({key,label,section,default:value,max:/Description|Note|Help|Hint|Success|Trust/.test(key)?4000:240,type:/Description|Note|Help|Hint|Success|Trust/.test(key)?'textarea':'text'}))));
export const defaultStoreCopy = Object.freeze(Object.fromEntries(storeTextFields.map(field=>[field.key,field.default])));
const tokens = new Set(['count','storeName','current','pages','from','to','total','date','orderNumber','amount']);
export class StoreCopy {
  constructor(source = {}) { this.source = source; }
  text(key, values = {}) {
    const source = typeof this.source === 'function' ? this.source() : this.source;
    const data = source?.copy ?? source ?? {};
    const value = Object.hasOwn(data,key) && typeof data[key] === 'string' ? data[key] : defaultStoreCopy[key] ?? '';
    return StoreCopy.format(value,values);
  }
  get(key, values) { return this.text(key,values); }
  static format(value, values = {}) {
    return String(value ?? '').replace(/\{([A-Za-z]+)\}/g,(match,key)=>tokens.has(key)&&Object.hasOwn(values,key)?String(values[key]??''):match);
  }
}

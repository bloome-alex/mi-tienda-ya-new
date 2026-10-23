# Funcionalidades y alcance de la versión 1.12

Esta matriz describe lo implementado en **mi-tienda-ya-2** y sus límites concretos. «Implementado» se refiere al código y al flujo disponible; el alcance de las pruebas y de la revisión visual se detalla al final.

## 1. Base técnica y experiencia de uso

| Requisito | Implementación | Alcance y límites |
| --- | --- | --- |
| PWA con HTML, CSS y JavaScript | Vue 3.5.44, JavaScript ESM, CSS propio y service worker. Además, cada tienda tiene un manifest dinámico con nombre e íconos propios configurables. | Instalable según el soporte del navegador y sobre HTTPS o localhost. Las PWA de tiendas usan un `id`/`scope` propio por dominio o `/t/slug`; API, catálogo actualizado, panel y compra requieren conexión. |
| Backend Node.js, Express y MongoDB | API Express, Mongoose y MongoDB standalone en el workspace `api`. | Funciona sin replica set. Las operaciones de varios documentos tienen compensación y recuperación, no una transacción global instantánea. |
| Programación Orientada a Objetos | Servicios separados de autenticación, habilitación de planes, cuotas, inventario, pedidos, correo y proveedores. | El cliente también centraliza HTTP y carrito en servicios. Los componentes Vue conservan el modelo reactivo del framework. |
| Vue con CSS sin otro framework visual | Vue Router para navegación, Vite para compilación y componentes propios. | No se incluyeron Vuetify, Bootstrap ni otro sistema de componentes visuales. |
| Diseño responsivo | Panel, formularios, tablas, tienda y editor con reglas CSS para distintos anchos. El diseñador mantiene controles y vista previa en áreas con desplazamiento independiente. | Se revisó en navegador de escritorio y con el panel en 390 × 844 simulado. No se probó en dispositivos físicos ni se presenta una certificación de accesibilidad. |
| Navbar y menú lateral fijos | Layout de los paneles privados con cabecera fija y navegación lateral; menú desplegable en móvil. | La home de la plataforma usa sólo navbar, sin menú lateral. Las tiendas tienen su layout configurable, independiente del panel. |
| ABM con tablas y formularios en página | Usuarios, tiendas, planes, categorías, productos, pedidos, medios de pago y entregas tienen listados y páginas propias para altas/ediciones. | Los campos repetidos de configuración, como beneficios o testimonios, se editan dentro del formulario de configuración. Las bajas se confirman; no se usan modales como formularios de ABM. |
| Avisos y confirmaciones | Componente compartido de diálogos para confirmar acciones y advertir estados finales; mensajes de validación en formularios. | No se utiliza `alert()` ni `prompt()` para pedir datos. El navegador puede mostrar su aviso nativo al cerrar una página con cambios de diseño pendientes. |
| Notificaciones | `notify.error`, `notify.success` y `notify.info`, presentadas en rojo, verde y celeste. | Son mensajes de la aplicación; el envío de correo tiene un servicio diferente. |
| Apariencia y colores | Interfaz inicial en negro, blanco y grises, con modos claro, oscuro y según el dispositivo. Las notificaciones conservan rojo, verde y celeste para sus estados. | El administrador/vendedor puede personalizar la marca y los colores de cada tienda; su apariencia se configura desde Diseño. |

## 2. Acceso, roles y planes

| Requisito | Implementación | Alcance y límites |
| --- | --- | --- |
| Sólo admin y vendedor | `User.role` admite exactamente esos valores. Índice único parcial impide un segundo administrador. | La API no ofrece altas de administradores adicionales. |
| Ruta escondida `/root/login` | Pantalla de acceso administrativo; usuario y contraseña inicial desde `ROOT_USER` y `ROOT_PASSWORD`. | La ruta oculta no sustituye la autenticación. Cambiar las variables después no restablece la contraseña ya persistida. |
| bcrypt para contraseñas | bcrypt real, costo configurable entre 10 y 14, con valor inicial 12. | Se utiliza para el administrador. Los vendedores no tienen contraseña. |
| Cambiar contraseña al primer ingreso | Bloqueo de las funciones administrativas hasta completar `/root/change-password`. | La contraseña nueva debe ser distinta, tener al menos 12 caracteres y no superar 72 bytes; se invalidan las sesiones anteriores. |
| Primer acceso del vendedor con email | Solicitud desde `/login`, correo SMTP y consumo de enlace de un solo uso. | Requiere SMTP operativo y un buzón real. El token no se devuelve en la API ni se imprime en registros. |
| Vigencia configurable del enlace | Configuración → General, de 1 a 1440 minutos; valor inicial 15. Hash del token y consumo atómico con comprobación de vencimiento. | Cambiar la configuración afecta a enlaces nuevos; el acceso requiere consumir el enlace mediante POST. |
| Prueba inicial de 15 días | Empieza en el primer acceso verificado; duración configurable entre 0 y 365 días. | Cambiar la duración no recalcula pruebas iniciadas; volver a ingresar no renueva la prueba. La prueba admite una tienda y no limita productos. |
| Acceso aunque venza el plan | El vendedor conserva sesión, panel y edición de productos/configuración. | El catálogo y el checkout comprueban vigencia y cupos; una tienda sin habilitación efectiva no vende. |
| Planes y renovación | El administrador puede asignar/renovar manualmente o habilitar suscripciones recurrentes con Mercado Pago desde Configuración → Suscripciones. Cada cobro aprobado agrega exactamente `durationDays` del plan. | Los períodos impagos pueden acumular deuda. Cancelar la renovación detiene cobros futuros y conserva el período ya pagado. |
| Días de cortesía | El administrador define cuántos días puede seguir publicado un vendedor después del último período pagado. El panel calcula períodos y monto adeudados. | Al llegar al límite la habilitación de publicación expira automáticamente; Usuarios permite filtrar vendedores fuera de gracia para contacto y eventual baja manual. |
| Límites de tiendas y productos | Posiciones de cuota con índices únicos MongoDB, control ante altas/activaciones concurrentes y reconciliación de publicaciones. | `maxProducts=0` significa sin límite. Los productos previamente aceptados se conservan al reducir un plan; se restringen nuevas altas mientras no haya cupo. |
| Reducción o vencimiento del plan | Al editar/asignar un plan se desactivan tiendas publicadas excedentes. El acceso público comprueba el cupo también cuando un plan vence. | Se priorizan las tiendas activas más antiguas por fecha e identificador. El contenido se conserva; ampliar el plan no reactiva tiendas desactivadas automáticamente. |
| Sesiones y aislamiento | Cookie HttpOnly, SameSite, Secure en producción, CSRF en mutaciones y comprobación del dueño de la tienda en la API. | Los límites de frecuencia se mantienen en memoria del proceso único; no son un límite global entre múltiples instancias. |

## 3. Administración de la plataforma

| Sección solicitada | Funciones implementadas | Alcance y límites |
| --- | --- | --- |
| Home configurable | Portada con texto destacado, título, descripción, texto del botón e imagen; planes, beneficios, experiencias de vendedores, preguntas frecuentes y contacto. | Los planes activos se cargan desde la configuración. Los testimonios los ingresa el administrador; no se inventan testimonios de clientes al instalar. |
| Resumen | Usuarios/vendedores, tiendas, productos, pedidos pagados, ingresos, unidades vendidas, actividad reciente y serie de ventas. | Los ingresos se calculan desde pedidos pagados y su fecha de pago. No constituye contabilidad, facturación fiscal ni un informe de liquidación bancaria. |
| Usuarios | Tabla con búsqueda/paginación, alta, edición, activación/baja lógica, asignación de plan y renovación. | Sólo cuentas de vendedor. La baja preserva datos históricos y bloquea su operación pública. |
| Tiendas | Listado global con propietario, alta/asignación, edición, baja lógica y acción para personalizar. | El administrador crea tiendas adicionales dentro del cupo; el primer ingreso verificado genera una tienda inicial en borrador. |
| Auditoría | Listado de acciones con búsqueda, actor, fecha y detalles operativos. | Registra eventos previstos por los servicios. No guarda contraseñas o secretos ni es una bitácora externa inmutable. |
| Configuración por tabs | General, Planes, Contacto, WhatsApp y Página de inicio. | SMTP y secretos del servidor se configuran mediante variables de entorno. |
| Planes | Nombre, ícono, descripción, precio anterior, precio actual, duración, funcionalidades, límites y estado. Formularios en páginas propias. | Desactivar un plan lo retira de la oferta pública; respeta las asignaciones existentes vigentes hasta su vencimiento. |
| Contacto de Tienda Ya | Email, teléfono y WhatsApp para soporte/planes. | Se utiliza en la home y como canal general de soporte de la plataforma. Los enlaces de contacto deben contener tus datos reales. |
| WhatsApp de administración | `whatsapp-web.js`, `LocalAuth`, `WHATSAPP_CLIENT_ID`, generación de QR, conectar/desconectar y polling cada 3 segundos en el panel. | Requiere Chromium y emparejar un teléfono. No abre navegador al instalar/arrancar; no incluye una campaña de mensajes ni sustituye la API oficial de WhatsApp Business. |

La home admite hasta 12 beneficios —título, ícono y descripción—, 20 experiencias —nombre, emprendimiento y testimonio— y 30 preguntas frecuentes —pregunta y respuesta—. Son contenido administrable de la plataforma.

## 4. Vendedor: catálogo y stock

| Función o campo solicitado | Implementación | Alcance y límites |
| --- | --- | --- |
| Resumen | Indicadores de productos, pedidos, unidades vendidas, ingresos, stock bajo y evolución de ventas de la tienda seleccionada. | Los pedidos internos todavía en creación no se presentan como ventas completadas. |
| Dominio por tienda | URL clásica `/t/slug`, subdominio administrado bajo `STOREFRONT_BASE_DOMAIN` o dominio propio con verificación TXT. Desde v1.11.0, al validar un dominio propio la plataforma puede crear su virtual host Nginx y emitir SSL con Certbot automáticamente. Los enlaces públicos y retornos de pago usan la dirección elegida. | Subdominios requieren DNS wildcard/TLS de la plataforma. Dominios propios requieren TXT + CNAME/ALIAS hacia `STOREFRONT_CNAME_TARGET`, puertos 80/443 accesibles y el helper de aprovisionamiento instalado. La URL clásica permanece como respaldo. |
| ABM de categorías y subcategorías | Niveles anidados sin un máximo fijo: tabla con nivel y ruta, búsqueda, acciones y formularios en páginas propias. Cualquier fila permite crear una subcategoría; el selector de contenedora muestra rutas completas y excluye el propio subárbol. | Se puede mover una rama con sus hijos, conservando productos y asignaciones. Se rechazan ciclos, autorreferencias y padres ajenos o archivados. Para quitar una categoría hay que resolver primero sus hijos, incluso los ocultos. Quitar una hoja conserva sus productos sin categoría. |
| Producto físico o digital | Selector de tipo y lógica de compra correspondiente. | Los digitales no consumen unidades de inventario; el enlace de entrega permanece privado. |
| Hasta cinco fotos | Carga, vista previa y eliminación desde el formulario. | JPG, PNG y WebP; hasta 5 MiB por imagen. El servidor valida contenido y dimensiones, convierte a WebP y limita el tamaño de salida. No admite SVG subido por usuarios. |
| Nombre y descripción | Campos del formulario de producto, visibles según la sección del diseño. | Texto validado; no se admite HTML arbitrario del vendedor. |
| Categoría del producto | Un selector de rutas completas permite asignar el producto a cualquier nivel o dejarlo sin categoría. | El servidor verifica que la categoría pertenezca a la tienda y no esté archivada. Un cambio de ubicación de la categoría conserva la asignación. |
| Navegación por categorías | Cinco variantes: chips, submenús en navbar, filtros en panel desplegable interno, selector compacto o barra lateral. Todos los niveles muestran su ruta; seleccionar cualquier categoría incluye sus productos y los de todos sus descendientes. | En navbar los submenús abren por hover/foco en escritorio y conservan control táctil. El panel desplegable crece dentro del catálogo y no usa un drawer global. El filtro se conserva en la URL. |
| Productos destacados | Opción en la ficha, botón por fila con estado y guardado propio, y filtro Todos / Sólo destacados / Sin destacar en el listado. Las tarjetas públicas muestran una insignia y la tienda dispone de una sección Destacados antes del catálogo. | El cambio rápido actualiza sólo `featured`, preservando stock y variantes. La sección reúne hasta 12 destacados activos, del más reciente al más antiguo, independientemente de búsqueda, categoría, orden y página del catálogo. Un producto oculto conserva su marca; mostrar el bloque y su título se configura en Diseño. |
| Precio y precio anterior | Valores numéricos y visualización de precio anterior configurable. | La API calcula el importe real al crear el pedido; el precio enviado por el navegador no fija el cobro. |
| Activar producto | Opción para mostrar u ocultar del catálogo público. | Requiere además que la tienda esté publicada y tenga habilitación vigente. |
| Variantes | Filas para variantes, como talle/color, con nombre, código y stock propio. El comprador elige una variante. | Se cargan variantes concretas; no se genera automáticamente una matriz cartesiana de talles por colores. |
| Stock inicial | Cantidad inicial general o por variante al crear el producto. | Las cantidades existentes se conservan al editar el producto; los ajustes posteriores se realizan en Stock. |
| Producto hecho a pedido | Opción para indicar fabricación después de la compra y texto público configurable. | No consume stock finito. Los plazos de fabricación se comunican en la descripción/contacto; no se genera un cronograma de producción. |
| Link de producto digital | URL HTTP/HTTPS obligatoria para un producto digital, privada en el catálogo y copiada al pedido. | Se envía por correo sólo después del pago confirmado. El vendedor aloja el recurso; la aplicación no genera descargas con caducidad o límite de usos. |
| Selección múltiple de relacionados | Selector múltiple desde el formulario y sección de relacionados en el detalle público. | Sólo productos de la misma tienda. La visibilidad depende del estado y del diseño. |
| «También te puede interesar» | Recomendaciones basadas en productos comprados juntos en pedidos pagados, complementadas por relacionados y categorías. Funcionan también sobre el conjunto del carrito. | Se excluyen los productos ya elegidos y los no disponibles para mostrar. El historial pertenece a esa tienda; no requiere perfiles personales ni un servicio de IA. |
| Administración de stock | Tabla editable con cantidad absoluta, motivo del ajuste y guardado de varias filas. Historial de movimientos y reservas. | Cada fila valida la cantidad previamente leída. Las filas sin conflicto se guardan; las que cambiaron por otra operación se informan para revisar sin revertir el resto del lote. |
| Compras concurrentes | Reserva condicional en MongoDB para producto o variante; liberación al cancelar y confirmación al pagar. | Evita vender dos veces la última unidad en las pruebas concurrentes. Los productos a pedido y digitales no reservan stock. |

## 5. Pedidos, cobros, entregas y contacto

| Función solicitada | Implementación | Alcance y límites |
| --- | --- | --- |
| ABM de pedidos | Tabla con búsqueda/filtros, página de alta manual, detalle, cambios de estado, entrega y acciones. | La baja operativa cancela el pedido y conserva el historial; no borra una venta pagada. |
| Estados del pedido | Pendiente, esperando pago, en proceso, pagado y cancelado. | Hay además un estado interno temporal de creación que no se muestra como pedido normal. |
| Advertir estados finales | Pagado y cancelado están marcados como finales; diálogo de confirmación y validación del servidor. | No se reabren. Los pagos de Mercado Pago deben verificarse con el proveedor y no pueden aprobarse manualmente desde el panel. |
| Estado de entrega | Pendiente, preparando, enviado y entregado, independiente del estado financiero. | Enviado/entregado requieren pago confirmado. |
| Varios medios de pago | Efectivo, transferencia y Mercado Pago configurables por tienda con nombre, instrucciones y estado. | Cada medio declara las entregas permitidas. Efectivo sólo para retiro es una configuración posible, no una restricción fija para todas las tiendas. |
| Varias formas de entrega | Retiro, envío y entrega digital, con nombre, descripción, costo y estado. | Las tarifas son configuradas por el vendedor; no hay cotización automática con transportistas. |
| Transferencia bancaria | Formulario de datos del banco, titular, cuenta/CBU/CVU/alias e instrucciones; información copiada al pedido. | Los datos son del vendedor. Adjuntar un comprobante no comprueba que el dinero se haya acreditado. |
| Comprobante del comprador | Carga desde el seguimiento privado de pedidos por transferencia; descarga autorizada en el panel. | JPEG, PNG, WebP o PDF de hasta 8 MiB, verificados por contenido y guardados fuera del directorio estático. |
| Mercado Pago Checkout Pro | Preferencias por tienda, redirección a Checkout Pro, Webhook firmado y consulta de pago por API. | Requiere credenciales reales/de prueba propias y HTTPS. Se validan importe, moneda, pedido, tienda y cuenta receptora. No hubo un cobro real durante la construcción. |
| Pago tardío | Una aprobación posterior a una cancelación se registra como incidencia para revisar. | No reabre el pedido, no descuenta nuevamente y no entrega automáticamente; la resolución con el proveedor es manual. |
| Expiración de reservas | Pedidos Mercado Pago usan `ORDER_RESERVATION_MINUTES`, inicialmente 60. El trabajador consulta al proveedor antes de cancelar. | Configurable entre 15 y 1440 minutos. Ante una caída del proveedor conserva la reserva y reintenta. Efectivo/transferencia se resuelven manualmente. |
| Entrega digital por correo | Trabajo persistente al confirmar el pago, URL privada del producto, reintentos y acción para reintentar desde el panel. | SMTP tiene semántica de al menos una vez: una interrupción puede producir un correo repetido. No se promete una única entrega física del mensaje. |
| Seguimiento del pedido | Página `/pedido/:id?token=...` con estado, instrucciones, pago, comprobante y entrega. | El enlace es privado; conocer el ID sin el token no concede acceso. Puede consultarse aunque la tienda deje de estar publicada. |
| Contacto del vendedor | Email, teléfono visible, WhatsApp, mensaje inicial y opciones de formulario/botón flotante. | El formulario envía usando el SMTP de la plataforma hacia el correo del vendedor. |
| WhatsApp del vendedor y vista previa | Previsualización del mensaje y botón para probar `wa.me`; botón flotante configurable. | El comprador decide enviar el mensaje. No exige conectar la sesión `whatsapp-web.js` de administración. |
| Mi suscripción | Estado del plan, deuda, cortesía, cuenta de Mercado Pago vinculada, contratación, cancelación de renovación y desvinculación para usar otra cuenta. | El proveedor cobra automáticamente según la recurrencia configurada. La cuenta del vendedor no se desactiva automáticamente por mora; la publicación queda bloqueada al superar la cortesía. |

## 6. Diseñador de tiendas

El editor y las páginas públicas comparten un contrato estructurado en `client/src/services/design.js`. La normalización completa los campos nuevos y conserva los datos anteriores. El marco se ajusta al alto y ancho disponibles; controles y tienda se desplazan por separado. Producto, carrito, checkout y términos mantienen su navegación sincronizada entre marco y controles.

Los cambios generales y de diseño tienen un guardado conjunto. Salir, cambiar de tienda o cerrar sesión consulta Guardar / Descartar / Seguir editando si hay modificaciones. Cerrar o recargar la pestaña usa el aviso nativo del navegador, con las limitaciones descritas en [DISENO.md](DISENO.md). No hay guardado automático al cerrar.

### Identidad, temas y fondos

| Campos | Configuración |
| --- | --- |
| `brand.primary`, `brand.accent`, `brand.background`, `brand.text` | Paleta clara. |
| `brand.darkPrimary`, `brand.darkAccent`, `brand.darkBackground`, `brand.darkText` | Paleta oscura propia de la tienda. |
| `brand.font`, `brand.radius`, `brand.logo`, `brand.favicon` | Tipografía, bordes 0–40 px, logo e icono. |
| `brand.colorMode` | Modo inicial claro, oscuro o según dispositivo. |
| `brand.allowThemeToggle` | Permitir al cliente ambos modos, incluso con modo inicial fijo. La elección se guarda por tienda. |
| `brand.textDirection` | Dirección de lectura global izquierda a derecha, derecha a izquierda o automática. |
| `wallpaper.enabled`, `wallpaper.mode` | Activar fondo y elegir imagen compartida o por dispositivo. |
| `wallpaper.desktopImage`, `wallpaper.mobileImage`, `wallpaper.sharedImage` | Cualquier resolución positiva de hasta 25 megapíxeles y 5 MiB JPEG/PNG/WebP estático. 1920×1080, 1080×1920 y 1920×1920 son recomendaciones, sin proporción ni mínimo obligatorios. |
| `wallpaper.overlay`, `wallpaper.darkOverlay` | Superposición independiente por modo, 0–90. |
| `wallpaper.position`, `wallpaper.attachment`, `wallpaper.fit` | Posición superior/centro/inferior, desplazamiento o fijo, cubrir o contener. |

La carga aplica la orientación y conserva las dimensiones reales del fondo. Los archivos se procesan a WebP; un panorama con un eje mayor a 16.383 píxeles se conserva como PNG para evitar el límite de ese codificador. Se verifica nuevamente tienda, propósito, dimensiones del propio archivo y hash al guardar. El ajuste cubrir puede recortar los bordes según la pantalla; contener muestra la imagen completa.

### Cabecera, logo y textos propios

| Campos | Configuración |
| --- | --- |
| `navbar.height`, `navbar.mobileHeight` | Altura de cabecera de escritorio 48–220 px y móvil 48–160 px. |
| `navbar.paddingX`, `navbar.sticky`, `navbar.linksAlign` | Espacio horizontal 0–120 px, cabecera fija opcional y alineación de enlaces. |
| `navbar.useStoreName`, `navbar.title`, `navbar.showTitle` | Usar el nombre de la tienda, definir otro título o dejar sólo el logo. El título personalizado puede estar vacío; no se agrega un punto. El nombre administrativo sigue siendo obligatorio. |
| `navbar.logoWidth`, `navbar.logoHeight`, `navbar.mobileLogoWidth`, `navbar.mobileLogoHeight` | Caja del logo independiente por dispositivo, adaptable al espacio real de la cabecera. |
| `navbar.logoShape`, `navbar.logoRadius`, `navbar.logoFit` | Proporción natural, cuadrado, redondeado o círculo; radio 0–100 px; contener sin deformar o cubrir. |
| `navbar.links` | Hasta 12 enlaces ordenables hacia inicio, catálogo, destacados, contacto, términos, redes sociales o una sección propia. Los destinos ocultos no se muestran. El carrito sigue accesible. |
| `copy` | Textos únicos de catálogo, etiquetas, buscador, contacto, WhatsApp, producto, carrito, checkout, términos y seguimiento. Las cadenas vacías explícitas se conservan. |
| Alineación y dirección por área | Anuncio, portada, destacados, catálogo, tarjetas, contacto, pie y páginas de compra permiten alinear a izquierda/centro/derecha y elegir dirección de lectura o heredarla. Los complementos pueden heredar ambas de su sección. |

Los títulos y textos existentes de portada, carrito o términos siguen en sus campos habituales. El registro `storeTextFields` define las nuevas etiquetas editables y su máximo. Algunos textos admiten variables como `{count}` y `{storeName}` para conservar datos dinámicos. No se interpreta HTML ni código, y los estados de pago, errores de validación y avisos de sistema permanecen controlados por la aplicación.

### Tienda y tarjetas

| Campos | Configuración |
| --- | --- |
| `shop.layout`, `shop.announcement`, `shop.showAnnouncement` | Estilo general y barra de anuncio. |
| `shop.showHero`, `shop.heroVariant` | Portada dividida, fondo con contenido, sólo imagen, centrada o carrusel. |
| `shop.heroTitle`, `shop.heroSubtitle`, `shop.heroImage`, `shop.heroButton` | Contenido general de portada. |
| `shop.heroShowText`, `shop.heroShowButton`, `shop.heroAlign`, `shop.heroTextColor`, `shop.heroOverlay` | Visibilidad, alineación, color y superposición de contenido. |
| `shop.heroHeight`, `shop.heroMobileHeight` | Altura por tipo de pantalla. |
| `shop.heroSlides`, `shop.heroAutoplay`, `shop.heroInterval` | Hasta ocho diapositivas, reproducción y frecuencia. |
| `shop.showFeatured`, `shop.featuredTitle`, `shop.featuredLayout` | Destacados en grilla o carrusel horizontal. Máximo 12 productos activos. |
| `shop.featuredAutoplay`, `shop.featuredInterval`, `shop.featuredSpeed`, `shop.featuredLoop`, `shop.featuredPauseOnHover` | Reproducción, segundos entre avances, duración del desplazamiento, repetición y pausa de mouse. Foco, pestaña oculta y movimiento reducido también detienen el avance. El carrusel conserva espacio para las sombras y márgenes de la primera tarjeta. |
| `shop.showCatalog`, `shop.catalogTitle`, `shop.catalogVariant`, `shop.columns` | Visibilidad, título, grilla/compacto/editorial y 1–5 columnas. |
| `shop.showSearch`, `shop.showCategories`, `shop.categoryNavigation` | Buscador y categorías multinivel con chips, navbar con apertura por hover/foco, panel desplegable interno, selector o barra lateral. |
| `shop.imageRatio`, `shop.cardVariant`, `shop.cardShowButton` | Proporción de fotos, estilo mínimo/con borde/elevado/superpuesto y botón. |
| `shop.productHoverSwap`, `shop.productHoverEffect` | Cambiar a segunda foto y efecto ninguno/elevar/acercar. Requiere imágenes adecuadas y dispositivo con hover. |
| `shop.showPreviousPrice`, `shop.showStock`, `shop.showDescription` | Precio anterior, stock y descripción en tarjetas. |
| `shop.heroPaddingX/Y`, `shop.featuredPaddingX/Y`, `shop.catalogPaddingX/Y` y sus `FullWidth` | Espaciado propio y ancho completo para cada zona. X e Y son campos separados. |
| `shop.footerPaddingX`, `shop.footerPaddingY`, `shop.footerText`, `shop.showContact` | Espaciados, contenido del pie y sección de contacto. |

### Producto, carrito y checkout

| Grupo | Configuración |
| --- | --- |
| `product.layout`, `product.galleryLayout` | Composición clásica/con foco/amplia; miniaturas o galería. |
| `product.showBreadcrumbs`, `product.showCategory`, `product.showStock`, `product.showSku`, `product.showShare` | Información de ficha. |
| `product.addButton`, `product.madeToOrderText` | Textos de compra y elaboración a pedido. |
| `product.showRelated`, `product.relatedTitle`, `product.showRecommendations`, `product.recommendationTitle` | Relacionados manuales y recomendaciones. |
| `cart.layout`, `cart.summaryStyle` | Columnas o apilado; resumen tarjeta o mínimo. |
| `cart.title`, `cart.showImages`, `cart.showNotes`, `cart.showContinueShopping` | Título y visibilidad de elementos del carrito. |
| `cart.buttonText`, `cart.emptyText`, `cart.trustMessage`, `cart.showRecommendations`, `cart.recommendationTitle` | Textos y sugerencias de compra conjunta. |
| `checkout.layout`, `checkout.style`, `checkout.showOrderSummary` | Pasos o formulario único, tarjetas o mínimo y resumen opcional. |
| `checkout.title`, `checkout.showPhone`, `checkout.requirePhone`, `checkout.showNotes` | Campos del comprador; teléfono obligatorio en compras físicas. |
| `checkout.showTrust`, `checkout.trustMessage`, `checkout.thankYouTitle`, `checkout.thankYouMessage` | Confianza y confirmación del pago. |
| `checkout.termsUrl`, `checkout.termsLabel` | URL externa anterior compatible y palabras del enlace; página interna prioritaria si está habilitada. |
| `product`, `cart`, `checkout`: `paddingX`, `paddingY`, `fullWidth` | Espaciado 0–160 px y ancho propio de cada página. Cero conserva el borde a borde. |

El checkout valida todos los campos requeridos antes de confirmar, incluidos los de pasos anteriores. Muestra una notificación roja, lista de errores, marcas junto al campo y foco en la primera corrección. La API verifica de nuevo entrega, pago, datos y aceptación.

### Términos y secciones adicionales

| Campos | Configuración |
| --- | --- |
| `terms.enabled`, `terms.title`, `terms.intro`, `terms.content` | Página propia `/t/:slug/terminos`. Requiere título y contenido al habilitar, hasta 20000 caracteres de contenido. Los borradores deshabilitados no se exponen públicamente. |
| `terms.showUpdatedAt`, `terms.updatedAt`, `terms.contentWidth`, `terms.paddingX`, `terms.paddingY` | Fecha opcional, ancho de lectura y espaciados. |
| `sections` | Hasta 12 secciones adicionales, con orden y ubicación antes/después del catálogo. |
| Tipo de sección | Texto, imagen con texto, banner, beneficios, preguntas frecuentes, galería o redes sociales. |
| Campos por sección | `id`, `type`, `enabled`, `title`, `subtitle`, `body`, `image`, `buttonText`, `buttonTarget`, `alignment`, `textDirection`, `variant`, `placement`, `paddingX`, `paddingY`, `fullWidth`, `background`, `columns`, `blocks`. |
| `blocks` | Hasta 12 complementos por sección, un nivel de anidamiento, tipo texto/imagen/botón/beneficio/pregunta. |
| Campos por complemento | `id`, `type`, `enabled`, `title`, `text`, `image`, `buttonText`, `buttonTarget`, `icon`, `alignment`, `textDirection`. |
| Redes sociales | `socialLinks`: hasta 12 enlaces con red, etiqueta, URL y visibilidad. Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Pinterest, Threads, Twitch, WhatsApp y sitio web. |
| Presentación social | `socialVariant`: etiquetas, iconos o tarjetas; `socialIconSize`: 16–64 px; `socialNewTab`: abrir en pestaña nueva. Conserva el espaciado, dirección, alineación y ubicación de la sección. |

Se pueden habilitar, ordenar, duplicar y quitar secciones y complementos desde el editor. La configuración usa texto y campos validados, sin código HTML o scripts arbitrarios. Los botones personalizados eligen destinos internos conocidos. Las URLs sociales deben usar HTTP/HTTPS sin credenciales; configurar un enlace no publica ni envía mensajes en la red. El [manual del diseñador](DISENO.md) desarrolla el uso y ejemplos de combinación.

La pantalla de pago alojada en Mercado Pago corresponde a Checkout Pro y tiene la presentación de ese proveedor. Los cambios del diseñador se aplican a las páginas locales de la tienda.

## 7. Entrega, datos y verificación

| Aspecto | Alcance entregado |
| --- | --- |
| ZIP | Fuente de ambos workspaces, dependencias fijadas en el lockfile, `.env.example`, pruebas, documentación, PM2 y Docker Compose. El frontend se compila en el entorno de despliegue con `npm run build`. Excluye `node_modules`, `.env` real, bases de datos y datos de clientes. |
| Ejecución | Un proceso Node/Express en producción para API y cliente, administrable por PM2 en modo fork. El trabajador de correos/pedidos está en ese proceso. Las categorías usan exclusión persistida por tienda y recuperación antes de recibir tráfico; no ejecutar una segunda instancia mientras se recupera. |
| Persistencia | MongoDB, imágenes y comprobantes, sesión de WhatsApp y claves de entorno deben conservarse entre despliegues. |
| Demostración | Carga optativa e idempotente con `npm run seed:demo` y `DEMO_EMAIL`. La tienda Feria Estudio incluye tres categorías principales, tres subcategorías y seis productos, con variantes, destacados, un producto a pedido y uno digital; utiliza ilustraciones SVG propias. Los datos de cobro y enlace digital son ejemplos identificados. |
| Pruebas automáticas | La suite incluye API con MongoDB temporal y servicios del frontend, categorías profundas, mutaciones simultáneas, recuperación y fondos flexibles. Los resultados de la versión y el alcance de revisión de interfaz están en PRUEBAS.md. |
| Build y sintaxis | El ZIP no arrastra un `client/dist` de una versión anterior. Los resultados de sintaxis y las instrucciones de build están en PRUEBAS.md. |
| Arranque HTTP | Verificados API, MongoDB, cliente compilado, rutas profundas, PWA y privacidad de archivos. También verificados los dos workspaces en desarrollo y el proxy de Vite. |
| Revisión visual | Portada y tienda revisadas con API real y datos temporales. Panel/diseñador revisados con los componentes reales y datos en memoria, en escritorio y 390 × 844 simulado. Se comprobó sincronización, scroll independiente, selección de tienda, subcategorías y chip de destacados; alcance exacto en PRUEBAS.md. |
| Proveedores externos | Código real de SMTP, Mercado Pago y WhatsApp. Las pruebas automáticas usan respuestas controladas; no se enviaron mensajes con cuentas del usuario ni se hicieron cobros/emparejamientos reales. |
| Contenedores | Incluye configuración Docker/Compose; no se ejecutó la imagen Docker durante la preparación de esta entrega. |

La referencia de endpoints está en [API](API.md), las reglas de concurrencia en [Arquitectura](ARQUITECTURA.md), la instalación en [Despliegue](DESPLIEGUE.md) y los pasos con proveedores en [Integraciones](INTEGRACIONES.md). [Pruebas](PRUEBAS.md) contiene los casos y el recorrido de validación posterior.

## Administración · Emails y herramientas de prueba

- **Emails a vendedores:** plantillas de novedades de versión, comunicado y aviso de servicio, vista previa y envío mediante el SMTP configurado a todos los vendedores con email.
- **Personificación de vendedor:** disponible únicamente cuando `DEV_IMPERSONATION_ENABLED=true` fuera de producción. Permite entrar desde el ABM de Usuarios y regresar a la sesión administrativa sin utilizar el enlace mágico del vendedor.
- **Branding del panel:** todas las referencias visibles utilizan `MiTiendaYa`; el navbar aplica el wordmark adaptado al modo claro/oscuro.

## Planes comerciales y permisos efectivos · v1.14.0

Los planes se administran como una matriz de permisos. `featureKeys` contiene las funciones propias y `inheritsPlanId` permite heredar todas las funciones de un plan base. La herencia no copia precio, duración, cantidad de tiendas ni cantidad de productos. La autorización efectiva se calcula siempre en `PlanFeatureService` y se valida en frontend y backend.

| Clave | Funcionalidad |
| --- | --- |
| `section.products` | Sección Productos |
| `section.categories` | Sección Categorías |
| `section.stock` | Sección Stock |
| `section.orders` | Sección Pedidos |
| `section.payments` | Sección Cobros y entregas |
| `section.design` | Editor de Diseño |
| `section.contact` | Sección y formulario de Contacto |
| `section.domain` | Sección Dominio |
| `section.pwa` | Aplicación PWA por tienda |
| `domain.subdomain` | Subdominio MiTiendaYa |
| `domain.custom` | Dominio propio con validación/aprovisionamiento |
| `products.variants` | Variantes de producto |
| `products.digital` | Productos digitales |
| `products.featured` | Productos destacados |
| `products.related` | Productos relacionados/recomendados |
| `orders.manual` | Alta manual de pedidos |
| `payments.cash` | Efectivo |
| `payments.transfer` | Transferencia y comprobantes |
| `payments.mercadopago` | Mercado Pago Checkout Pro por tienda |
| `payments.delivery` | Formas de entrega configurables |
| `design.custom_sections` | Secciones y complementos personalizados |
| `design.theme_modes` | Temas claro/oscuro de la tienda |
| `design.backgrounds` | Fondos personalizados |
| `design.social_links` | Redes sociales |
| `design.category_navigation` | Navegación avanzada de categorías |
| `checkout.terms` | Términos personalizados y aceptación |
| `contact.whatsapp` | WhatsApp flotante |

Cualquier capacidad vendible nueva debe agregarse al catálogo central y tener una comprobación equivalente en la interfaz y en la API antes de considerarse parte de un plan.

## Planes, visibilidad y transferencias · v1.16.0

- **Herencia de planes:** un plan hijo guarda sólo funcionalidades adicionales. En la oferta comercial se muestra “Incluye todo lo de …” más esos adicionales, sin duplicar la lista heredada.
- **Planes ocultos:** `visible=false` los retira de la home y de la contratación general, pero continúan disponibles para asignación administrativa y para el vendedor que ya los tenga asignados.
- **Transferencia de tiendas:** el permiso `stores.transfer` permite iniciar una transferencia por email. Mientras esté pendiente la tienda continúa siendo del remitente y puede cancelarse.
- **Aceptación:** exige una suscripción vigente y un cupo libre en `maxStores`; una prueba gratuita no alcanza para aceptar una tienda.
- **Historial y devolución:** las tiendas transferidas permanecen en un historial y el receptor puede iniciar una devolución al dueño anterior mediante el mismo flujo pendiente/aceptación.

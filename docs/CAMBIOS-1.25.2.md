# MiTiendaYa 1.25.2

Versión de correcciones surgida del informe de QA end-to-end de la 1.25.1. Cada punto indica el identificador del hallazgo; las pruebas de regresión están en `api/test/qa125.test.js`.

## Correcciones críticas

- **C1 · Edición de productos.** `PUT /api/stores/:storeId/products/:id` devolvía siempre 500 porque el producto se leía sin `reservations` y luego se consultaba su longitud. Ahora se leen las reservas (siguen sin enviarse al cliente) y la edición funciona.
- **C2 · Build del cliente desactualizado.** `npm run build` genera `client/dist/build-info.json` con una huella del código de `client/`. El servidor la verifica al arrancar: en producción no inicia con un frontend viejo; en desarrollo avisa.

## Correcciones de severidad alta

- **A1 · Transferencia de tiendas.** Al aceptar una transferencia se quitan las cuentas de Mercado Pago, las formas de pago Checkout Pro, los datos bancarios (la forma de transferencia queda desactivada), teléfono/WhatsApp, y las conexiones de anuncios; el email de contacto pasa a ser el del nuevo dueño. No se puede transferir una tienda con pedidos sin finalizar (`TRANSFER_ORDERS_PENDING`). La pantalla de transferencias lo explica.
- **A2 · Vencimiento de reservas de Mercado Pago.** El worker procesa los pedidos en orden, registra cada intento fallido para que no ocupe el lote siguiente, marca `paymentIssue` y, si tras 24 h del vencimiento no pudo verificarse el pago, cancela el pedido y libera el stock (un pago posterior queda marcado para reintegro). La reparación de reservas huérfanas ya no se limita a los primeros 100 productos.
- **A3 · Cuerpo vacío.** Express 5 deja `req.body` en `undefined`; un middleware lo normaliza a `{}`. Los endpoints responden 4xx en lugar de 500.
- **A4 · Dependencias.** mongoose 9.12.1, multer 2.5.0, nodemailer 10.5.0, whatsapp-web.js 1.34.8, express-rate-limit 8.7.4, dotenv 18.0.10, vue 3.5.45, vue-router 5.5.1, vite 8.3.8 y `npm audit fix`. Se eliminan las vulnerabilidades de multer, mongoose y body-parser. Las restantes provienen sólo de la cadena whatsapp-web.js → puppeteer y no son alcanzables con la configuración actual (LocalAuth, sin descarga de Chromium, sin WebDriver BiDi).
- **A5 · Docker Compose.** Se agregan las variables de Instagram, Google Ads, YouTube, TikTok, aprovisionamiento de dominios y pedidos sin pago.

## Correcciones de severidad media

- **M1** · El tope de productos del plan se aplica aunque el plan esté vencido.
- **M2** · Nuevo `OFFLINE_ORDERS_PER_IP` (por defecto 3): máximo de pedidos impagos en efectivo/transferencia abiertos desde una IP por tienda. Nuevo `OFFLINE_ORDER_RESERVATION_HOURS` (por defecto 0 = sin vencimiento): cancela pedidos impagos sin comprobante y libera stock.
- **M3** · Al terminar la prueba sin plan, el vendedor conserva la gestión de contenido (productos, categorías, stock, pedidos, diseño básico), como indica la FAQ; no puede publicar ni usar integraciones.
- **M4** · CORS se aplica sólo a `/api`; los archivos estáticos ya no fallan por el `Origin`.
- **M5** · El permiso público de cada tienda reutiliza 30 s el cálculo de entitlement; la clave incluye las versiones del dueño y del plan, por lo que un cambio de plan se aplica de inmediato.
- **M6** · Suites en verde: API 208/208 (incluye 14 regresiones nuevas) y cliente 139/139. Las pruebas ya no usan R2 ni SMTP reales (`api/test/setup.mjs`). Se elimina `PlanView.vue`, sin uso.

## Correcciones menores

- **B1** · El seguimiento público ya no expone el identificador interno de la cuenta de Mercado Pago.
- **B2** · Página legal con ícono y anclas sin números duplicados; login root sin diferencia de tiempos para usuarios inexistentes; firma de webhooks de tiendas con `x-request-id` opcional; etiquetas de auditoría de la animación del panel de categorías.

## Hallazgos adicionales durante la verificación

- **N1 · TikTok Ads no podía conectarse.** `TikTokMarketingClient` guardaba el token en `this.accessToken`, lo que pisaba el método `accessToken(authCode)` del intercambio OAuth: la conexión fallaba siempre con `accessToken is not a function`. El token interno pasa a `this.token`. La suite simulada de TikTok pasa de 0/10 a 10/10.
- **N2 · Suite simulada de YouTube Ads.** El PNG de prueba del mock de Google Ads estaba corrupto y la librería de imágenes lo rechazaba (3 de 6 pruebas fallaban). Se reemplaza por un PNG válido; el código productivo no cambia.
- **N3 · Las pruebas usaban servicios reales.** `npm test` leía el `.env` y algunas pruebas subían imágenes al bucket R2 real y podían usar el SMTP real. `api/test/setup.mjs` lo impide. Nuevo `npm run test:all`, que corre además las suites simuladas de suscripciones y anuncios.
- **N4 · Edición de productos con categoría.** Detrás del error 500 de C1 había un segundo error: al editar un producto con categoría o productos relacionados, la validación recibía `ObjectId` y respondía 422. Corregido y cubierto por la prueba de regresión.

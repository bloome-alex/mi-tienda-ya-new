# Integraciones y funcionamiento comercial

La aplicación utiliza Programación Orientada a Objetos: `CommerceService` coordina pedidos, `InventoryService` controla existencias, `MercadoPagoService` encapsula la API del proveedor y `CommerceWorker` procesa tareas pendientes. La persistencia es MongoDB y el frontend es Vue con CSS propio.

## SMTP: acceso de vendedores y correos de pedidos

Configurá estas variables en `.env`:

```dotenv
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-usuario
SMTP_PASSWORD=tu-clave-smtp
SMTP_FROM="Mi Tienda Ya <tiendas@tudominio.com>"
```

Para el puerto 465 se suele usar `SMTP_SECURE=true`; seguí las indicaciones del proveedor contratado. Para Gmail se necesita la configuración de acceso SMTP permitida por la cuenta, por ejemplo una contraseña de aplicación cuando corresponda. No uses una contraseña personal dentro del frontend.

Los vendedores ingresan por enlaces enviados a su correo. El enlace se consume una sola vez y su vencimiento se controla en **Configuración → General**. Su token se guarda como hash en MongoDB. El período de prueba se inicia en el primer ingreso confirmado.

Si SMTP no está configurado, el acceso por correo devuelve un error explícito. No hay enlaces de ingreso públicos alternativos ni un modo productivo que entregue tokens en la respuesta de la API.

### Entregas digitales y reintentos

Los enlaces de productos digitales nunca se incluyen en el catálogo ni en el seguimiento público del pedido. Se toma una copia privada del enlace al crear la orden, de modo que una edición posterior del producto no altere lo que compró ese cliente.

Al confirmar el pago se registra un trabajo durable en `MailJob`. El proceso revisa la cola cada 30 segundos y reintenta los fallos con espera creciente, hasta ocho intentos. El detalle del pedido muestra el estado de entrega y permite volver a programar el correo.

Los webhooks repetidos no crean trabajos digitales nuevos. El envío usa un `Message-ID` estable. **La entrega SMTP es al menos una vez:** si el servidor de correo acepta un mensaje y el proceso se detiene antes de guardar que fue enviado, el siguiente intento puede repetirlo. MongoDB y SMTP no comparten una transacción; no se promete entrega exactamente una vez. La acción explícita de reenviar también puede generar un correo adicional.

## Mercado Pago Checkout Pro

Se implementa Checkout Pro mediante la **Preferences API**, con redirección al sitio de Mercado Pago. Los datos de tarjeta nunca pasan por la aplicación.

### Configuración por tienda

1. Creá una aplicación de Checkout Pro en tu cuenta de Mercado Pago.
2. Configurá `APP_URL` con la URL pública HTTPS de mi-tienda-ya-2.
3. En **Cobros y entrega**, agregá Mercado Pago y seleccioná las entregas para las cuales estará disponible.
4. Guardá el **Access Token** y la **clave secreta de Webhooks** de esa misma aplicación. Se cifran con `ENCRYPTION_KEY` antes de persistirlos.
5. Elegí el modo de prueba o producción según las credenciales utilizadas.
6. En la configuración de Webhooks del proveedor, habilitá el evento **Payments** y usá la URL de la tienda:

```text
https://TU-DOMINIO/api/webhooks/mercadopago/ID_DE_LA_TIENDA
```

La creación de preferencias también incluye esta URL. Debe ser accesible desde internet, tener HTTPS y conservar los encabezados `x-signature` y `x-request-id`, así como el parámetro de consulta `data.id`.

### Confirmación del pago

Cada preferencia incluye el identificador del pedido como `external_reference`, el identificador de tienda en `metadata`, los artículos calculados por el servidor y el costo de la entrega. La aplicación confirma pagos sólo después de verificar:

- Firma HMAC de la notificación, cuando el origen es un webhook.
- Respuesta autenticada de la API de Mercado Pago.
- Pedido y tienda asociados al pago.
- Destinatario del pago, moneda ARS e importe total.
- Estado `approved` del proveedor.

El retorno del navegador a la página de seguimiento **no confirma el pago**. Los parámetros `status`, `collection_status` o similares que aparecen en una URL no se consideran prueba de cobro.

El vendedor y el comprador pueden usar **Verificar pago** para consultar la API directamente. Resulta útil cuando todavía no llegó el webhook y al validar un entorno de pruebas. La disponibilidad de notificaciones de pagos de prueba depende del entorno de Mercado Pago; usá también su simulador y las instrucciones oficiales de integración.

Un pedido de Mercado Pago no puede pasarse manualmente a pagado desde el panel; primero debe verificarse con el proveedor. Los pedidos de efectivo y transferencia sí se confirman manualmente.

### Reservas y vencimiento

`ORDER_RESERVATION_MINUTES`, con 60 minutos como valor inicial, determina cuánto dura la reserva de una preferencia de Mercado Pago. La integración utiliza modo binario y excluye tickets y cajeros para este flujo de reserva corta. Este flujo de cobro de pedidos no implementa pagos parciales, pagos divididos en dos medios ni marketplace con comisiones. Las suscripciones de vendedores son una integración separada de plataforma descripta más abajo.

Antes de cancelar una reserva vencida, el worker consulta los pagos del pedido. Si el proveedor no responde, mantiene la reserva y vuelve a consultar. Un pago aprobado después de una cancelación genera una incidencia visible para que el vendedor revise o reintegre el importe desde Mercado Pago; no reabre el pedido ni entrega productos de forma automática.

La aplicación registra avisos de reembolso o contracargo cuando el proveedor los informa, pero no ofrece una API propia para ejecutar reintegros. Se gestionan desde Mercado Pago.


## Suscripciones de vendedores con Mercado Pago

Las suscripciones que cobra **Mi Tienda Ya a sus vendedores** son independientes del Checkout Pro que cada tienda usa para cobrar pedidos. El administrador configura una única cuenta cobradora desde **Configuración → Suscripciones**, guardando el Access Token y la clave secreta de Webhooks cifrados en MongoDB. No se exponen al frontend.

El vendedor usa **Mi suscripción** para elegir un plan activo, indicar el email de la cuenta de Mercado Pago que utilizará como pagador y abrir el checkout de suscripción. La aplicación crea un `preapproval`, guarda su identificador y procesa los eventos `subscription_preapproval` y `subscription_authorized_payment`. Los cobros aprobados agregan exactamente los días definidos por `Plan.durationDays` sobre el calendario de esa suscripción.

El administrador define `subscriptionGraceDays`. Si vence el período pagado y los cobros no se acreditan, la cuenta mantiene la edición del panel durante la mora y la tienda continúa publicada sólo hasta el fin de esa cortesía. La deuda se calcula por períodos vencidos y puede abarcar más de uno. Al alcanzar el límite de gracia, la habilitación pública se bloquea automáticamente; el usuario permanece activo para que Administración pueda filtrarlo en **Usuarios → Ver fuera de gracia**, contactarlo y decidir una baja manual.

Cancelar desde **Mi suscripción** envía la cancelación al proveedor de inmediato para impedir futuros cargos y conserva el acceso hasta `planExpiresAt`. **Desvincular Mercado Pago** deja esa vinculación fuera de uso y permite iniciar posteriormente otra suscripción, incluso indicando otro email de pagador.

Desde v1.19.0 la vinculación también se reconcilia frente a cambios hechos directamente en Mercado Pago. Si el proveedor cancela la autorización fuera de MiTiendaYa, **Mi suscripción** muestra un aviso de incidente con las acciones **Generar nueva vinculación** y **Cortar suscripción**. Si está pausada, permite reanudarla. Un cobro rechazado no crea automáticamente otra autorización: Mercado Pago documenta reintentos automáticos de la cuota y MiTiendaYa espera ese ciclo mientras conserva la política de deuda/cortesía. Los eventos se ordenan por fecha y la aplicación de períodos es idempotente para tolerar webhooks duplicados o fuera de orden.

Cada alta usa un `external_reference` único por intento. Si la conexión se corta después de que Mercado Pago haya creado el `preapproval` pero antes de responder, MiTiendaYa consulta `/preapproval/search` por el email pagador y recupera únicamente la vinculación cuyo `external_reference` coincide. De esta forma la recuperación no depende de asumir soporte de idempotencia no documentado para `POST /preapproval`.

Para notificaciones de plataforma deben habilitarse `subscription_preapproval`, `subscription_authorized_payment` y el tópico `payment`. Tanto `payment` como `subscription_authorized_payment` terminan aplicándose por la misma ruta idempotente de facturas autorizadas.

Para validar este flujo sin credenciales reales ejecutá `npm run test:mock:subscriptions`. El detalle de todos los escenarios está en [PRUEBAS-INTEGRACIONES-1.19.0.md](PRUEBAS-INTEGRACIONES-1.19.0.md).

Webhook de plataforma:

```text
https://TU-DOMINIO/api/webhooks/platform/mercadopago
```

La URL exacta también se muestra en Configuración → Suscripciones. Debe registrarse con los eventos de preapproval, pagos autorizados y pagos. Si la contratación automática se deshabilita desde Administración, no se crean nuevas suscripciones; las credenciales existentes siguen pudiendo usarse para sincronizar o cancelar vínculos ya creados.

## Transferencias y efectivo

Cada medio de pago puede restringirse a una o varias entregas mediante `deliveryIds`. Si no se elige una restricción, está disponible para todas las entregas activas. La configuración inicial de efectivo lo vincula al retiro en el local.

La transferencia admite titular, banco, CBU/CVU, alias, CUIT e instrucciones. Estos datos se muestran en el pedido luego del checkout. El comprador puede adjuntar una imagen o un PDF de hasta 8 MB desde su enlace privado de seguimiento.

El comprobante **no confirma que ingresó dinero**. El vendedor debe revisar la cuenta bancaria y marcar el pedido como pagado. Las imágenes se validan, se recodifican y se eliminan sus metadatos; los PDF se validan por su firma y terminación. Los archivos se guardan en `R2_RECEIPTS_BUCKET_NAME`, que debe permanecer privado, y sólo el dueño de la tienda o el administrador pueden descargarlos desde la API autenticada. No se incluye un antivirus de archivos.

Los pedidos de transferencia y efectivo no vencen automáticamente. El vendedor decide cuándo cancelarlos y liberar la reserva. Esta política evita descartar una transferencia que todavía debe conciliarse.

## Stock y consistencia en MongoDB standalone

No se requieren transacciones distribuidas ni replica set. La operación atómica se realiza sobre cada documento `Product`: se descuenta la cantidad disponible y se agrega la reserva del pedido en la misma actualización condicionada a disponer de stock suficiente.

Para pedidos con varios productos se aplica una compensación: si no se completa alguna reserva o falla el proveedor de pagos, se cancela el intento y se liberan las reservas anteriores. El pedido se registra antes de reservar para que el worker pueda recuperar un proceso interrumpido.

- El stock representa **unidades disponibles para nuevas compras**, descontadas las reservas pendientes.
- Cada variante administra su propia cantidad.
- Los productos digitales y los hechos a pedido no descuentan stock.
- Pagar confirma la reserva existente; no vuelve a descontar.
- Cancelar repone la reserva una sola vez.
- Un pedido pagado o cancelado es final. La entrega se gestiona por separado.
- Un ajuste manual cambia la cantidad disponible a un valor absoluto. Usa el valor previo conocido para detectar una venta concurrente y pedir revisión de esa fila.
- En una edición masiva pueden guardarse algunas filas y detectarse conflictos en otras. La API informa ambos resultados; no revierte ventas ni ajusta silenciosamente filas en conflicto.

El esquema mantiene índices únicos de idempotencia por tienda y claves únicas de trabajos. Las reservas entre distintos documentos tienen consistencia eventual durante una compensación, aunque cada descuento individual evita sobreventa. Un corte entre el movimiento de stock y su registro auxiliar puede requerir reconciliar el historial; el documento de producto y el estado de la orden son la referencia operativa.

## Vigencia y cupo de tiendas

El catálogo y el checkout vuelven a comprobar la vigencia del dueño y su cupo de tiendas en cada solicitud. Si el plan baja o vence y el vendedor vuelve a una prueba aún vigente, sólo se admiten las primeras tiendas activas según su fecha de creación y su identificador. Las excedentes dejan de vender sin perder su contenido, incluso si una reconciliación administrativa todavía no actualizó el campo `active`. El vendedor puede desactivar una tienda y activar otra dentro del cupo disponible.

El teléfono es obligatorio para pedidos que incluyen productos físicos. La opción **Exigir teléfono** del diseño también se valida desde la API para pedidos exclusivamente digitales.

## WhatsApp Web

La integración solicitada usa `whatsapp-web.js` con `LocalAuth`:

```dotenv
WHATSAPP_CLIENT_ID=mi-tienda-ya-2
WHATSAPP_DATA_PATH=./api/data/whatsapp
# Opcional, si usás un Chromium instalado por el sistema:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Sólo cuando el entorno de ejecución requiere desactivar el sandbox:
WHATSAPP_NO_SANDBOX=false
```

Cada aplicación debe tener un `WHATSAPP_CLIENT_ID` diferente. La carpeta de sesión debe persistir entre reinicios. No ejecutes dos procesos simultáneos con el mismo identificador y la misma carpeta; por eso el archivo PM2 incluido utiliza una instancia en modo fork.

Desde **Configuración → WhatsApp**, iniciá la primera conexión y escaneá el QR con WhatsApp. El panel consulta el estado periódicamente hasta observar la conexión. En reinicios posteriores, si `WHATSAPP_DATA_PATH` conserva una sesión `LocalAuth` y el administrador no pulsó **Desconectar**, la API programa una reconexión automática después de quedar disponible. Una desconexión manual deja una marca persistente para evitar que el siguiente reinicio vuelva a conectar por sí solo.

La conexión administrativa se mantiene separada de los botones `wa.me` de cada vendedor. Esos botones usan el número y mensaje configurados en **Contacto**, sin necesitar un navegador conectado para cada tienda.

`whatsapp-web.js` automatiza WhatsApp Web y depende de su compatibilidad con las versiones del sitio. No es la API empresarial oficial de Meta. La aplicación incluye el emparejamiento y el estado de conexión; no envía campañas masivas ni mensajes automáticos por WhatsApp.

## Facebook Ads / Marketing API

Desde v1.18.0 cada tienda puede conectar Facebook desde **Redes y anuncios**. La implementación usa OAuth para operación normal y admite de forma optativa un Marketing API Sandbox para pruebas. Los tokens se cifran antes de persistirse en MongoDB y nunca se exponen de vuelta al cliente.

Variables de servidor:

```dotenv
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v26.0
META_REDIRECT_URI=https://TU-DOMINIO/api/social/facebook/callback
META_FACEBOOK_LOGIN_CONFIG_ID=
META_SANDBOX_CONNECT_ENABLED=false
```

`META_APP_ID` y `META_APP_SECRET` provienen de la aplicación de Meta. `META_REDIRECT_URI` debe estar autorizada exactamente en la configuración de login. `META_FACEBOOK_LOGIN_CONFIG_ID` permite usar una configuración de Facebook Login for Business. El modo Sandbox manual debe habilitarse sólo en entornos controlados.

La pantalla solicita permisos publicitarios y de Página, lista las cuentas/Páginas que devuelve Meta y permite seleccionar una combinación por tienda. El primer flujo disponible crea anuncios de tráfico hacia una ficha de producto, limitado a ubicaciones de Facebook. Campaña, conjunto y anuncio nacen en `PAUSED`; MiTiendaYa no activa ni publica campañas automáticamente.

Para la prueba sin gasto de Facebook, usá una cuenta publicitaria Sandbox y su token desde las herramientas de Marketing API de Meta. El detalle paso a paso está en [Cambios 1.18.0](CAMBIOS-1.18.0.md). Esa sección describe el estado histórico de v1.18.0; desde v1.20.0/v1.21.0 Instagram, Google Ads, YouTube Ads y TikTok Ads también tienen integración activa.

Desde v1.19.0 el transporte Graph y la política de assets son inyectables. `npm run test:mock:facebook` levanta un Graph v26.0 local y prueba además el OAuth de producción completo (state, code, token corto, token largo, activos y permisos), cuentas publicitarias inactivas, payloads de campaña/conjunto/imagen/creativo/anuncio y rollback, sin realizar ninguna llamada a Meta. Pasar a QA/Producción sólo cambia el host inyectado por el Graph real y las credenciales/configuración; no existe un segundo camino de lógica de negocio exclusivo del mock.

## Fuentes oficiales consultadas

- [Mercado Pago: creación de preferencias](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/create-preference/post).
- [Mercado Pago: notificaciones de Checkout Pro](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications).
- [Mercado Pago: Suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview).
- [Mercado Pago: crear suscripción (`/preapproval`)](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/create-preapproval/post).
- [Mercado Pago: gestión y cancelación de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/subscription-management).
- [whatsapp-web.js: autenticación y múltiples sesiones](https://wwebjs.dev/guide/creating-your-bot/authentication.html).
- [whatsapp-web.js: LocalAuth](https://docs.wwebjs.dev/LocalAuth.html).
- [Cloudflare R2: S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
- [Cloudflare R2: public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/).
- [Google Ads API: release notes (v26)](https://developers.google.com/google-ads/api/docs/release-notes).
- [Google Ads API: Demand Gen](https://developers.google.com/google-ads/api/docs/demand-gen/overview).
- [Google Ads API: Demand Gen channel controls](https://developers.google.com/google-ads/api/docs/demand-gen/channel-controls).
- [TikTok API for Business: Marketing API v2.0](https://business-api.tiktok.com/portal/docs/marketing-api/v2.0).
- [TikTok API for Business: Identities](https://business-api.tiktok.com/portal/docs/identities/v1.3).

Estas integraciones requieren credenciales y cuentas propias. Las pruebas automatizadas del proyecto comprueban la lógica con servicios controlados; no sustituyen una compra de prueba con tus credenciales, un envío SMTP real ni el emparejamiento de tu cuenta de WhatsApp.

## Cloudflare R2

Desde v1.8.0 todos los archivos subidos por las tiendas se almacenan en R2. La integración usa directamente la API compatible con S3 mediante AWS Signature Version 4 y no necesita un SDK adicional.

### Variables

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ASSETS_BUCKET_NAME=mi-tienda-ya-assets
R2_RECEIPTS_BUCKET_NAME=mi-tienda-ya-receipts
R2_PUBLIC_URL=https://media.tu-dominio.com
# Opcional:
R2_ENDPOINT=
R2_PREFIX=mi-tienda-ya-2
```

El endpoint predeterminado es `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

### Separación pública/privada

`R2_ASSETS_BUCKET_NAME` puede publicarse con un Custom Domain y contiene sólo imágenes que la tienda necesita renderizar. `R2_RECEIPTS_BUCKET_NAME` debe permanecer privado y no debe tener `r2.dev` ni Custom Domain habilitados. Los comprobantes se leen desde el backend después de validar permisos.

Las credenciales deben tener acceso de lectura y escritura a ambos buckets, pero no necesitan permisos sobre otros buckets de la cuenta.

### Limpieza

La aplicación intenta eliminar de R2 de forma sincrónica cualquier objeto que deje de utilizarse al editar un producto o el diseño. El mismo criterio se aplica al archivar un producto o reemplazar un comprobante. Si R2 responde con un error temporal, se registra una tarea `StorageCleanup` en MongoDB; el worker reintenta y elimina la tarea cuando el objeto ya no está referenciado.

Los uploads que se crean pero nunca se guardan en un producto/diseño quedan marcados como no asociados. El cliente intenta borrarlos al cancelar o abandonar el formulario y el worker realiza una segunda limpieza de seguridad para uploads sin referencia de más de 24 horas.

### Chromium bajo PM2/root (v1.14.1)

Si Node se ejecuta con UID 0, MiTiendaYa agrega automáticamente `--no-sandbox` y `--disable-setuid-sandbox` al Chromium de WhatsApp. También usa `--disable-dev-shm-usage`, `--disable-gpu`, `--no-first-run` y `--no-default-browser-check` para un arranque más estable en servidores. `WHATSAPP_NO_SANDBOX=true` queda disponible para forzar el mismo comportamiento en contenedores o entornos no-root.

## Instagram Ads (v1.20.0)

Instagram Ads utiliza la misma aplicación de Meta que Facebook Ads, pero una conexión separada por tienda. Requiere una cuenta profesional de Instagram (Business o Creator) vinculada a una Página que el usuario administre.

Variables relevantes:

```env
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v26.0
META_INSTAGRAM_REDIRECT_URI=https://TU-DOMINIO/api/social/instagram/callback
META_FACEBOOK_LOGIN_CONFIG_ID=
META_SANDBOX_CONNECT_ENABLED=false
```

En Marketing API v26 los creativos de Instagram usan `instagram_user_id`. MiTiendaYa limita los ad sets creados desde la pestaña Instagram a `publisher_platforms: ['instagram']` y todos los objetos se crean en `PAUSED`.

Para validar la integración sin credenciales reales:

```bash
npm run test:mock:instagram
```

## Google Ads, YouTube Ads y TikTok Ads (v1.21.0)

Desde v1.21.0 **Redes y anuncios** queda completo con Facebook, Instagram, Google Ads, YouTube Ads y TikTok Ads. Cada proveedor mantiene su propia conexión por tienda y sus secretos se guardan cifrados en MongoDB.

### Google Ads

MiTiendaYa usa OAuth multiusuario con el scope `https://www.googleapis.com/auth/adwords` y acceso offline. La versión predeterminada es `v26`. Google Ads y YouTube comparten las credenciales OAuth de la aplicación pero usan callbacks e integraciones independientes.

```env
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_API_VERSION=v26
GOOGLE_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/google/callback
GOOGLE_YOUTUBE_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/youtube/callback
```

Desde el 9 de septiembre de 2026 Google administra los niveles de acceso de Google Ads API por proyecto de Google Cloud; MiTiendaYa no necesita enviar un developer token. Habilitá Google Ads API en el mismo proyecto que posee estas credenciales OAuth y solicitá el nivel de acceso que corresponda antes de usar cuentas de producción.

Google Ads crea anuncios Search de tráfico hacia productos. YouTube Ads crea campañas Demand Gen restringidas por channel controls a YouTube In-feed, In-stream y Shorts. Ambos flujos crean recursos en estado `PAUSED`.

### TikTok Ads

La integración usa TikTok API for Business / Marketing API y queda configurada por defecto en `v2.0`.

```env
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
TIKTOK_ADS_API_VERSION=v2.0
TIKTOK_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/tiktok/callback
TIKTOK_ADS_AUTHORIZATION_URL=
```

La URL de autorización se obtiene desde **TikTok for Business → My Apps → aplicación → Advertiser authorization URL**. El vendedor sigue esa autorización, y MiTiendaYa obtiene únicamente los anunciantes que ese usuario permitió administrar.

Después de seleccionar anunciante se cargan las identidades publicitarias no-Spark (`CUSTOMIZED_USER`) y los videos de su biblioteca. Este flujo usa `video_id`; las identidades Spark se excluyen porque TikTok las vincula a publicaciones mediante `tiktok_item_id`. MiTiendaYa crea campañas `TRAFFIC`, con `PLACEMENT_TIKTOK`, y fuerza campaña/grupo/anuncio a `DISABLE` hasta que el vendedor revise y active el contenido en TikTok Ads Manager.

### Gate de publicidad

```bash
npm run test:mock:ads
```

Para incluir además el stack de suscripciones de Mercado Pago:

```bash
npm run test:mock:integrations
```

El detalle de escenarios se encuentra en `docs/PRUEBAS-PUBLICIDAD-1.21.0.md`.

## Acceso publicitario por plan (v1.22.0)

Desde v1.22.0 el acceso a Redes y anuncios se controla con tres niveles acumulativos de plan:

- **Publicidad y Anuncios Limitado** (`ads.limited`): Facebook e Instagram.
- **Publicidad y Anuncios Premium** (`ads.premium`): suma Google Ads.
- **Publicidad y Anuncios Empresarial** (`ads.enterprise`): suma YouTube Ads y TikTok Ads.

El backend valida el nivel en conexión, actualización de activos, consulta de productos, creación de anuncios, desconexión y callback OAuth. El frontend utiliza el mismo entitlement para ocultar el acceso general y sólo renderiza las redes que devuelve la API.

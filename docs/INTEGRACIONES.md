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

Webhook de plataforma:

```text
https://TU-DOMINIO/api/webhooks/platform/mercadopago
```

La URL exacta también se muestra en Configuración → Suscripciones. Debe registrarse con los eventos de preapproval y pagos autorizados. Si la contratación automática se deshabilita desde Administración, no se crean nuevas suscripciones; las credenciales existentes siguen pudiendo usarse para sincronizar o cancelar vínculos ya creados.

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

Desde **Configuración → WhatsApp**, iniciá la conexión y escaneá el QR con WhatsApp. El panel consulta el estado periódicamente hasta observar la conexión. No se inicia un navegador al instalar el proyecto.

La conexión administrativa se mantiene separada de los botones `wa.me` de cada vendedor. Esos botones usan el número y mensaje configurados en **Contacto**, sin necesitar un navegador conectado para cada tienda.

`whatsapp-web.js` automatiza WhatsApp Web y depende de su compatibilidad con las versiones del sitio. No es la API empresarial oficial de Meta. La aplicación incluye el emparejamiento y el estado de conexión; no envía campañas masivas ni mensajes automáticos por WhatsApp.

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

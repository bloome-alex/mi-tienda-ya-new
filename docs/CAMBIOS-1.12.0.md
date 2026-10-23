# Cambios v1.12.0

## Focus más delicado

Se mantiene el diseño actual de inputs, selects y textareas, pero se elimina el marco azul fuerte que aportaba el navegador o el estilo anterior. El foco usa un borde neutro y una sombra mínima; `focus-visible` de campos no agrega un segundo outline. Botones y enlaces conservan una indicación de foco discreta para navegación por teclado.

## Mi suscripción y cobro recurrente

La sección **Tu plan** fue reemplazada por **Mi suscripción**. La ruta anterior `/app/plan` redirige para no romper favoritos.

Administración → Configuración incorpora **Suscripciones** con:

- habilitación o pausa de nuevas contrataciones;
- Access Token y secreto de Webhooks de la cuenta de Mercado Pago de la plataforma;
- modo sandbox/producción;
- días de cortesía configurables;
- URL exacta del Webhook de plataforma.

Las credenciales se cifran con `ENCRYPTION_KEY`. La interfaz sólo recibe indicadores `hasAccessToken` / `hasWebhookSecret`.

El vendedor puede contratar un plan activo, indicar el email de la cuenta de Mercado Pago que quiere utilizar, continuar un checkout pendiente, actualizar el estado, cancelar la renovación o desvincular la cuenta. La desvinculación deja libre la cuenta para crear una nueva suscripción con otro pagador.

La integración utiliza **Mercado Pago Suscripciones** (`/preapproval`) porque Checkout Pro de pedidos es un flujo de pago único distinto. Los Webhooks de suscripciones se procesan de forma separada de los Webhooks de cada tienda.

### Vencimiento, deuda y cortesía

Cada pago aprobado extiende el vencimiento exactamente por `durationDays` del plan. Los pagos posteriores se suman sobre el vencimiento acumulado y no sobre la fecha actual, de manera que una deuda de varios períodos no se perdona al acreditarse una sola cuota.

La política de facturación está encapsulada en `SubscriptionBillingPolicy` y la integración del proveedor en `PlatformMercadoPagoService` / `SubscriptionService`, manteniendo la arquitectura orientada a objetos.

Si hay períodos vencidos:

- se calcula cantidad de períodos y monto adeudado;
- durante `subscriptionGraceDays` el servicio público continúa habilitado;
- al cumplirse exactamente el límite de cortesía, la publicación deja de estar habilitada automáticamente;
- el usuario vendedor sigue activo y conserva el panel;
- Administración → Usuarios puede filtrar **Fuera de gracia** para contactarlo y, si corresponde, desactivarlo manualmente.

El panel del vendedor consulta el estado al abrirse y muestra una advertencia con deuda y fecha límite.

Cancelar renovación impide nuevos cargos en Mercado Pago pero conserva lo ya pagado hasta su vencimiento. Una suscripción cancelada no genera nueva deuda local.

Si Mercado Pago cancela la autorización automáticamente después de varios cobros rechazados, no se interpreta como una baja voluntaria: la deuda y la cortesía continúan calculándose hasta que el vendedor regularice o desvincule/revincule su medio de pago.

## PWA independiente por tienda

Dentro de **Tu tienda → Aplicación PWA** cada comercio puede definir:

- nombre de la aplicación;
- ícono propio.

El backend procesa el ícono a PNG 192×192 y 512×512, lo almacena en Cloudflare R2 y elimina versiones reemplazadas mediante el mismo sistema de limpieza de assets.

Cada tienda publica un `manifest.webmanifest` dinámico con `name`, `short_name`, `id`, `start_url`, `scope` e íconos propios. En dominio/subdominio el alcance es `/`; en la URL clásica el alcance es `/t/<slug>/`. La sugerencia de instalación se descarta por tienda, no globalmente para toda la plataforma.

## Compatibilidad

No hay migración destructiva. MongoDB crea las nuevas colecciones `subscriptions` y `subscriptioncharges` al iniciar. Los usuarios y planes existentes siguen funcionando con asignación manual. Las tiendas sin identidad PWA propia usan el nombre de la tienda y los íconos por defecto.

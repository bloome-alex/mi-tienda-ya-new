# Cambios 1.15.0

## Vinculación pendiente de suscripciones

- Administración puede configurar cuántas horas tiene un vendedor para completar una vinculación de Mercado Pago en `Administración > Configuración > Suscripciones`.
- El valor predeterminado es 24 horas y admite entre 1 y 720 horas.
- Cada intento guarda su propio `pendingExpiresAt`, por lo que un cambio posterior de configuración no altera una vinculación ya iniciada.
- Un worker revisa las vinculaciones pendientes cada minuto. Antes de cancelar consulta nuevamente a Mercado Pago para evitar cancelar una autorización que haya cambiado de estado justo antes del vencimiento.
- Si continúa `pending`, se cancela en Mercado Pago y se libera la vinculación local para poder iniciar otra.

## Cancelación desde Mi suscripción

- Cuando una vinculación está pendiente aparece `Cancelar vinculación`.
- Antes de cancelar, la API vuelve a consultar el estado real en Mercado Pago.
- La cancelación sólo afecta el intento pendiente. No elimina períodos pagados, una prueba vigente ni otras configuraciones del vendedor.

## Ayuda cuando Mercado Pago continúa pendiente

- El vendedor dispone de `Me vinculé pero sigue pendiente` mientras la suscripción continúa `pending`.
- Puede adjuntar una imagen JPEG/PNG/WebP o PDF de hasta 8 MB y un detalle opcional.
- El comprobante se almacena en `R2_RECEIPTS_BUCKET_NAME`, nunca en el bucket público.
- Administración visualiza las solicitudes desde `Configuración > Suscripciones`, puede abrir el comprobante y aprobar o rechazar la revisión.
- Aprobar no falsifica el estado de Mercado Pago. Si el proveedor aún sigue pendiente, MiTiendaYa habilita acceso manual por un período del plan mediante `subscriptionManualAccessUntil`.
- Si Mercado Pago confirma antes de la revisión administrativa, la solicitud se resuelve automáticamente sin otorgar un período manual adicional.
- Si la vinculación se cancela o vence, las solicitudes pendientes asociadas se cierran para que no queden revisiones obsoletas.

## Datos y compatibilidad

MongoDB agrega `subscriptionPendingLinkHours` a Settings, datos de expiración/cancelación a Subscription y la colección `SubscriptionSupportRequest`. No hay migración destructiva; los intentos pendientes de versiones anteriores reciben su vencimiento al ser revisados por el worker usando la configuración vigente.

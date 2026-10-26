# Cambios 1.19.0 · hardening y pruebas de integraciones

Esta versión se concentra en **testing, resiliencia y recuperación** de Mercado Pago Suscripciones y Facebook Ads. No agrega una nueva funcionalidad comercial a los planes.

## Suscripciones de Mercado Pago

- `PlatformMercadoPagoService` permite inyectar transporte y base URL para pruebas sin tocar el proveedor real.
- El intento de alta tiene un `checkoutAttemptId` persistente y un `external_reference` único. Si el `POST /preapproval` queda con resultado ambiguo por un corte de red, MiTiendaYa consulta `/preapproval/search` por pagador y recupera esa referencia exacta antes de volver a crear. Se conserva además una clave estable de intento como defensa adicional, sin depender de que Mercado Pago documente idempotencia para ese endpoint.
- Antes de enviar el alta se persiste `checkoutRequestStartedAt`. Si tras un reinicio el intento ya había sido enviado pero no puede reconciliarse, MiTiendaYa no repite el POST: muestra **Cancelar intento** para cerrar el estado incierto y recién después permitir uno nuevo.
- Se registra la fecha del último evento de pago para impedir que webhooks viejos pisen estados nuevos.
- Los pagos siguen siendo idempotentes mediante IDs aplicados y `SubscriptionCharge` único.
- El tópico `payment` se reconcilia buscando la factura autorizada por `payment_id` y pasa por el mismo camino idempotente que `subscription_authorized_payment`.
- Una cancelación externa ya no deja al vendedor bloqueado indefinidamente: aparece un aviso en **Mi suscripción** y puede generar una nueva vinculación o cortar la actual.
- Una pausa externa puede reanudarse desde MiTiendaYa.
- Los errores de sincronización quedan registrados en la suscripción en lugar de desaparecer silenciosamente.
- La cancelación iniciada desde MiTiendaYa deja intención persistida para poder reconciliar una respuesta perdida del proveedor o una caída del proceso entre el cambio remoto y el guardado local.
- Se mantiene el período ya pagado aunque se cancele la renovación.

## Facebook Ads

- `MetaGraphClient` admite `fetch`, base URL, versión, secreto y timeout inyectables.
- `PublicAdAssetPolicy` encapsula validación SSRF/descarga de URLs públicas y también es inyectable.
- `FacebookAdsService` usa esas dependencias sin cambiar el flujo productivo.
- El stack mock prueba también el OAuth usado en producción: state, intercambio a token corto/largo, descubrimiento de usuario, cuentas, Páginas y permisos.
- Se rechazan cuentas publicitarias inactivas y se detecta si una cuenta conectada deja de estar activa.
- El stack mock comprueba campaña, ad set, imagen, creativo y anuncio, todos pausados, junto con rollback ante fallos parciales.

## Comandos

```bash
npm run test:mock:subscriptions
npm run test:mock:facebook
npm run test:mock:integrations
```

Ver [PRUEBAS-INTEGRACIONES-1.19.0.md](PRUEBAS-INTEGRACIONES-1.19.0.md) para escenarios, resultados esperados y el paso posterior hacia QA.

# Pruebas mock de integraciones · v1.19.0

Esta versión incorpora dos stacks de prueba **totalmente locales** para validar la lógica de MiTiendaYa antes de usar credenciales de QA o Producción. Los scripts levantan servidores HTTP mock en `127.0.0.1` y una instancia temporal de MongoDB con `mongodb-memory-server`. No llaman a Mercado Pago ni a Meta, no usan tarjetas, no publican anuncios y no pueden gastar dinero.

## Requisitos

- Node.js **22.18+** (recomendado Node 24.11+).
- Dependencias instaladas con `npm ci`.
- La primera ejecución de `mongodb-memory-server` puede necesitar descargar el binario de MongoDB si no existe en caché.

## 1. Stack de suscripciones de Mercado Pago

Comando:

```bash
npm run test:mock:subscriptions
```

El script `scripts/test-subscriptions-mock.mjs` levanta un proveedor local compatible con los endpoints usados por MiTiendaYa (`/preapproval`, `/authorized_payments/search` y `/authorized_payments/:id`) y ejecuta **16 subtests**. Dentro de esos subtests se verifican estas 17 situaciones (algunas se validan juntas porque forman parte del mismo flujo):

1. Alta positiva: checkout pendiente, autorización y cuota aprobada.
2. Alta ambigua cuando Mercado Pago crea la suscripción pero se pierde la respuesta HTTP: MiTiendaYa genera un `external_reference` único por intento, consulta `/preapproval/search` por pagador y recupera exactamente esa vinculación antes de intentar crear otra. También conserva una clave de intento estable como defensa adicional, pero la reconciliación no depende de que Mercado Pago documente idempotencia para `POST /preapproval`.
3. Reinicio después del commit remoto: existe el `preapproval` en el proveedor pero el ID nunca llegó a MongoDB; el siguiente intento lo recupera por referencia antes de hacer otro POST.
4. Intento enviado pero imposible de reconciliar: MiTiendaYa no repite automáticamente el POST, muestra el estado incierto y exige cancelar ese intento antes de iniciar otro.
5. Webhook con firma HMAC inválida: se rechaza sin modificar estado.
6. Credenciales rechazadas por Mercado Pago: se informa el error y el intento local queda auditable, sin inventar una vinculación remota.
7. Cuota rechazada/recycling y posterior reintento aprobado.
8. Webhooks fuera de orden: un rechazo viejo no degrada un pago aprobado más nuevo.
9. Webhook duplicado: un pago aprobado no agrega dos veces los días del plan.
10. Cancelación desde MiTiendaYa: se cancela en el proveedor, no quedan futuros cobros y se conserva el período ya pagado.
11. Pérdida de respuesta durante una cancelación iniciada por MiTiendaYa: el mock aplica el cambio remoto, corta el socket y el servicio reconcilia el estado antes de responder.
12. Cancelación desde Mercado Pago: MiTiendaYa detecta la autorización cancelada, muestra el incidente y habilita crear una nueva vinculación o cortar la anterior.
13. Pausa externa y reanudación desde MiTiendaYa.
14. Desvinculación de una autorización ya cancelada sin enviar un PUT redundante.
15. Error temporal al consultar cuotas: no se oculta; se registra como error de sincronización.
16. Cancelación de una vinculación todavía pendiente.
17. Reconciliación del tópico `payment` buscando la factura por `payment_id`, sin aplicar períodos por duplicado.

### Qué debe verse

El proceso debe terminar con **16/16 subtests** en `ok` y exit code `0`. Si falla, copiá **la salida completa** y enviámela; no uses credenciales reales para “confirmar” el fallo.

## 2. Stack de Facebook Ads / Meta Marketing API

Comando:

```bash
npm run test:mock:facebook
```

El script `scripts/test-facebook-ads-mock.mjs` levanta un Graph API local bajo `/v26.0`. MiTiendaYa usa el mismo `MetaGraphClient` y el mismo `FacebookAdsService` que en producción; sólo se inyectan el host mock y una política de assets controlada.

**11 subtests** verifican las siguientes 14 condiciones (varias comprobaciones pertenecen al mismo flujo end-to-end):

1. Conexión Sandbox: valida cuenta publicitaria y Página contra Graph mock.
2. Comprueba que el access token se guarde cifrado en MongoDB y no vuelva en la respuesta segura.
3. OAuth de producción simulado de punta a punta: state de un solo uso → authorization code → token corto → token largo → usuario → cuentas publicitarias → Páginas → permisos.
4. OAuth con permisos incompletos: rechaza la conexión y no persiste una integración parcial.
5. Cuenta publicitaria inactiva: se rechaza al conectar y también se detecta si deja de estar activa durante un refresh.
6. Creación completa: campaña → conjunto → imagen → creativo → anuncio.
7. Verifica `OUTCOME_TRAFFIC`, `PAUSED`, presupuesto, país y `publisher_platforms: ['facebook']`.
8. Comprueba `appsecret_proof` y access token en todas las llamadas Graph.
9. Fallo después de crear la campaña: intenta borrar la campaña parcial y no persiste un `SocialAd` incompleto.
10. Fallo antes de crear la campaña: no ejecuta un rollback inválido.
11. Meta recibe una imagen pero no devuelve `hash`: aborta y limpia la campaña.
12. Token inválido: no crea una integración local.
13. Refresh de Sandbox: vuelve a validar los activos y conserva la selección.
14. Si la cuenta publicitaria deja de estar activa, el refresh marca la integración en error y bloquea nuevas publicaciones.

### Qué debe verse

El proceso debe terminar con **11/11 subtests** en `ok` y exit code `0`. El mock registra los payloads form-encoded que recibiría Meta, de modo que el test valida tanto envío como respuesta.

## Ejecutar ambos stacks

```bash
npm run test:mock:integrations
```

Si este comando pasa, el siguiente paso es QA con credenciales reales. **No significa que Mercado Pago o Meta hayan aprobado credenciales, permisos, revisión de app, medio de pago, límites de cuenta o políticas comerciales**; esos factores sólo existen contra los proveedores reales.

## Casos cubiertos y límites

### Mercado Pago

La implementación sigue el modelo actual de Suscripciones con `preapproval`. Mercado Pago documenta que una cuota rechazada puede entrar en `recycling` con hasta 4 reintentos dentro de una ventana de 10 días, y que luego de 3 cuotas con pagos rechazados la suscripción puede cancelarse automáticamente. Por eso MiTiendaYa no crea una segunda autorización mientras la actual siga activa/reintentando. Si Mercado Pago cancela la autorización, la UI ofrece **Generar nueva vinculación** o **Cortar suscripción**.

Para un alta cuyo `POST /preapproval` queda con resultado de red ambiguo, MiTiendaYa usa un `external_reference` único y reconcilia mediante `/preapproval/search` filtrando el resultado exacto. Esto evita basar la consistencia en un header no documentado específicamente para la creación de `preapproval`.

Si después de un reinicio o una falla de red ese intento no puede confirmarse ni descartarse, MiTiendaYa prioriza evitar duplicados: no vuelve a ejecutar el alta. En **Mi suscripción** aparece el intento pendiente con la acción **Cancelar intento**; recién después puede iniciarse otra vinculación.

Para cancelar o pausar una suscripción Mercado Pago documenta `PUT /preapproval/{id}` con `status: canceled` o `paused`; una pausada puede reactivarse. Los webhooks se validan con la firma `x-signature` antes de consultar el recurso real.

### Meta

La integración se mantiene fijada en `v26.0`. Todos los objetos creados por MiTiendaYa salen en `PAUSED`. El stack mock valida la forma de las llamadas, pero no reemplaza App Review, permisos reales, disponibilidad de activos ni reglas de entrega de Meta.

## Paso posterior en QA/Producción

Cuando ambos mocks pasen:

- **Mercado Pago:** cargar Access Token y Webhook Secret reales desde Administración, registrar los tópicos `subscription_preapproval`, `subscription_authorized_payment` y `payment`, y realizar primero una prueba controlada con credenciales/cuenta de prueba.
- **Facebook:** completar `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` y, si corresponde, `META_FACEBOOK_LOGIN_CONFIG_ID`. No se cambia código para pasar de mock a Graph real: el servicio por defecto usa `https://graph.facebook.com`.

## Documentación de referencia revisada para v1.19.0

- Mercado Pago · Authorized payments / retry logic: https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments
- Mercado Pago · Create subscription (`POST /preapproval`): https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/create-preapproval/post
- Mercado Pago · Search subscriptions (`GET /preapproval/search`): https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/search-preapproval/get
- Mercado Pago · Subscription management: https://www.mercadopago.com.ar/developers/en/docs/subscriptions/subscription-management
- Mercado Pago · Webhooks: https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications
- Mercado Pago · Subscription notification topics: https://www.mercadopago.com.ar/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications/additional-info
- Meta · Graph / Marketing API changelog (v26.0): https://developers.facebook.com/docs/graph-api/changelog/
- Meta Business SDK · object creation / paused ads: https://github.com/facebook/facebook-php-business-sdk/blob/main/DEVELOPER_GUIDE.md

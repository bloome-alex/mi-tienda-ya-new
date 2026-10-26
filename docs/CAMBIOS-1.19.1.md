# MiTiendaYa 1.19.1

## Corrección del stack mock de suscripciones

Esta revisión corrige el fallo detectado al ejecutar el stack `test:mock:subscriptions` de la versión 1.19.0.

### Causa

`SubscriptionService.applyAuthorizedPayment()` usa `User.findOneAndUpdate()` con un **aggregation update pipeline** (un array) para aplicar de forma atómica el período pagado y registrar el identificador del pago ya procesado. Con la versión actual de Mongoose, ese formato requiere pasar explícitamente `updatePipeline: true` en las opciones de la consulta.

Sin esa opción, Mongoose abortaba antes de ejecutar la actualización y cinco escenarios que acreditaban un pago aprobado fallaban con:

`Cannot pass an array to query updates unless the updatePipeline option is set.`

### Corrección

Se agregó `updatePipeline: true` únicamente a esa operación atómica. No se modifica la lógica de negocio, la política de idempotencia ni el comportamiento de Mercado Pago.

También se agregó un contrato de regresión para impedir que esa opción vuelva a eliminarse accidentalmente.

### Facebook Ads

No se realizaron cambios funcionales en Facebook Ads porque el stack mock de la versión 1.19.0 pasó 11/11 escenarios.

### Comandos de validación

```bash
npm run test:mock:subscriptions
npm run test:mock:facebook
npm run test:mock:integrations
```

El resultado esperado es:

- Mercado Pago: 16/16 subtests aprobados.
- Facebook: 11/11 subtests aprobados.
- Integraciones: ambos stacks consecutivos sin fallos.

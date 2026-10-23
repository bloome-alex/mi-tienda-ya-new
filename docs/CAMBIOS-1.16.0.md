# Cambios 1.16.0

## Planes: herencia real y visibilidad

- Los planes hijos almacenan únicamente sus funcionalidades adicionales. Las funcionalidades del plan base se resuelven dinámicamente mediante `PlanFeatureService`.
- En las cards se muestra `Incluye todo lo de <plan base>` y sólo los adicionales del plan hijo, evitando repetir la misma lista.
- Se agregó `visible` al plan. Un plan oculto sigue activo y puede asignarse desde Administración, pero no aparece en la home ni se ofrece a otros vendedores para contratarlo.
- Si un vendedor ya tiene asignado un plan oculto, puede seguir viéndolo y renovándolo desde Mi suscripción.
- El arranque normaliza planes anteriores para quitar de `featureKeys` cualquier permiso que ya venga heredado.

## Nueva funcionalidad vendible: transferencia de tiendas

Se agregó el permiso `stores.transfer` al catálogo de funcionalidades de planes.

Un vendedor con ese permiso puede iniciar una transferencia ingresando el email de la persona destinataria. La tienda conserva su dueño actual y puede seguir administrándose hasta que la otra persona acepte.

El destinatario:

- ve una notificación de transferencia en el navbar;
- puede abrir `/app/transfers` aunque su plan no incluya `stores.transfer`;
- debe tener una suscripción vigente, no una prueba, y un cupo de tienda disponible;
- recién al aceptar se modifica `Store.ownerId` y se consume su cupo;
- si su primer acceso ocurre por una transferencia pendiente, MiTiendaYa no crea una tienda vacía automática que le consumiría ese primer cupo.

El remitente puede cancelar mientras siga pendiente. Cuando la transferencia se acepta, la tienda desaparece de sus tiendas activas y queda registrada en el historial.

El nuevo dueño puede devolver la tienda al dueño anterior. Esa devolución genera otra solicitud pendiente y utiliza exactamente las mismas validaciones de suscripción/cupo al aceptar.

## Persistencia y concurrencia

La colección `StoreTransfer` conserva remitente, email destinatario, snapshots mínimos, estado e historial. Un índice único parcial impide más de una transferencia pendiente por tienda. La asignación final reutiliza `QuotaService`, por lo que también respeta la exclusión mediante `ownerSlot`/`publicationSlot`.

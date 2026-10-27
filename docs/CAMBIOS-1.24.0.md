# MiTiendaYa 1.24.0

## Límites comerciales sin tope técnico

- `maxPaymentMethods` y `maxDeliveryMethods` siguen siendo configurables por plan.
- El valor `0` representa **sin límite**.
- Se eliminó el máximo técnico artificial de 20 tanto del esquema de MongoDB como de la validación HTTP y del servicio que controla los cupos.
- Los planes y snapshots legados que no tenían estos campos se completan con `0`, para no introducir una restricción inesperada.
- Administración puede escribir cualquier entero no negativo desde el formulario del plan.

## Dashboard de administración: suscripciones

El resumen administrativo incorpora un bloque **Suscripciones por plan** que muestra:

- cantidad de vendedores activos con cada plan asignado;
- precio y duración configurados en el plan;
- equivalente mensual por usuario cuando la duración difiere de 30 días;
- estimación mensual bruta por plan;
- estimación mensual bruta total;
- vendedores activos que todavía no tienen un plan asignado.

La estimación se calcula sobre los planes asignados y **no descuenta comisiones de Mercado Pago**. Es una proyección informativa, no un registro de cobros acreditados.

## Actividad reciente

Se corrigió la composición visual del bloque del Dashboard. Actor/tienda y fecha-hora ahora se renderizan en elementos separados, evitando textos pegados como `Administración27 oct 2026, 3:12 p. m.`.

## Reportes de errores

Se agregó un flujo completo de reportes basado en servicios orientados a objetos y persistencia MongoDB:

### Vendedores

- nueva sección **Reportar un error** disponible para todos los vendedores, sin depender del plan;
- comentario obligatorio;
- hasta 5 adjuntos JPG, PNG, WebP o GIF;
- hasta 8 MB por archivo y 24 MB por reporte;
- asociación opcional con la tienda activa;
- historial reciente con estado, adjuntos y notas de administración;
- confirmación al enviar: **“Gracias por reportar el error. Tendremos información en próximas novedades de versión.”**

### Administración

- nuevo ABM **Reportes de errores**;
- búsqueda por vendedor, email, tienda, comentario o nota administrativa;
- filtro por estado;
- detalle con evidencia visual;
- estados `Nuevo`, `En revisión`, `Resuelto` y `Cerrado`;
- nota administrativa visible para el vendedor;
- eliminación controlada del reporte y de sus archivos;
- auditoría para altas, modificaciones y bajas.

### Archivos

Los adjuntos se almacenan en el bucket privado ya utilizado por MiTiendaYa para documentos sensibles y se sirven únicamente mediante endpoints autenticados. Los trabajos de limpieza también reconocen estos archivos para evitar borrados mientras el reporte exista.

## Actualización

La actualización no requiere cambios manuales en MongoDB. Al iniciar la API se crean los índices del nuevo modelo `BugReport` y se ejecutan las migraciones de compatibilidad existentes.

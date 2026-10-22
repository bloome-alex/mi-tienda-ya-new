# Verificación de mi-tienda-ya-2 · v1.8.0

Esta iteración migra el almacenamiento de archivos de la tienda a Cloudflare R2 y agrega limpieza sincronizada de objetos. La base de datos continúa siendo MongoDB y la lógica nueva se encapsula en servicios orientados a objetos (`R2StorageService`, `ImageService`, `AssetService` y `StorageCleanupService`).

## Pruebas ejecutadas

Se ejecutaron **55 pruebas de lógica y contrato sin dependencias externas**, todas aprobadas. Incluyen las regresiones de categorías, checkout, textos, diseñador, navegación y las pruebas nuevas de R2.

Las pruebas específicas de v1.8.0 verifican:

- construcción de requests S3 firmadas con AWS Signature Version 4, región `auto` y encoding seguro de object keys;
- recolección de todas las imágenes anidadas del diseño sin confundirlas con enlaces sociales/botones;
- limpieza de uploads temporales en formularios y llamadas de sincronización al editar/eliminar productos o diseño;
- separación entre `R2_ASSETS_BUCKET_NAME` y `R2_RECEIPTS_BUCKET_NAME`, evitando que los comprobantes utilicen el bucket público.

Además, `node scripts/check.mjs` comprobó sintaxis válida en **30 archivos JavaScript**, incluyendo los nuevos servicios R2, el migrador y las rutas modificadas.

## Pruebas que requieren dependencias

Se intentó completar `npm ci`, pero la instalación no finalizó dentro del límite del entorno de preparación y dejó paquetes incompletos. Esa instalación parcial se eliminó antes de armar el ZIP.

Por ese motivo no se afirma en esta entrega:

- compilación de Vite en este entorno;
- ejecución de pruebas que importan Vue/`@vue/compiler-sfc`;
- pruebas integradas con `mongodb-memory-server`;
- operaciones reales contra una cuenta Cloudflare R2.

El ZIP no contiene `node_modules` ni un `client/dist` de una versión anterior. En tu entorno ejecutá:

```bash
npm ci
npm run build
npm test
npm start
```

## Verificación recomendada con tus buckets

Después de completar las variables R2, comprobá en un entorno de prueba:

1. subir una foto de producto y confirmar que aparece en el bucket de assets;
2. reemplazarla, guardar el producto y verificar que el objeto anterior desaparece;
3. eliminar/archivar un producto y verificar la limpieza de sus imágenes no compartidas;
4. cambiar logo/fondo/imagen de una sección y verificar la misma limpieza;
5. cargar un comprobante y confirmar que existe sólo en el bucket privado;
6. reemplazar el comprobante y confirmar que el anterior se elimina;
7. ejecutar `npm run migrate:r2` sobre una copia de una instalación anterior antes de aplicarlo a producción.

## Verificación v1.10.0 · dominios por tienda

Se agregaron pruebas contractuales para comprobar:

- esquema e índices únicos de subdominio y dominio propio;
- variables `STOREFRONT_*` y nombres reservados;
- normalización, unicidad y verificación TXT dentro de `DomainService`;
- resolución de tienda por `Host` y aceptación CORS sólo para hostnames asociados;
- rutas de configuración/verificación por tienda;
- retorno de Mercado Pago al dominio de la tienda conservando `APP_URL` para Webhooks;
- rutas limpias del storefront cuando Express inyecta el slug por hostname;
- enlaces del panel que priorizan `publicUrl`.

En este entorno pasaron 11/11 pruebas específicas de v1.10.0 y la comprobación sintáctica de 32 archivos JavaScript. Una regresión más amplia ejecutó 75 casos: 72 pasaron y tres archivos de pruebas no pudieron cargar porque `npm ci` no completó la instalación de Vue. El intento offline confirmó que faltaba al menos `zod` en la caché. Por esa misma razón no se certifica aquí una compilación Vite; el paquete se entrega sin `node_modules` parciales ni `client/dist` heredado.

La verificación real de DNS/TLS necesita el dominio, proveedor DNS y proxy/CDN de la instalación: no se modifica DNS externo desde las pruebas locales.

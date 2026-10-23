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

## Verificación v1.11.0 · Nginx y SSL automático por dominio propio

Se agregaron pruebas contractuales para las variables `DOMAIN_PROVISIONING_*`, el uso de `execFile` sin shell, el orden TXT → aprovisionamiento → `verified`, la limpieza al cambiar/archivar una tienda, el helper ACME y la instalación restringida por sudoers. También se actualizó la prueba del panel para comprobar “Verificar y activar dominio”.

En la regresión ejecutable sin instalar dependencias externas pasaron **44/44 casos**, incluidos **7 casos nuevos de v1.11.0**. `node --check` pasó sobre todos los JavaScript de `api/src` y `scripts`, `bash -n` pasó en ambos scripts de servidor y todos los JSON/lockfiles se parsearon correctamente.

Además se simuló el helper con binarios falsos de Nginx, systemctl y Certbot. La simulación confirmó: creación del sitio HTTP, `nginx -t`, reload, llamada `certbot certonly --webroot`, escritura del bloque `443 ssl`, segundo reload y eliminación posterior de sitio/certificado.

`npm ci --ignore-scripts` volvió a superar el límite de ejecución del entorno y dejó una instalación parcial; se detuvo el proceso y se eliminó `node_modules` antes de empaquetar. Por esa razón el ZIP no incluye `node_modules` ni `client/dist` y la compilación Vite debe ejecutarse en el servidor con `npm ci && npm run build`.

## Verificación v1.12.0 · suscripciones, cortesía, focus y PWA por tienda

Se agregaron pruebas puras para `SubscriptionBillingPolicy` que cubren acumulación de períodos, deuda monetaria, duración propia del plan, cancelación sin nueva deuda y expiración exacta al alcanzar el último instante de cortesía.

Las pruebas contractuales verifican configuración administrativa de Mercado Pago, endpoints de contratación/sincronización/cancelación/desvinculación, extensión idempotente de períodos, filtro de usuarios fuera de gracia, manifest dinámico por tienda y procesamiento/limpieza en R2 de los íconos PWA 192/512.

En frontend se verifica la eliminación del focus azul fuerte, reemplazo de Tu plan por Mi suscripción, alerta de deuda al abrir el panel, filtro administrativo, configuración PWA en Tu tienda y el descarte del prompt de instalación por comercio.

### Resultado final v1.12.0

- **17/17 pruebas nuevas de v1.12.0 aprobadas** (política de deuda/cortesía, contratos de API y contratos de interfaz).
- **38/38 pruebas de regresión v1.9.0–v1.12.0 aprobadas** en la ejecución sin dependencias externas.
- La corrida amplia de tests del cliente alcanzó **63 casos aprobados**; 7 archivos de prueba no pudieron cargar porque este entorno no completó la instalación de Vue/`@vue/compiler-sfc`. No hubo fallos de aserción en esos siete archivos: fallaron al resolver módulos.
- Se validó sintaxis de los JavaScript modificados, los `<script setup>` de las vistas Vue tocadas y el parseo de `package.json`/`package-lock.json`.
- El lockfile actual contiene dependencias que requieren Node `^22.18.0 || >=24.11.0`; el proyecto declara ahora ese mismo mínimo y mantiene Node 24 como versión recomendada.

El ZIP se entrega sin `node_modules` y sin un `client/dist` heredado. Para validación integral en el servidor se recomienda Node 24.11+ y ejecutar `npm ci && npm run build && npm test`.

## Verificación v1.13.0 · personificación, emails, branding y modo oscuro

Se agregaron pruebas contractuales para comprobar que la personificación sólo pueda habilitarse fuera de producción, que las sesiones conserven el administrador de origen y que existan tanto el ingreso desde el ABM como la salida hacia Administración.

También se verifican las rutas y plantillas del módulo de emails, la validación de asunto/CTA, el hint de Suscripciones, el nuevo branding visible `MiTiendaYa`, el wordmark especial del navbar y la paleta crema del modo oscuro.

Las pruebas de focus de v1.12 se mantienen como regresión: inputs, selects, textareas y búsquedas quedan sin halo azul, mientras enlaces/botones conservan una señal mínima de foco para teclado.

### Resultado final v1.13.0

- **8/8 pruebas específicas nuevas aprobadas** para personificación, emails, hint, branding y modo oscuro.
- **46/46 pruebas de regresión seleccionadas v1.9.0–v1.13.0 aprobadas**.
- `node scripts/check.mjs` validó sintaxis en **36 archivos JavaScript**.
- Se comprobaron además **73 bloques `<script>` de componentes Vue** con `node --check`.
- Los scripts shell pasan `bash -n` y `package.json`/`package-lock.json` parsean correctamente.
- No se incluyeron `node_modules` ni `client/dist` heredado en el paquete.

## Verificación v1.14.0 · permisos comerciales y ajuste visual

Se agregaron pruebas de contrato para comprobar que el modelo persiste `featureKeys`/`inheritsPlanId`, que el catálogo contiene las secciones y capacidades vendibles iniciales, que la herencia detecta ciclos y que los planes anteriores mantienen acceso mediante la inicialización de compatibilidad.

La cobertura nueva también verifica `requireFeature`/`PLAN_FEATURE_REQUIRED`, rutas protegidas de Productos/Categorías/Stock/Pedidos/Diseño/Contacto/Dominio/PWA, restricciones de productos y medios de pago, y que dominio, manifest PWA y contacto público no sigan operando cuando el plan no incluye esas capacidades.

En frontend se comprueba el wordmark limpio, el negro profundo con textos crema y acentos vivos, la herencia visible en el ABM, el filtrado de menú/rutas/editor, botones secundarios outlined y cursor de interacción para controles clickeables.


### Resultado v1.14.0

- **56/56 pruebas de regresión seleccionadas v1.9.0–v1.14.0 aprobadas**.
- `node scripts/check.mjs`: sintaxis válida en **37 archivos JavaScript** de API/scripts.
- Comprobación sintáctica adicional: **73 bloques `<script>` de Vue** válidos.
- JSON y lockfiles principales válidos.
- El entorno de preparación usa Node **22.16.0**, por debajo del requisito actual del lockfile (`^22.18.0 || >=24.11.0`), por lo que no se certifica aquí una recompilación Vite. El paquete se entrega sin `node_modules` ni `client/dist` heredado. Para despliegue se recomienda Node 24.11+ y ejecutar `npm ci && npm run build && npm test`.

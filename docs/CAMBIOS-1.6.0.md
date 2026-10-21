# mi-tienda-ya-2 · Cambios de la versión 1.6.0

Esta versión parte de v1.5.0 y contiene únicamente los dos ajustes solicitados para navegación de categorías y grillas responsivas.

## Cabecera de categorías

- Se eliminó el hueco interactivo entre la fila de categorías principales y el submenú.
- El panel comienza solapándose un píxel con la cabecera para que no exista una franja sin `hover`.
- Se agregó una tolerancia de 120 ms al abandonar la zona. Si el cursor entra al submenú durante ese cruce, el cierre se cancela.
- Se mantiene el despliegue recursivo de subcategorías hasta el último nivel y el soporte por foco de teclado.

## Columnas de grilla por dispositivo

El diseñador ahora permite indicar por separado cuántas columnas se ven en escritorio y en celular en:

- Productos destacados.
- Catálogo.
- Complementos de secciones personalizadas.
- Grilla de fotos de la página de producto.

En el carrusel de destacados, esas cantidades también determinan cuántos productos quedan visibles simultáneamente según el dispositivo.

La API valida los nuevos valores usando el mismo contrato compartido de diseño. No se agrega una colección ni una migración de MongoDB.

## Compatibilidad con diseños anteriores

`normalizeDesign()` mantiene el valor antiguo `shop.columns` como referencia para las nuevas columnas de escritorio de Catálogo y Destacados. Los valores de celular se completan con valores compatibles y quedan editables desde Diseño. Las secciones personalizadas existentes conservan una columna en celular hasta que el vendedor elija otra densidad.

## Actualización

Respaldá `.env`, MongoDB y los archivos persistentes como en las versiones anteriores. Después reemplazá el código y ejecutá:

```bash
npm ci
npm run build
npm start
```

Si usás PM2:

```bash
pm2 restart mi-tienda-ya-2 --update-env
```

El ZIP no incluye `node_modules` ni un `client/dist` de una versión anterior.

# Verificación de mi-tienda-ya-2 · v1.6.0

Esta iteración corrige la continuidad del hover entre las categorías de cabecera y su submenú, y separa la cantidad de columnas de las grillas para escritorio y celular. La base de datos continúa siendo MongoDB y la lógica de negocio mantiene su organización mediante Programación Orientada a Objetos.

## Pruebas ejecutadas

Se ejecutaron **45 pruebas de lógica y contrato que no requieren instalar Vue**, todas aprobadas. Incluyen categorías multinivel, checkout, copy, normalización del diseño, navegación segura de la vista previa y las regresiones específicas de v1.4.0, v1.5.0 y v1.6.0.

Las pruebas nuevas verifican que:

- el submenú de categorías no se cierre al cruzar desde la fila principal hacia el panel;
- la cabecera conserve la expansión multinivel por hover y foco;
- Destacados tenga columnas independientes para escritorio y celular;
- Catálogo tenga columnas independientes para escritorio y celular;
- las secciones personalizadas tengan columnas independientes para escritorio y celular;
- la grilla de fotos del producto tenga columnas independientes para escritorio y celular;
- la configuración antigua `shop.columns` se migre por normalización a las nuevas densidades de escritorio sin modificar los documentos de MongoDB.

También se comprobó con `node --check` la sintaxis de los servicios JavaScript modificados y de los bloques `<script setup>` de los componentes Vue afectados.

## Dependencias y build

El ZIP no incluye `node_modules`. Se intentó instalar las dependencias declaradas por `package-lock.json`, pero la instalación no terminó dentro del límite del entorno de preparación. Por eso no se afirma una recompilación local de Vite para v1.6.0.

Para evitar entregar un `client/dist` viejo mezclado con código nuevo, el paquete no incluye esa carpeta. En el entorno de instalación ejecutá:

```bash
npm ci
npm run build
```

Luego podés ejecutar `npm test`, `npm run check` y `npm start`. `mongodb-memory-server` puede descargar MongoDB la primera vez que corre la suite de API.

## Compatibilidad

No hay migración de MongoDB. Los nuevos campos de columnas se agregan por normalización al leer el diseño. Las tiendas existentes conservan su cantidad de columnas de escritorio del catálogo anterior y pueden ajustar por separado la densidad en celular desde Diseño.

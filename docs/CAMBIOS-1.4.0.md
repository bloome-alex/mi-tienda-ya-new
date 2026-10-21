# mi-tienda-ya-2 · Cambios de la versión 1.4.0

Esta iteración concentra cinco ajustes de experiencia solicitados sobre la versión 1.3.0. No cambia el modelo de datos principal, los roles ni el circuito de pedidos. La aplicación continúa usando Vue en el frontend y Node.js, Express y MongoDB en la API, con la lógica de negocio organizada mediante Programación Orientada a Objetos.

## Selector claro / oscuro en la cabecera

El control de tema de la tienda ahora utiliza un contenedor flex con alineación vertical y horizontal explícita. Mantiene el tamaño circular, el foco accesible y la adaptación móvil, pero ya no queda desplazado respecto del carrito y las demás acciones del navbar.

## Categorías en la cabecera

Cuando la variante **En la cabecera** está activa:

- En equipos con mouse, una categoría que tenga descendientes abre su submenú al pasar el puntero por encima.
- También se abre al recibir foco por teclado.
- Hacer clic en el nombre sigue seleccionando la categoría principal.
- En pantallas táctiles se conserva un control explícito para desplegar la rama, porque esos dispositivos no tienen hover estable.
- Los submenús siguen admitiendo todos los niveles de categorías configurados.

De esta forma, en escritorio no hace falta tocar un botón adicional para descubrir las subcategorías.

## Panel desplegable dentro del catálogo

La variante **Panel desplegable** deja de usar una capa global sobre toda la tienda. El botón de categorías expande un panel dentro de la propia sección de catálogo:

- No bloquea el `body`.
- No cubre el navbar ni otras secciones.
- No se monta como drawer de la aplicación principal.
- Conserva su propio scroll cuando el árbol es largo.
- Al elegir una categoría, el panel se cierra y el catálogo mantiene el filtro en la URL.

La variante **Panel lateral** continúa fija al costado en escritorio y usa el panel interno cuando necesita adaptarse a pantallas pequeñas.

## Textos centralizados

**Diseño → Textos** pasa a ser el único lugar para editar contenido escrito de la tienda.

Se centralizan allí los textos comunes y también los que antes aparecían repartidos entre Cabecera, Tienda, Secciones, Producto, Carrito, Checkout y Términos, incluyendo:

- Títulos y descripciones.
- Etiquetas y mensajes.
- Textos de botones.
- Título del navbar.
- Etiquetas de enlaces de navegación.
- Títulos, descripciones y botones del carrusel.
- Contenido de secciones y complementos anidados.
- Texto personalizado de redes sociales.
- Títulos y contenido de términos.

Las demás pestañas siguen controlando estructura, visibilidad, imágenes, destinos, tamaños, variantes y comportamiento. Pueden mostrar el contenido existente como referencia, pero ya no ofrecen un segundo campo para modificarlo.

Los datos administrativos de la tienda, como su nombre interno y su dirección pública (`slug`), siguen dentro de Identidad porque no son copy de una sección visual.

## ABM de categorías como árbol desplegable

El listado de Categorías sigue siendo una tabla, pero su presentación ahora es jerárquica:

1. Al entrar se muestran sólo las categorías principales.
2. Si una fila tiene subcategorías aparece un control para desplegarla.
3. Cada subcategoría puede desplegar sus propios hijos.
4. El comportamiento continúa de forma recursiva para todos los niveles existentes.
5. La sangría y el nivel ayudan a identificar la posición de cada fila.
6. La búsqueda muestra una coincidencia junto con todos sus ancestros para conservar el contexto.
7. Una rama desplegada se mantiene junta en la tabla; no se corta artificialmente por paginación.

Las acciones de crear subcategoría, editar y eliminar siguen disponibles en cada nivel. Una categoría con hijos no se puede eliminar hasta mover o quitar sus descendientes.

## Compatibilidad

Los cambios de esta versión son de interfaz y organización del editor. El formato persistido del diseño se mantiene compatible con las tiendas de v1.3.0; los textos no se migran a claves nuevas, sino que se editan desde un catálogo centralizado que apunta a las propiedades ya existentes.

La jerarquía de categorías continúa usando `parentId` en MongoDB y no agrega un límite fijo de profundidad.

## Actualización desde v1.3.0

Respaldá MongoDB, tu archivo `.env`, las cargas persistentes y la sesión de WhatsApp. Conservá especialmente `ENCRYPTION_KEY` y `SESSION_SECRET`.

Después de reemplazar el código:

```bash
npm ci
rm -rf client/dist
npm run build
npm start
```

Si usás PM2:

```bash
pm2 restart mi-tienda-ya-2 --update-env
```

No hace falta volver a cargar tiendas, categorías ni productos.

## Verificación de esta iteración

Se agregaron pruebas específicas para:

- Árbol del ABM con raíces, expansión progresiva y búsqueda con ancestros.
- Apertura por hover de las categorías del navbar.
- Ausencia del antiguo drawer global.
- Panel de categorías contenido dentro del catálogo.
- Centralización de textos y ausencia de campos duplicados en los editores visuales.
- Alineación del selector de tema.

En el entorno de preparación se ejecutaron **34 pruebas de lógica y contrato sin dependencias externas**, todas aprobadas, además de comprobación de sintaxis de los scripts modificados.

La instalación de dependencias de npm y, por lo tanto, la recompilación local de Vite no pudo completarse en este entorno porque `registry.npmjs.org` no resolvió por DNS (`EAI_AGAIN`). Por esa razón el ZIP no incluye un `client/dist` recompilado: ejecutá `npm ci && npm run build` en el entorno de instalación antes de iniciar esta versión. Esto evita entregar recursos compilados de v1.3.0 mezclados con el código fuente v1.4.0.
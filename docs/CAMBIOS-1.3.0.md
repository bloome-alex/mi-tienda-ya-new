# mi-tienda-ya-2 · Cambios de la versión 1.3.0

Esta versión amplía la personalización de cada tienda con una cabecera configurable, más textos editables, categorías multinivel y secciones de redes sociales. También flexibiliza los fondos y corrige el espacio de las tarjetas en el carrusel de destacados. El frontend continúa usando Vue y CSS propio.

## Home de la plataforma

La página pública de presentación de Mi Tienda Ya usa una navbar y todo el ancho disponible, sin menú lateral. El panel privado del administrador y del vendedor conserva la navbar fija, el menú lateral y el selector de tienda.

La configuración de cada tienda se mantiene separada de la presentación de la plataforma: modificar su cabecera no cambia el tamaño de la barra del panel ni el área de trabajo del diseñador.

## Cabecera, título y logo

La nueva pestaña **Diseño → Cabecera** permite configurar:

- Altura en escritorio, entre 48 y 220 px, y en celular, entre 48 y 160 px.
- Espacio lateral entre 0 y 120 px y opción de mantener la cabecera visible al desplazarse.
- Título basado en el nombre de la tienda, título personalizado o cabecera con sólo el logo. Un título personalizado vacío se conserva vacío. Se elimina el punto agregado después del nombre.
- Ancho y alto del logo por dispositivo, formas **Natural**, **Cuadrada**, **Redondeada** y **Circular**, y ajuste para mostrar la imagen completa o rellenar el marco. La imagen mantiene su proporción; rellenar puede recortar los bordes.
- Hasta 12 enlaces con texto, destino, visibilidad y orden propios. Pueden dirigir al inicio, catálogo, destacados, contacto, términos, redes o una sección personalizada concreta.

Los controles del logo admiten anchos de 24 a 480 px y altos de 24 a 200 px en escritorio; en celular, anchos de 24 a 280 px y altos de 24 a 144 px. El tamaño efectivo se adapta al espacio disponible dentro de la cabecera para evitar desbordes. Para mostrar un logo más alto, aumentá también la altura de la barra.

Ocultar o quitar un enlace del menú conserva su sección. Los destinos deshabilitados o inexistentes se omiten de la navegación pública. Destacados, Contacto y Redes también necesitan contenido disponible para mostrar su acceso. En celular, los enlaces se agrupan en el menú de la cabecera.

El nombre general de la tienda sigue identificándola en administración, pedidos y correos, aunque su título público esté vacío.

## Textos, alineación y dirección

La nueva pestaña **Textos** agrega **122 textos editables** organizados en Textos comunes, Tienda y catálogo, Contacto y WhatsApp, Producto, Carrito, Checkout, Términos y Seguimiento del pedido. Incluye títulos complementarios, descripciones, etiquetas, ayudas, mensajes de catálogo vacío, botones y textos de formularios.

El editor permite buscar, seleccionar una página, mostrar sólo textos personalizados y restaurar cada texto a su valor inicial. Los títulos y mensajes que ya existían en las pestañas Tienda, Producto, Carrito, Checkout y Términos conservan sus controles.

Los valores vacíos se guardan como vacíos. Las variables disponibles, como `{storeName}`, `{count}` o `{pages}`, se indican en los campos que las usan y se reemplazan al mostrar el contenido. Los textos ingresados no se interpretan como HTML ni JavaScript. Los estados de pedidos, errores y otros mensajes operativos conservan su significado y no se reemplazan desde este editor.

La **alineación** y la **dirección de lectura** se configuran por separado:

| Ajuste | Opciones |
| --- | --- |
| Alineación | Izquierda, centro o derecha. |
| Dirección general, en Identidad | Izquierda a derecha, derecha a izquierda o detección automática. |
| Dirección por zona | Heredar la dirección general o elegir una dirección propia. |
| Complementos | Heredar la alineación y dirección de su sección o elegir valores propios. |

Estos controles se incorporan al anuncio, portada, destacados, catálogo, tarjetas, contacto y pie. Producto, carrito, checkout y términos tienen sus propios ajustes; las secciones adicionales también.

## Categorías y subcategorías multinivel

Las subcategorías pueden contener otras subcategorías. Por ejemplo: **Indumentaria → Remeras → Manga corta → Estampadas**.

El listado mantiene el formato de tabla y muestra la jerarquía. El formulario permite elegir una categoría contenedora de cualquier nivel válido. Mover una categoría conserva sus descendientes y los productos asignados. La API impide referencias a otra tienda, ciclos y movimientos dentro de la propia rama.

Los filtros incluyen los productos de la categoría seleccionada y todos sus descendientes. Desactivar una categoría oculta su rama en la navegación pública y conserva los productos. Para eliminar una categoría con descendientes, primero hay que mover o eliminar sus subcategorías, incluso las inactivas.

En **Diseño → Tienda → Catálogo → Cómo elegir categorías**, se ofrecen cinco presentaciones:

| Variante del editor | Presentación pública |
| --- | --- |
| **Chips** | Botones para recorrer categorías y subcategorías por nivel. |
| **En la cabecera** | Categorías en el navbar, con submenús para sus descendientes. |
| **Panel desplegable** | Filtros que se abren desde un botón. |
| **Selector** | Lista compacta con las rutas de categorías. |
| **Panel lateral** | Árbol junto al catálogo en escritorio, adaptado a un panel desplegable en celular. |

La selección queda reflejada en la URL. Se conserva la posibilidad de limpiar el filtro y volver a todos los productos.

## Redes sociales por tienda

**Redes sociales** se incorpora como el séptimo tipo de sección predefinida. Se agrega desde **Diseño → Secciones** y puede ubicarse antes o después del catálogo.

Cada sección admite hasta 12 enlaces. Podés elegir Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Pinterest, Threads, Twitch, WhatsApp o Sitio web, indicar la URL del perfil, escribir una etiqueta opcional y ordenar u ocultar cada red. Una etiqueta vacía usa el nombre de la red.

La presentación puede usar **Sólo iconos**, **Icono y nombre** o **Tarjetas**. El tamaño de los iconos se configura entre 16 y 64 px. También se pueden definir título, subtítulo, texto, fondo, alineación, dirección, espaciados y apertura en otra pestaña, además de agregar complementos como en las demás secciones.

Una red habilitada dentro de una sección visible necesita una URL HTTP o HTTPS válida. Si falta, el guardado muestra el error y abre ese enlace para corregirlo. Podés conservar una sección completa oculta mientras terminás de prepararla.

El destino **Redes sociales** de la cabecera lleva a la primera sección habilitada que tenga enlaces de redes visibles y válidos. Para enlazar otra sección concreta, elegí **Una sección personalizada**. Esta función abre perfiles públicos y no necesita conectar cuentas ni configurar APIs de redes sociales.

## Fondos con resoluciones flexibles

Las medidas que v1.2.0 exigía de forma exacta pasan a ser recomendaciones:

| Uso | Medida recomendada |
| --- | --- |
| Escritorio | 1920 × 1080 px. |
| Celular | 1080 × 1920 px. |
| Imagen compartida | 1920 × 1920 px. |

Se admiten imágenes estáticas JPEG, PNG o WebP de hasta **5 MiB y 25 millones de píxeles**, con dimensiones enteras positivas y cualquier proporción. No hay una resolución mínima ni una relación de aspecto obligatoria. Por ejemplo, 1600 × 900, 1200 × 1200 y 900 × 1600 son resoluciones válidas.

Se conserva la validación de contenido, orientación, integridad y pertenencia de la imagen a la tienda. El servidor mantiene las dimensiones del fondo, sin imponer un recorte ni reescalarlo a las medidas recomendadas. Los fondos que ya estaban cargados en v1.2.0 siguen siendo compatibles.

El modo por dispositivo requiere una carga para escritorio y otra para celular antes de activarlo. **Cubrir el área** puede recortar los bordes según la pantalla; **Mostrar la imagen completa** conserva toda la fotografía y puede dejar visible el color de fondo. Revisá ambos tamaños de vista previa al elegir el ajuste.

## Carruseles, diseñador y auditoría

El carrusel de destacados incorpora espacio alrededor de las tarjetas para que la primera y las siguientes conserven sus sombras y efectos. Los controles quedan separados del contenido. Se mantienen las opciones de avance automático, intervalo, velocidad, repetición y pausa.

El marco de previsualización conserva su tamaño acotado al área disponible. Los controles y la tienda se desplazan en sus propios paneles. La navegación real dentro del marco sigue seleccionando la página correspondiente del diseñador. Las pestañas Identidad, Cabecera, Secciones y Textos conservan el foco frente a mensajes repetidos de la misma página de vista previa.

El guardado valida los nuevos tamaños, textos, enlaces y redes antes de enviar cambios incompletos. Los errores mantienen el borrador y abren el campo correspondiente. Se conservan la espera de imágenes pendientes, el guardado de datos generales y diseño, y las opciones Guardar, Descartar o Seguir editando al salir. El aviso al cerrar o recargar la pestaña sigue dependiendo del navegador.

La auditoría presenta nombres legibles para los nuevos campos, enlaces de cabecera y redes sociales. Los eventos anteriores se conservan con el detalle que se hubiera registrado en su momento.

## Actualizar desde v1.2.0 conservando los datos

La actualización utiliza la misma base MongoDB y los mismos directorios persistentes. No requiere volver a crear usuarios o tiendas ni ejecutar la carga de demostración. Conservá una copia del código anterior junto con un respaldo previo a la actualización.

### 1. Identificar la configuración y detener la aplicación

Antes de reemplazar archivos, identificá la carpeta desde la que se ejecuta la instalación, la base indicada por `MONGODB_URI`, el archivo de variables y las rutas de datos. Si usás `ENV_FILE`, conservá ese archivo y su ruta. Las variables definidas en el gestor del proceso también forman parte de la configuración.

Detené todas las instancias de la API que utilicen esa base. En PM2:

```bash
pm2 stop mi-tienda-ya-2
```

Si ejecutás `npm start` o `npm run dev` en una terminal, detené ese proceso antes de continuar. Mantené MongoDB disponible para realizar el respaldo y el arranque posterior.

La ejecución soportada es **un proceso de API por instalación**. Express sirve también el frontend compilado. La inicialización de categorías y la sesión de WhatsApp requieren que no haya otra API de la misma instalación funcionando en paralelo; mantené PM2 con `instances: 1` y `exec_mode: 'fork'`.

### 2. Respaldar datos y secretos

Con la aplicación detenida, respaldá conjuntamente:

| Elemento | Qué conservar |
| --- | --- |
| MongoDB | La base completa de la instalación, con sus usuarios, tiendas, categorías, productos, pedidos y registros. |
| Configuración | `.env` o el archivo indicado por `ENV_FILE`, además de las variables del gestor de procesos y los ajustes propios de despliegue. |
| Imágenes y comprobantes | El directorio `UPLOAD_DIR`; si no está configurado, `api/data/uploads`. |
| Sesión de WhatsApp | `WHATSAPP_DATA_PATH`; si no está configurado, `api/data/whatsapp`. |
| Claves y conexión | Los valores vigentes de `ENCRYPTION_KEY`, `SESSION_SECRET`, `WHATSAPP_CLIENT_ID`, SMTP, dominio público y conexión MongoDB. |

Mantené las claves originales: los datos cifrados existentes necesitan la misma `ENCRYPTION_KEY`. La actualización no reinicia la contraseña almacenada del administrador ni renueva pruebas o planes. Las variables `ROOT_USER` y `ROOT_PASSWORD` siguen siendo necesarias para validar el arranque.

### 3. Reemplazar el código e instalar

Extraé el nuevo ZIP en una carpeta temporal. Copiá su código a la instalación conservando el archivo de variables, `api/data` y cualquier directorio externo de datos. Compará `.env.example` con tu configuración para conocer las opciones disponibles; el archivo de ejemplo no debe reemplazar tus valores vigentes.

Si elegís ejecutar la nueva versión desde otra carpeta, trasladá también los directorios persistentes que antes usaban rutas predeterminadas o configurá sus rutas absolutas. Verificá la carpeta de trabajo y el archivo de variables del gestor de procesos antes de iniciar.

Desde la carpeta de la instalación actualizada:

```bash
npm ci
npm run build
```

El ZIP incluye el cliente compilado; compilar en el servidor permite regenerarlo a partir del código instalado. `npm ci` utiliza las versiones del archivo de bloqueo. El mínimo de Node.js declarado por el proyecto es 22.12.0.

### 4. Iniciar una sola instancia y revisar la normalización

Para una instalación PM2 existente:

```bash
pm2 restart mi-tienda-ya-2 --update-env
pm2 logs mi-tienda-ya-2
```

Si utilizás una ejecución directa, iniciá `npm start` con tu configuración habitual. Elegí un solo método para esa instalación.

Al arrancar, la aplicación prepara los índices y las referencias internas de categorías antes de aceptar solicitudes. El campo `parentId` conserva la relación entre cada categoría y su padre. La inicialización completa metadatos faltantes y recupera operaciones interrumpidas, manteniendo las categorías y asignaciones válidas existentes. Si detecta un ciclo o una referencia inválida, detiene el arranque y lo informa en los registros para que se revise esa jerarquía; no elimina ramas para ocultar el problema.

Los diseños se normalizan de forma compatible al cargarse: los campos nuevos reciben sus valores iniciales y los campos conocidos que ya estaban configurados conservan sus valores, incluidos los textos vacíos. En tiendas anteriores que tenían logo y todavía no tienen configuración de Cabecera, el título se mantiene oculto inicialmente para conservar esa presentación. Al guardar desde el diseñador se persiste la configuración ampliada.

Las categorías existentes de uno o dos niveles siguen funcionando. Los nuevos niveles se agregan desde sus formularios. No es necesario recargar la demostración, reimportar el catálogo ni reiniciar la base.

### 5. Comprobar tu instalación

Después del arranque, abrí `/api/health` y revisá que informe conexión con MongoDB. Recargá la aplicación en el navegador para cargar la nueva compilación.

Ingresá con una cuenta existente y verificá el listado de tiendas, productos y categorías. Abrí una tienda pública, comprobá que sus imágenes y fondos sigan disponibles y recorré Cabecera, Textos y Secciones desde el diseñador. Revisá escritorio y celular; guardá cuando quieras aplicar tus ajustes nuevos. La configuración existente de cobros, entrega, contacto y términos se conserva en la misma base.

### Instalaciones con Docker Compose

Conservá el archivo de variables, el nombre del proyecto Compose y los volúmenes existentes `mongo_data` y `app_data`. Detené solamente el servicio de aplicación antes del respaldo y del reemplazo de código:

```bash
docker compose stop app
```

Después de respaldar la base y los datos persistentes, reemplazá el código y reconstruí el servicio usando la misma configuración:

```bash
docker compose up -d --build --no-deps app
docker compose logs -f app
```

El servicio MongoDB debe continuar disponible durante este procedimiento. Conservá sus credenciales actuales y los volúmenes; `docker compose down -v` los elimina y no forma parte de la actualización. La [guía de despliegue](DESPLIEGUE.md) detalla las rutas, los permisos y la persistencia.

## Documentación relacionada

- [Manual del diseñador](DISENO.md): controles, variantes y ejemplos de configuración.
- [Instalación y despliegue](DESPLIEGUE.md): PM2, Docker, HTTPS y respaldos.
- [Arquitectura](ARQUITECTURA.md): normalización, jerarquía de categorías y reglas de consistencia.
- [Cambios de v1.2.0](CAMBIOS-1.2.0.md): historial anterior. Sus medidas exactas para fondos quedan reemplazadas por las recomendaciones de v1.3.0.

# Manual del diseñador de tiendas

## Área de trabajo

Elegí la tienda desde el selector de la navbar. El nombre permanece visible mientras configurás su diseño. Los controles se desplazan dentro de su panel y la tienda se desplaza dentro de la vista previa. En pantallas pequeñas se distribuyen en dos áreas acotadas, para conservar el contexto.

Los cambios de diseño se muestran inmediatamente en el marco. **Guardar cambios** los aplica a la tienda. Los campos generales —nombre, identificador y descripción— se incluyen cuando están pendientes. Si salís o cambiás de tienda antes de guardar, elegí Guardar, Descartar o Seguir editando. Un error de guardado mantiene abierta la edición.

La vista previa utiliza las mismas páginas y componentes que la tienda pública. Podés abrir un producto, entrar al carrito y avanzar al checkout; los controles del lado izquierdo acompañan la página visitada. La vista previa permite probar las validaciones y no crea pedidos.

## Identidad y apariencia

Configurá logo, icono, tipografía, redondeado y paleta de colores. Hay una paleta para claro y otra para oscuro, cada una con color principal, acento, fondo y texto. Elegí una combinación que mantenga el texto legible sobre su fondo.

El **modo inicial** puede ser claro, oscuro o según el dispositivo. **Permitir elegir claro u oscuro** habilita el selector de apariencia incluso cuando el modo inicial es claro u oscuro. Si esta opción está desactivada, la tienda usa el modo inicial definido por el vendedor. La preferencia del visitante queda asociada a esa tienda en el navegador y no cambia el tema del panel de administración.

### Fondo de pantalla

Activá el fondo y elegí un archivo compartido o uno para cada tipo de pantalla. Las siguientes medidas son **recomendaciones**, no requisitos exactos:

- Compartido: 1920 × 1920 px.
- Escritorio: 1920 × 1080 px.
- Celular: 1080 × 1920 px.

Se aceptan imágenes estáticas JPEG, PNG o WebP de hasta 5 MiB y 25 millones de píxeles, con cualquier proporción y dimensiones positivas. Por ejemplo, una foto de 1600 × 900, una cuadrada de 1200 × 1200 o una vertical de 900 × 1600 son válidas. No se exige una resolución mínima. Una imagen pequeña puede verse pixelada al ampliarla.

El servidor comprueba nuevamente el contenido, la orientación, la integridad del archivo y su pertenencia a la tienda al guardarlo. Los fondos conservan su resolución. El modo por dispositivo sigue requiriendo dos cargas identificadas, una para escritorio y otra para celular; podés usar la misma fotografía en ambos campos si te sirve su encuadre.

**Cubrir** llena la superficie y recorta los bordes que no entran. **Contener** conserva la foto entera. Podés elegir posición superior, centrada o inferior, desplazamiento con la página o fijo y una superposición distinta para claro y oscuro. La superposición ayuda a reducir el ruido detrás del contenido. Para una imagen compartida, mantené el motivo principal en la zona central.

## Cabecera y navegación

La pestaña **Cabecera** configura el navbar de la tienda. El panel de trabajo tiene su propia barra y no cambia al modificar estos valores.

| Opción | Configuración |
| --- | --- |
| Altura | De 48 a 220 px en escritorio y de 48 a 160 px en celular. La fila de categorías, si se usa, se suma a la altura principal. |
| Posición | Mantener la cabecera visible al desplazarse o dejar que se desplace con la página. |
| Título | Mostrar el nombre administrativo, escribir un texto propio o desactivar el título. Un texto propio vacío se conserva vacío. |
| Logo | Ancho y alto independientes por dispositivo; proporción libre, cuadrado, redondeado o círculo; ajuste para contener o cubrir. |
| Enlaces | Hasta 12 accesos ordenables con su propio texto y visibilidad. |

Para usar **sólo el logo**, cargalo en Identidad y desactivá Mostrar título en Cabecera. También podés desactivar Usar el nombre de la tienda y dejar vacío el texto propio. No se agrega un punto ni otro carácter después del nombre. Esto no modifica el nombre que identifica la tienda en pedidos, correos y administración.

El tamaño del logo se adapta al espacio disponible en el navbar, sin desbordarlo. Para mostrar una imagen alta, aumentá también la altura de la barra. En forma circular o cuadrada se usa un recuadro de lados iguales; la forma libre conserva el ancho y alto que elijas. **Contener** muestra la imagen completa y **Cubrir** puede recortar sus bordes.

Cada enlace puede dirigir a inicio, catálogo, destacados, contacto, términos, redes o una sección personalizada específica. Elegí el destino y cambiá el texto visible. Los controles permiten mover el enlace, ocultarlo y quitarlo. Quitar un enlace conserva la sección. Si la sección está desactivada o no existe, el acceso correspondiente no aparece en la tienda. Los enlaces a destacados, contacto y redes también se omiten cuando falta su contenido visible. En móvil los enlaces se reúnen en un menú dentro de la cabecera.

## Textos, alineación y dirección

La pestaña **Textos** reúne los textos propios de tienda y catálogo, contacto y WhatsApp, producto, carrito, checkout, términos y seguimiento. Incluye títulos secundarios, descripciones, etiquetas, placeholders, botones, mensajes vacíos y textos de ayuda. El buscador permite encontrar un texto por su nombre; cada grupo conserva sus controles separados.

Los títulos principales de portada, catálogo, destacados, producto relacionado, carrito y términos también se editan en las pestañas de esas secciones. El contenido comercial, los datos del producto y las instrucciones de cobro se administran desde sus formularios correspondientes. Los mensajes de error, estados de pedidos y avisos del sistema mantienen su significado y no forman parte de la personalización editorial.

Un campo de texto vacío permanece vacío y no se reemplaza al guardar. Donde haya variables como `{count}`, `{storeName}`, `{current}`, `{pages}` o `{amount}`, conservá su escritura para que se reemplacen con los datos de la tienda. El contenido es texto, no HTML ni JavaScript.

**Alineación** decide dónde se ubica el texto: izquierda, centro o derecha. **Dirección de lectura** indica izquierda a derecha, derecha a izquierda, automática según el contenido o heredada de la tienda. Son opciones independientes: podés centrar un texto que se lee de izquierda a derecha. Hay controles por anuncio, portada, destacados, catálogo, tarjeta, contacto y pie; producto, carrito, checkout y términos tienen sus propios controles. Las secciones y sus complementos pueden heredar la dirección o elegir otra.

## Tienda: portada, destacados y catálogo

### Portada

| Variante | Uso |
| --- | --- |
| Dividida | Presentar texto y una imagen en columnas. |
| Imagen de fondo | Integrar título, descripción y botón sobre una imagen; ajustar superposición y color de texto. |
| Sólo imagen | Mostrar la imagen sin texto ni botón superpuesto. |
| Centrada | Dar protagonismo al mensaje con alineación central. |
| Carrusel | Mostrar una secuencia de hasta ocho imágenes con textos y botones opcionales. |

Configurá altura para escritorio y celular, alineación, imagen, textos y visibilidad del botón. En el carrusel se pueden agregar, ordenar y quitar diapositivas. Los textos vacíos de una diapositiva usan los valores generales de portada. Los botones dirigen a catálogo, contacto o términos dentro de la tienda.

Los controles que dependen de una variante se habilitan al seleccionarla. Las opciones de reproducción afectan únicamente al carrusel. La reproducción se pausa cuando el usuario interactúa con sus controles, la pestaña se oculta o el navegador solicita reducir movimiento.

### Destacados

Marcá los productos desde el chip de destacado de la tabla de Productos o desde su formulario. Se usan hasta 12 productos activos y no archivados. La selección es independiente de los filtros y la paginación del catálogo.

Elegí grilla o carrusel horizontal. En carrusel se puede activar el avance automático, ajustar intervalo y velocidad, repetir al llegar al final y pausar al pasar el cursor. El cliente también tiene controles manuales. El foco de teclado y la preferencia de movimiento reducido siempre detienen la reproducción automática.

El carrusel reserva espacio alrededor de las tarjetas para sus sombras y efectos, incluida la primera tarjeta. Los controles se muestran separados del contenido; no hay un marco ajustado que recorte visualmente las cards.

### Catálogo y tarjetas

El catálogo puede usar grilla, una vista compacta o una composición editorial. Configurá columnas, proporción de fotos, buscador, categorías, visibilidad y título. Las categorías y subcategorías se administran desde su sección del panel.

Las categorías admiten varios niveles, por ejemplo **Indumentaria → Remeras → Manga corta → Estampadas**. En el formulario de una categoría se elige cualquier padre válido. No se puede colocar una categoría dentro de sí misma ni de sus descendientes. Al seleccionar una categoría en la tienda, el catálogo incluye los productos de toda su rama. Una categoría desactivada oculta su rama de la navegación pública; no elimina sus productos.

En **Tienda → Catálogo**, elegí la presentación de categorías:

| Presentación | Comportamiento |
| --- | --- |
| Categorías por niveles | Botones para recorrer los niveles y volver a los anteriores. |
| Submenús en el navbar | Categorías principales en la cabecera y submenús con sus descendientes. |
| Panel desplegable | Botón que abre los filtros en un costado. |
| Selector compacto | Lista desplegable con las rutas completas de categorías. |
| Panel lateral | Árbol al costado del catálogo en escritorio; panel desplegable en pantallas pequeñas. |

La categoría seleccionada se refleja en la URL y se puede limpiar para volver al catálogo completo. Los submenús se pueden abrir mediante clic o teclado, además de la interacción disponible con el puntero.

Las tarjetas ofrecen cuatro estilos: mínimo, con borde, elevado y con información superpuesta. Podés mostrar precio anterior, descripción, stock y botón de compra. La ficha sigue disponible al tocar la foto o el nombre aunque ocultes el botón.

El cambio de foto al pasar el cursor usa únicamente la primera y segunda imagen, cuando el producto tiene ambas. Un producto con una imagen conserva esa foto. En pantalla táctil la foto principal permanece estable; las otras se ven en su ficha. Los efectos de elevar o acercar son independientes del cambio de foto y respetan la preferencia de movimiento reducido.

## Espaciado y ancho

Cada zona expone un espaciado horizontal y vertical, medido en píxeles. Los valores admitidos van de 0 a 160. El ancho completo elimina el límite del contenedor de esa sección; el espaciado horizontal controla cuánto se separa su contenido del borde.

Para una portada o carrusel **de borde a borde**, activá ancho completo y poné el espaciado horizontal en **0**. Para eliminar el espacio superior e inferior, poné también el vertical en **0**. Los demás bloques pueden conservar un ancho contenido. En celular se limitan los espaciados excesivos y el valor cero se mantiene.

Estos controles están disponibles en portada, destacados, catálogo y las páginas de producto, carrito y checkout. El pie y la página de términos tienen sus propios espaciados.

## Secciones y complementos

La pestaña **Secciones** permite agregar contenido antes o después del catálogo. Los siete puntos de partida son texto, imagen con texto, banner, beneficios, preguntas frecuentes, galería y redes sociales. Podés conservar el contenido inicial como guía y reemplazarlo por la información de la tienda.

Cada sección tiene controles para:

- Activar, desactivar, duplicar, mover y quitar.
- Elegir su ubicación y variante visual.
- Editar título, subtítulo, texto, foto y botón.
- Elegir fondo, alineación, columnas, ancho y espaciados.
- Agregar complementos internos de texto, imagen, botón, beneficio o pregunta.

Los complementos tienen su propia visibilidad y orden. Un beneficio puede mostrar un icono; una pregunta se abre para mostrar su respuesta; los botones usan destinos internos. El límite es de 12 secciones con hasta 12 complementos cada una. Hay un nivel de anidamiento de complementos; no es un editor de HTML libre ni admite scripts.

Una sección desactivada permanece guardada y se puede volver a activar. Eliminarla quita también sus complementos del borrador; el guardado aplica ese cambio.

### Redes sociales

Elegí **Agregar sección → Redes sociales** y agregá las redes que quieras mostrar. Hay opciones para Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Pinterest, Threads, Twitch, WhatsApp y un sitio web. Cada enlace tiene red, dirección completa, texto opcional y control de visibilidad. Si el texto queda vacío, se usa el nombre de la red. Podés ordenar los enlaces y cargar hasta 12 por sección.

La sección ofrece **iconos**, **iconos con nombre** o **tarjetas**. Configurá título, descripción, tamaño de iconos, apertura en otra pestaña, alineación, dirección, fondo y espaciados, igual que las demás secciones. Dentro de una sección visible, una red sin dirección debe quedar desactivada antes de guardar. Una sección de redes desactivada puede conservarse como borrador incompleto. Los enlaces aceptan HTTP o HTTPS, sin código ejecutable ni credenciales dentro de la URL.

Para acceder a esta sección desde la cabecera, agregá un enlace con destino Redes sociales. Si hay varias secciones de redes, ese destino lleva a la primera habilitada que tenga enlaces visibles y válidos; para elegir otra, usá Una sección personalizada y seleccioná la sección concreta. Agregar enlaces no inicia sesión en las redes ni requiere sus APIs.

## Producto, carrito y checkout

La ficha de producto ofrece composiciones clásica, con foco en el producto y amplia. También conserva galería, stock, categoría, compartir y productos relacionados/recomendados configurables.

El carrito puede distribuir productos y resumen en columnas o apilarlos. El resumen puede tener tarjeta o presentación mínima. Conserva notas, imágenes, mensaje de confianza, recomendaciones y textos de botones.

El checkout puede usar pasos o formulario único y presentar las secciones en tarjetas o con un estilo mínimo. El vendedor decide la visibilidad del resumen, teléfono, notas y mensaje de confianza. El teléfono es obligatorio si se configura así o si hay productos físicos. Las entregas de tipo envío o personalizada requieren dirección, localidad y código postal, incluso si se eligen para un carrito digital. Los medios de pago se filtran según la forma de entrega elegida.

Una confirmación incompleta muestra una notificación roja y errores junto a los campos. La lista de errores permite ir directamente a cada dato. No hace falta buscar el error entre los pasos anteriores.

## Términos y condiciones

En **Términos**, escribí título, introducción y condiciones de la tienda; elegí la fecha opcional y el ancho de lectura. El contenido se divide en párrafos respetando saltos de línea, sin interpretar código HTML.

Habilitar la página exige título y contenido. Después se muestra en `/t/tu-tienda/terminos`, se enlaza desde la tienda y su aceptación es requerida al comprar. En el checkout podés cambiar las palabras del enlace de aceptación. Si no habilitás la página propia y ya tenías una URL externa, ese enlace sigue funcionando y también requiere aceptación.

En la tienda pública los términos se pueden abrir en otra pestaña sin perder los datos de compra. Dentro de la vista previa se abren en el mismo marco y el editor muestra sus controles. Los términos deshabilitados son un borrador privado y no se publican como condiciones vigentes.

## Ideas de configuración

**Colección de remeras:** portada con foto de fondo, ancho completo y espaciado cero; catálogo de tres columnas; tarjetas con borde; segunda imagen al pasar el cursor; destacados en carrusel manual; sección de beneficios al final.

**Feria de creadores:** portada dividida; catálogo editorial; sección de imagen con texto antes del catálogo para contar la historia; preguntas frecuentes después; WhatsApp de contacto visible.

**Catálogo digital:** portada centrada; diseño mínimo; tarjetas de proporción horizontal; carrito apilado; checkout único con resumen visible y entrega por correo.

Estos ejemplos usan las opciones del editor; no reemplazan productos ni modifican la configuración de una tienda existente automáticamente.

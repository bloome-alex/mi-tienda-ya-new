# mi-tienda-ya-2 · Cambios de la versión 1.2.0

Esta entrega amplía el diseñador y mejora la auditoría y la compra. Incluye código fuente, frontend compilado, pruebas y documentación. Usa Vue y CSS propio, sin un framework visual adicional.

## Diseño de cada tienda

- Paletas independientes para modo claro y oscuro. El vendedor decide el modo inicial —claro, oscuro o según dispositivo— y si el cliente puede cambiarlo. La elección del cliente se guarda por tienda; el tema del panel se conserva por separado.
- Fondo de pantalla con una imagen compartida o imágenes distintas para escritorio y celular. Se validan formato, peso y dimensiones en el navegador y en el servidor. El fondo tiene ajuste, posición y superposición configurables.
- Cinco variantes de portada: dividida, imagen de fondo con contenido superpuesto, sólo imagen, contenido centrado y carrusel. Texto y botón pueden ocultarse. El carrusel admite hasta ocho diapositivas y reproducción opcional.
- Espaciado horizontal y vertical por sección. Las portadas, destacados, catálogo, producto, carrito y checkout pueden usar todo el ancho. El valor cero permite llegar al borde de la página.
- Catálogo en grilla, compacto o editorial; tarjetas mínimas, con borde, elevadas o superpuestas. Botón de compra opcional. Efecto al pasar el cursor configurable; el cambio entre la primera y segunda imagen se puede activar independientemente.
- Destacados en grilla o carrusel horizontal. Reproducción automática, intervalo, velocidad, repetición y pausa al pasar el cursor configurables. Incluye controles manuales y pausa por foco, pestaña oculta y preferencia de movimiento reducido.
- Variantes de ficha de producto y carrito, y presentación del checkout en tarjetas o mínima, con elección entre pasos o formulario único.
- Secciones adicionales predefinidas: texto, imagen con texto, banner, beneficios, preguntas frecuentes y galería. Cada sección permite agregar complementos de texto, imagen, botón, beneficio o pregunta. Se pueden ordenar, duplicar, activar y quitar. Hay un nivel de complementos dentro de cada sección.
- Se conserva el marco de vista previa acotado a la pantalla y el desplazamiento separado de controles y tienda. Navegar a producto, carrito, checkout o términos dentro de la vista previa selecciona sus controles.

Los límites son 12 secciones adicionales, 12 complementos por sección y 8 diapositivas de portada. Estos límites también se validan en la API.

## Fondos: archivos que admite el editor

| Uso | Medida exacta |
| --- | --- |
| Escritorio | 1920 × 1080 píxeles |
| Celular | 1080 × 1920 píxeles |
| Una imagen para ambos | 1920 × 1920 píxeles |

Formatos JPEG, PNG o WebP, hasta 5 MiB por archivo. En el modo por dispositivo deben estar cargadas ambas imágenes antes de activar el fondo. Las fotos de productos, logo y portada mantienen su carga habitual; estas medidas exactas corresponden al fondo de pantalla.

Al usar ajuste **Cubrir**, la imagen se recorta según la proporción de la pantalla. Conviene ubicar el contenido importante en el centro y evitar texto incrustado en los bordes. **Contener** muestra la imagen completa y puede dejar áreas con el color de fondo. Una sola foto no mantiene simultáneamente todos sus bordes visibles en una pantalla horizontal y otra vertical cuando se usa Cubrir.

## Cambios sin guardar

Salir del diseñador hacia otra sección o cambiar de tienda muestra tres opciones cuando hay cambios: **Guardar**, **Descartar** y **Seguir editando**. El guardado incluye el diseño y los cambios pendientes del nombre, dirección y descripción de la tienda. Si el guardado falla, la navegación se detiene y los cambios permanecen disponibles para corregir o reintentar.

Al cerrar o recargar la pestaña se solicita el aviso nativo de cambios pendientes. El texto y los botones de ese aviso los controla el navegador; no permite insertar allí un botón personalizado para guardar. No equivale a un guardado automático y algunos cierres forzados, especialmente desde el administrador de aplicaciones de un celular, no disparan el evento. Para guardar antes de cerrar, cancelar el cierre y usar **Guardar cambios**.

Referencia técnica: [MDN — beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

## Términos por tienda y validación de compra

La sección **Términos** del diseñador permite escribir título, introducción y contenido, mostrar una fecha y ajustar el ancho de lectura y espaciados. La página está en `/t/identificador/terminos`. El texto se renderiza de forma segura; no ejecuta HTML ni JavaScript ingresado en el formulario.

Al habilitar la página, el checkout usa esos términos y exige aceptación. El campo anterior de URL externa permanece compatible para tiendas que todavía lo usan. El vendedor debe escribir sus propias condiciones antes de habilitarlas: no se publica automáticamente un contrato genérico.

Confirmar el pedido con datos incompletos produce una notificación roja y una lista de correcciones. Se resalta cada campo y se enfoca el primero; en la compra por pasos se vuelve al paso que contiene el error. Se controlan nombre, correo, teléfono cuando corresponde, entrega, dirección completa para envíos, medio de pago compatible y aceptación de términos. La API vuelve a validar las reglas y registra la aceptación y la versión del contenido aplicable en el pedido. Los pedidos manuales del vendedor no registran una aceptación ficticia del comprador.

La vista previa permite probar las validaciones sin generar pedidos ni pagos.

## Auditoría

Las acciones se presentan en español y cada evento tiene una página de detalle. La tabla permite localizar actividades por sus filtros; el detalle identifica quién actuó, qué tienda y registro se afectaron, cuándo ocurrió y los cambios registrados. Las modificaciones incluyen valores anteriores y posteriores cuando se dispone de esa información. Los eventos de stock y pedidos incorporan el contexto de cantidades y estados.

Los registros de versiones anteriores se conservan. Si un evento histórico no guardó valores anteriores o contexto, la interfaz lo indica; no reconstruye hechos que no fueron registrados. La redacción de credenciales se aplica al registrar y al presentar los detalles.

## Botón de WhatsApp

Se renovó el botón flotante con icono reconocible, etiqueta de consulta, estados de foco y una presentación compacta en celular. La vista previa del contacto usa el mismo componente que la tienda. El número y mensaje inicial continúan configurándose en **Contacto**.

## Actualizar una instalación existente

1. Hacer una copia de la base MongoDB, el archivo `.env` y las carpetas persistentes de archivos y sesión de WhatsApp.
2. Detener el proceso de la aplicación.
3. Reemplazar el código por el contenido de `mi-tienda-ya-2` de este ZIP. Conservar `.env`, `api/data` y cualquier directorio externo indicado en `UPLOAD_DIR` o `WHATSAPP_DATA_PATH`.
4. Mantener `SESSION_SECRET` y `ENCRYPTION_KEY`; no generar valores nuevos para una instalación que ya tiene datos cifrados.
5. Ejecutar `npm ci`. El ZIP incluye `client/dist`; para recompilar después de modificar fuentes, ejecutar `npm run build`.
6. Iniciar con `npm start` o reiniciar el proceso PM2 existente.
7. Entrar al diseñador de una tienda, revisar las nuevas opciones y guardar cuando se desee aplicar una nueva configuración.

Los campos nuevos se completan con valores iniciales sin borrar la configuración anterior. La página de términos y el fondo están deshabilitados inicialmente. No es necesario volver a cargar la demostración ni reiniciar los períodos de prueba. El comando `seed:demo` conserva los ejemplos existentes; las mejoras visuales de la demo sólo se crean al preparar una demo nueva.

El resultado de las verificaciones de esta entrega está en [PRUEBAS.md](PRUEBAS.md). El manual de uso del editor está en [DISENO.md](DISENO.md).

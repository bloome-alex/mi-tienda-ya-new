# Verificación de mi-tienda-ya-2 · v1.3.0

## Resultado de esta entrega

Las suites completas aprobaron **134 pruebas: 72 de API y 62 del cliente**, con **0 fallos, 0 omitidas y 0 canceladas**. Se ejecutaron por workspace: `npm run test --workspace api` y `npm run test --workspace client`. El comando raíz `npm test` ejecuta esas mismas dos suites en secuencia.

La API se probó con MongoDB temporal standalone. Los servicios externos utilizaron respuestas controladas; no se operó con cuentas reales de correo, pagos o WhatsApp.

| Comprobación | Resultado |
| --- | --- |
| `npm run check` | Sintaxis válida en 24 archivos JavaScript de API y scripts. |
| `npm run build` | Cliente de producción compilado; 156 módulos transformados. |
| Arranque de Express y MongoDB temporal | `/api/health` respondió 200 y base conectada. |
| Frontend compilado | HTML y bundle JavaScript respondieron 200. |
| Rutas profundas | Diseño, detalle de auditoría, términos y seguimiento devolvieron la SPA. |
| Configuración pública | Respuesta 200 después del bootstrap. |
| Manifiesto PWA | Respuesta 200; `display: standalone`. |
| Service worker | Respuesta 200; caché `mty2-shell-v1.3.0` y cabecera HTTP `no-cache`. |
| Ruta API inexistente | 404 JSON, sin devolver el HTML del cliente. |
| Auditoría sin sesión | 401. |

La comprobación de arranque completó 12 verificaciones. Utilizó variables, archivos y base de datos temporales, y cerró los procesos al terminar. No modificó el `.env` ni los datos de una instalación existente. El último ajuste del espaciado del navbar móvil se incorporó en una compilación final adicional.

## Pruebas de API

| Archivo | Casos | Cobertura principal |
| --- | ---: | --- |
| `api/test/core.test.js` | 11 | Administrador único, bcrypt, cambio inicial, CSRF, enlace de acceso de un uso, prueba inicial, aislamiento, cifrado, configuración y planes. |
| `api/test/commerce.test.js` | 18 | Reservas, compensaciones, concurrencia, variantes, precios autoritativos, idempotencia, estados finales, entrega digital, pagos y comprobantes privados. |
| `api/test/quota.test.js` | 5 | Altas/activaciones concurrentes, índices únicos, reutilización de cupos y reducción de publicaciones sin perder contenido. |
| `api/test/catalog.test.js` | 14 | Categorías multinivel, movimiento de ramas, ciclos, permisos, concurrencia, recuperación, filtros transitivos y destacados independientes. |
| `api/test/version12.test.js` | 18 | Contrato de diseño ampliado, fondos flexibles, auditoría, términos propios y validaciones de compra. |
| `api/test/design13.test.js` | 6 | Compatibilidad, cabecera, títulos vacíos, textos, redes, enlaces, alineación y auditoría del nuevo contrato. |
| **Total API** | **72** | Todas aprobadas. |

### Jerarquía de categorías

Se comprueba el ABM de categorías con varias generaciones, filtros que incluyen todos los descendientes y visibilidad pública transitiva. Las pruebas cubren traslados de ramas conservando hijos y productos, autorreferencias, ciclos, padres de otra tienda y categorías archivadas.

Las mutaciones simultáneas de una tienda se serializan mediante un token persistido sin vencimiento automático. Se verifican conflictos entre instancias del servicio, recuperación de operaciones interrumpidas y rechazo de árboles inválidos. La recuperación ocurre antes de atender tráfico en el despliegue soportado de un proceso; no equivale a una transacción conjunta entre todos los documentos de negocio.

### Fondos flexibles

Las pruebas generan imágenes reales y verifican:

- Imágenes estáticas JPEG, PNG y WebP; límite de 5 MiB y de 25 millones de píxeles.
- Resoluciones pequeñas y grandes, proporciones libres, 1 × 1, 600 × 600, 5000 × 5000 y un panorama de 20.000 × 300.
- Dimensiones después de aplicar orientación EXIF.
- Conservación de dimensiones en los fondos; salida PNG para ejes que exceden la capacidad de WebP.
- Rechazo de archivos de otra tienda, propósito distinto, contenido modificado y hash inválido.
- Verificación contra los metadatos propios del archivo al guardar, sin exigir las resoluciones recomendadas.
- Dos cargas identificadas en modo por dispositivo y compatibilidad de las cargas genéricas existentes.

### Cabecera, textos, redes y auditoría

El contrato rechaza tipos incorrectos, rangos fuera de límites, identificadores duplicados y destinos inválidos. Se verifican hasta 12 enlaces de navbar, 12 secciones, 12 complementos o redes por sección y 8 diapositivas de portada.

Los diseños anteriores se normalizan sin mutar los datos de entrada. Los títulos y textos explícitamente vacíos siguen vacíos; los arrays se clonan por tienda. Cada campo del registro de textos tiene una etiqueta, tipo y longitud máxima verificados. El texto se conserva como contenido literal y se representa mediante bindings de Vue; no se habilita HTML ni JavaScript libre.

Los enlaces de redes requieren HTTP/HTTPS, sin credenciales en la URL. Una red visible sin dirección dentro de una sección publicada impide guardar; los borradores desactivados pueden conservarse incompletos. Se verifican también dirección y alineación independientes.

La auditoría mantiene redacción de secretos y datos reales anteriores/posteriores. Los nuevos enlaces del navbar y redes se comparan por identificadores estables, distinguiendo modificación, orden, alta y baja. Los nombres de campos y valores del contrato tienen presentación española. Los eventos históricos no inventan información que no se registró.

### Términos y checkout

La aceptación debe ser el booleano `true` cuando corresponde y se valida antes de reservar stock. El snapshot del pedido usa los términos vigentes del servidor; un reintento idempotente conserva la aceptación original. Los borradores de términos desactivados no se publican.

Se verifican teléfono según configuración/tipo de producto, dirección completa cuando la entrega la exige, disponibilidad del medio de pago y aislamiento de pedidos. Los pedidos manuales no atribuyen al comprador una aceptación que no realizó.

## Pruebas del cliente

Todos los archivos siguientes están dentro de `client/test`.

| Archivo | Casos | Cobertura principal |
| --- | ---: | --- |
| `cart.test.js` | 4 | Stock, variantes, actualización e idempotencia. |
| `categories.test.js` | 4 | Árbol multinivel, recorridos iterativos, rutas, padres válidos y ramas profundas. |
| `checkoutValidation.test.js` | 6 | Datos requeridos, dirección, medios, pasos y términos. |
| `copy13.test.js` | 4 | Vacíos, reservas, actualización reactiva y variables como texto. |
| `design.test.js` | 4 | Clonado, compatibilidad, paletas, permiso de tema y espaciado. |
| `designerState.test.js` | 12 | Guardado, errores parciales, ediciones concurrentes, cargas, descarte, guardas y pestañas nuevas. |
| `editor.test.js` | 6 | Confirmaciones, formatos/peso de imagen y dimensiones libres. |
| `previewProtocol.test.js` | 4 | Origen, ventana y tienda; rutas editables y rechazo de destinos ajenos. |
| `storeNavigation.test.js` | 4 | Títulos vacíos, visibilidad transitiva, destinos del navbar y URLs de redes. |
| `storePlayback.test.js` | 2 | Pausas, intervalos, movimiento reducido y limpieza de recursos. |
| `storeTheme.test.js` | 5 | Preferencias por tienda/preview, permiso del vendedor y dispositivo. |
| `theme.test.js` | 4 | Tema del panel, persistencia y diseños anteriores. |
| `workspace.test.js` | 3 | Guarda de salida, espera del guardado, cancelación y contexto válido. |
| **Total cliente** | **62** | Todas aprobadas. |

Las pruebas de estado ejecutan el setup real de `DesignView.vue` con API en memoria. Comprueban que un fallo parcial conserve lo pendiente, que las ediciones nuevas no se pierdan durante una solicitud y que guardar/descarte gestionen correctamente cargas y respuestas tardías. Cabecera y Textos no pierden su selección por una confirmación repetida del iframe; una navegación real del cliente sigue sincronizando la página editada.

El registro y la eliminación del listener `beforeunload` están cubiertos por pruebas de componente. El aviso de cierre depende del navegador; no se verificó cerrar físicamente una pestaña durante esta revisión. Los cierres forzados de aplicaciones móviles pueden omitir ese evento.

## Revisión visual e interactiva

Se utilizó un navegador de escritorio con los componentes Vue reales y datos ficticios en memoria. Las vistas privadas se revisaron sin credenciales ni API real. El proyecto temporal de revisión y sus fixtures no forman parte del ZIP. La persistencia y los permisos se verificaron por separado en la suite de API.

| Flujo | Resultado observado |
| --- | --- |
| Home en escritorio | Navbar único, sin lateral; contenido desde el borde izquierdo y sin desbordamiento horizontal. |
| Anclas del home | El acceso a planes deja el inicio de la sección debajo del navbar fijo. |
| Home móvil | Contenido de 375 px dentro de un marco de 390 px; los cuatro enlaces superiores caben y no hay sidebar. |
| Título de la tienda vacío | Al dejar de usar el nombre general y conservar el texto propio vacío, desaparece el texto y permanece el logo. |
| Logo | Configuración rectangular de 220 × 70 px con radio de 12 px y ajuste `contain`, aplicada en la preview. |
| Altura del navbar | Fila principal de 132 px; la fila de categorías se suma a su altura medida. |
| Textos del catálogo | Una descripción propia se reflejó en la tienda inmediatamente. |
| Alineación y dirección | Texto centrado y dirección RTL aplicados de forma independiente al catálogo. |
| Submenús multinivel | Indumentaria → Remeras → Manga corta → Estampadas, con selección del cuarto nivel y filtro al producto correspondiente. |
| Otras variantes de categorías | Panel desplegable con la rama elegida expandida, selector con rutas completas y panel lateral en escritorio. La vista inicial por chips también se presentó correctamente. |
| Nueva sección de redes | Creación, título propio, Instagram y TikTok con tarjetas y apertura en otra pestaña. Se inspeccionaron destinos y `rel`; no se abrieron conversaciones ni perfiles externos. |
| Orden y visibilidad de redes | Mover TikTok al primer lugar cambió el orden; desactivarlo retiró su tarjeta y conservó Instagram. |
| Red incompleta | Guardar una red visible sin URL produjo error en español y notificación; el borrador se conservó. |
| Navegación a redes | El enlace personalizado “Seguinos” apareció en el navbar y llevó a la sección elegida. |
| Carrusel de destacados | Tarjetas elevadas con 20 px de espacio lateral, 24 px superior y 32 px inferior; viewport sin borde. Las flechas cambiaron la posición de 1–3 a 2–4. |
| Cambios sin guardar | La salida al listado abrió la decisión Guardar/Descartar/Seguir editando; continuar mantuvo el borrador. Guardar mostró confirmación. |
| Navegación de la preview | Entrar al carrito y continuar al checkout seleccionó sus respectivas pestañas del diseñador. |
| Tienda y checkout móvil | Vista de 375 px sin desbordamiento horizontal; menú móvil con los enlaces configurados. |
| Diseñador completo móvil | Documento de 390 × 844 px sin scroll global adicional; selector de tienda visible y desplazamientos internos de controles/preview. |

La revisión no pretende cubrir todas las combinaciones posibles de variantes, contenidos y dispositivos. Los textos del registro también se cotejaron por lectura de código: las 122 claves tienen un destino público, incluyendo etiquetas accesibles y ayudas de botones con iconos.

## Reproducir la verificación

Desde la raíz del proyecto:

```bash
npm ci
npm test
npm run check
npm run build
```

`mongodb-memory-server` necesita permiso para abrir puertos locales y puede descargar su binario de MongoDB la primera vez. Las pruebas crean sus propias bases temporales. Para reutilizar una caché en una terminal POSIX:

```bash
MONGOMS_DOWNLOAD_DIR=/tmp/mi-tienda-ya-mongodb npm test
```

## Alcance de las integraciones

No se realizaron cobros reales, correos mediante SMTP del usuario, emparejamientos de WhatsApp ni cambios en una instalación publicada. Deben configurarse y comprobarse con las credenciales y el dominio de cada instalación.

Los tamaños móviles se simularon en un navegador de escritorio. No se verificó la instalación física de la PWA en un teléfono sobre HTTPS. El catálogo actualizado, los pedidos, pagos y administración requieren conexión.

Se incluyen Docker/Compose como opciones de despliegue; no se construyó ni inició una imagen Docker durante esta entrega. La [guía de actualización](CAMBIOS-1.3.0.md), la [arquitectura](ARQUITECTURA.md) y las [integraciones](INTEGRACIONES.md) describen persistencia, proceso único y límites operativos.

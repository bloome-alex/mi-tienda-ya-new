# Referencia de API

La API de Mi Tienda Ya 2 se sirve bajo `/api`. Usa JSON salvo los archivos multipart y las descargas de comprobantes. Los identificadores MongoDB se devuelven como `_id`; las fechas se serializan en ISO 8601. La moneda de esta versión es ARS y los importes se expresan en pesos, con dos decimales como máximo.

Esta referencia describe **v1.6.0**: categorías multinivel, fondos con resoluciones flexibles, cabecera configurable, textos y dirección de lectura por tienda y secciones de redes sociales. Conserva los términos con aceptación registrada, auditoría con detalle y destacados independientes de la paginación.

## Respuestas, sesión y errores

Una operación correcta devuelve:

```json
{ "data": { "_id": "..." } }
```

Las colecciones privadas paginadas devuelven:

```json
{
  "data": [],
  "meta": { "total": 120, "page": 1, "limit": 15 }
}
```

Los listados aceptan `page`, `limit` —máximo 500— y `search` cuando el recurso lo permite. La búsqueda escapa caracteres de expresiones regulares. Usuarios busca nombre/correo, tiendas nombre/slug, productos nombre/descripción/SKU, categorías nombre/descripción, planes nombre y auditoría los campos históricos y filtros descritos en su sección. Los pedidos buscan número, nombre o correo del cliente y admiten `status`.

Un error devuelve:

```json
{
  "error": {
    "message": "Revisá los campos del formulario.",
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "email", "message": "..." }]
  }
}
```

Los códigos HTTP principales son 401 sin sesión, 403 sin permiso o CSRF inválido, 404 recurso no disponible o de otra tienda, 409 conflicto de estado/concurrencia, 413 archivo demasiado grande, 422 validación, 429 límite de solicitudes y 503 servicio aún no configurado. Una validación de comercio también puede usar 400. Los mensajes del proveedor no se devuelven en bruto cuando podrían incluir datos sensibles.

Las rutas autenticadas utilizan `mt_session`, una cookie HttpOnly. El cliente debe enviar `credentials: 'include'` y agregar `X-CSRF-Token` a POST, PUT y DELETE privados. El token CSRF se obtiene de las respuestas de ingreso o de `GET /auth/me`. No es un token de autenticación independiente y no reemplaza la cookie.

## Salud, configuración pública y autenticación

| Método | Ruta | Acceso | Cuerpo o resultado |
| --- | --- | --- | --- |
| GET | `/health` | Público | `{status,database}`; HTTP 503 cuando MongoDB no está conectado. |
| GET | `/public/config` | Público | `{trialDays,contact,home,plans}`. Sólo planes activos; sin configuración privada. |
| GET | `/auth/me` | Público | `{user,csrfToken}`; ambos nulos cuando no hay sesión válida. |
| POST | `/auth/root/login` | Público limitado | `{username,password}` → `{user,csrfToken}`. |
| POST | `/auth/root/password` | Admin con sesión y CSRF | `{currentPassword,newPassword}`; cambia la contraseña e invalida sesiones anteriores. |
| POST | `/auth/magic/request` | Público limitado | `{email,name?}`; envía enlace por correo, responde un mensaje genérico. |
| POST | `/auth/magic/consume` | Público limitado | `{token}` → `{user,csrfToken}`. Token hexadecimal de 64 caracteres, un solo uso. |
| POST | `/auth/logout` | Sesión y CSRF | Cierra la sesión actual y elimina su cookie. |

La sesión inicial del administrador sólo permite consultar `/auth/me`, cambiar contraseña o cerrar sesión. El resto responde `PASSWORD_CHANGE_REQUIRED` hasta completar el cambio.

Solicitar un enlace para un usuario inactivo o una cuenta no vendedora no habilita el acceso. La API no devuelve si ese correo corresponde a una cuenta existente. Cuando no hay SMTP configurado o el transporte falla, se devuelve un error y no se afirma que el mensaje fue enviado.

## Administración

Todas las rutas de esta sección requieren rol `admin` y las mutaciones requieren CSRF.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/admin/dashboard` | Totales de vendedores activos, tiendas, productos, pedidos pagados, facturación, unidades vendidas, últimos pedidos, actividad y serie de ventas. |
| GET / POST | `/admin/users` | Listar o crear vendedores. |
| GET / PUT / DELETE | `/admin/users/:id` | Consultar, editar o desactivar un vendedor. El admin único no forma parte de este ABM. |
| PUT | `/admin/users/:id/plan` | Asignar, renovar o quitar un plan. |
| GET / POST | `/admin/plans` | Listar o crear planes. |
| GET / PUT / DELETE | `/admin/plans/:id` | Consultar, editar o desactivar un plan. |
| GET / POST | `/admin/stores` | Listar todas las tiendas o crear y asignar una. |
| GET / PUT / DELETE | `/admin/stores/:id` | Consultar, editar/asignar o archivar una tienda. |
| GET / PUT | `/admin/settings` | Consultar o modificar configuración global. |
| GET | `/admin/audit` | Listado paginado con filtros por acción, recurso, actor, tienda, fechas y búsqueda. |
| GET | `/admin/audit/:id` | Detalle histórico, cambios antes/después y otros datos registrados. |
| GET | `/admin/whatsapp/status` | `{status,qr,error,clientId}`. |
| POST | `/admin/whatsapp/connect` | Iniciar el cliente; el frontend consulta luego el estado. |
| POST | `/admin/whatsapp/disconnect` | Cerrar y desvincular el cliente actual. |

### Usuarios y planes

Crear vendedor:

```json
{ "name": "Nombre del vendedor", "email": "vendedor@ejemplo.com", "active": true }
```

El rol se fija en `vendedor`. El frontend no puede elegir `admin` ni cargar contraseñas de vendedores. La prueba de una cuenta precreada empieza con su primer acceso verificado.

Asignar o renovar plan:

```json
{ "planId": "IDENTIFICADOR_DEL_PLAN", "days": 30 }
```

Si se omite `days`, se usa `durationDays` del plan. La renovación suma desde el mayor entre el momento actual y el vencimiento guardado. También se admite `expiresAt` como fecha ISO explícita. `{ "planId": null }` quita la asignación.

Datos del plan:

```json
{
  "name": "Mi plan",
  "icon": "store",
  "previousPrice": 0,
  "price": 0,
  "durationDays": 30,
  "features": ["Catálogo online", "Pedidos y stock"],
  "maxStores": 1,
  "maxProducts": 100,
  "active": true,
  "featured": false,
  "sortOrder": 0
}
```

Los valores son ejemplos de estructura, no precios comerciales sugeridos. `maxProducts: 0` significa ilimitado. `maxStores` debe ser al menos 1. Desactivar un plan no modifica automáticamente asignaciones vigentes. Reducir `maxStores` conserva todas las tiendas y desactiva las publicaciones excedentes; se priorizan `createdAt` y `_id` ascendentes. Reducir `maxProducts` conserva productos existentes e impide nuevas altas cuando no hay capacidad.

### Configuración global

`PUT /admin/settings` acepta cambios parciales:

```json
{
  "trialDays": 15,
  "magicLinkMinutes": 15,
  "contact": { "email": "soporte@ejemplo.com", "phone": "", "whatsapp": "" },
  "home": {
    "eyebrow": "TU NEGOCIO ONLINE",
    "title": "Una tienda para tu emprendimiento",
    "subtitle": "Texto de presentación",
    "ctaText": "Crear mi tienda",
    "heroImage": "",
    "benefits": [{ "icon": "store", "title": "Beneficio", "description": "Descripción" }],
    "testimonials": [{ "name": "Nombre real", "business": "Negocio", "quote": "Experiencia autorizada" }],
    "faq": [{ "question": "Pregunta", "answer": "Respuesta" }]
  }
}
```

`trialDays` admite 0–365 y `magicLinkMinutes` admite 1–1440. Los arrays recibidos reemplazan sus arrays completos. Las propiedades simples no enviadas se conservan. La aplicación se inicia sin testimonios y sin planes comerciales cargados.

### Auditoría y detalle de eventos

`GET /admin/audit` devuelve un listado paginado, ordenado por `createdAt` y `_id` descendentes. Todos los filtros se pueden combinar:

| Parámetro | Regla y alcance |
| --- | --- |
| `page`, `limit` | Página desde 1; límite entre 1 y 500, inicialmente 50. |
| `action` | Código exacto de la acción, por ejemplo `store.design.updated` o `product.updated`; hasta 100 caracteres. |
| `entity` | `user`, `store`, `plan`, `category`, `product`, `order`, `settings` o `integration`. |
| `actorId` | Identificador MongoDB del usuario que realizó la acción. |
| `storeId` | Identificador MongoDB de la tienda asociada al evento. |
| `from` | Fecha real `YYYY-MM-DD`; incluye desde las 00:00 UTC de ese día. |
| `to` | Fecha real `YYYY-MM-DD`; incluye ese día completo en UTC y excluye las 00:00 del siguiente. |
| `search` | Hasta 100 caracteres útiles. Busca acción, recurso e identificador, nombres/correo del actor, nombre/slug de tienda y nombre del recurso registrados en el evento; también reconoce las etiquetas legibles de acciones. |

Un filtro de identificador, recurso o fecha inválido produce 422. `from` y `to` pueden ser el mismo día; no se acepta un intervalo invertido. Ejemplo de consulta:

```http
GET /api/admin/audit?action=store.design.updated&from=2026-10-01&to=2026-10-20&page=1&limit=25
```

La representación de cada fila ofrece `_id`, `createdAt`, `action`, `actionLabel`, `entity`, `entityLabel`, `entityId`, `entityName`, `actor`, `store`, `summary`, `changesCount` y `hasDetails`. Algunos identificadores o datos de contexto pueden faltar o ser nulos en eventos antiguos. `meta` añade `actions` y `entities`, diccionarios de códigos y etiquetas para construir filtros sin mantener otra lista en el cliente.

`GET /admin/audit/:id` agrega:

- `changes`: cambios registrados con `field`, `label`, `beforeRecorded`, `afterRecorded` y los valores `before`/`after` disponibles.
- `facts`: otros datos del evento como `{key,label,value}`.
- `details`: detalle registrado y filtrado de datos sensibles.
- `detailNotice`: avisa cuando el evento no guardó valores anteriores y posteriores.

Los nombres del actor, tienda y recurso se toman de las copias históricas del evento. Los registros antiguos que no tienen esas copias muestran que el nombre no fue registrado; no se reconstruye un supuesto pasado usando datos actuales. Tanto el listado como el detalle requieren administrador. Un ID de evento inválido o inexistente devuelve 404.

La información sensible se filtra al registrar y al leer. Contraseñas, tokens, secretos, enlaces digitales privados, rutas de archivo y credenciales identificables no se entregan como valores de auditoría. Los indicadores booleanos de configuración, como `hasAccessToken`, sí pueden registrarse.

### WhatsApp

Los valores habituales de `status` son `disconnected`, `connecting`, `qr`, `authenticated`, `connected` y `error`. `qr` contiene una data URL de imagen cuando hay un código disponible. El cliente del panel consulta esta ruta periódicamente mientras se conecta. No debe interpretar un POST de conexión exitoso como confirmación de que el teléfono ya está vinculado.

## Tiendas y configuración del vendedor

El administrador puede utilizar estas mismas rutas sobre cualquier tienda. El vendedor sólo puede utilizar las de su propiedad. La baja lógica de una tienda hace que sus rutas habituales respondan 404.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/stores` | Array de tiendas accesibles para la sesión. |
| GET / PUT | `/stores/:storeId` | Consultar o editar nombre, slug, descripción y actividad. |
| PUT | `/stores/:storeId/design` | Guardar `{design}` normalizado: marca, fondo, páginas de compra, términos y secciones propias. |
| PUT | `/stores/:storeId/contact` | Guardar `{contact}` de esa tienda. |
| PUT | `/stores/:storeId/payments` | Guardar `{payments,deliveries,mercadopago?}`. |
| GET | `/me/plan` | `{user,plan,entitlement,contact}` para la cuenta conectada. |
| POST | `/stores/:storeId/uploads` | Multipart `files` y `purpose` opcional; sube a R2 y devuelve `[{url,name,objectKey,width,height,purpose}]`. Fondos: un archivo por solicitud. |
| DELETE | `/stores/:storeId/uploads` | Elimina de R2 uploads de esa tienda que ya no estén referenciados por un producto o por el diseño. |
| GET | `/stores/:storeId/dashboard` | Métricas de productos, stock, ventas, últimos pedidos y productos más vendidos. |

Crear una tienda como administrador requiere `{ownerId,name,slug,description?,active?}`. `slug` admite minúsculas, números y guiones, entre 3 y 80 caracteres. El vendedor puede cambiar los datos de una tienda existente, pero sólo el administrador reasigna `ownerId`. Las altas y activaciones adquieren posiciones de cuota mediante índices únicos de MongoDB; solicitudes concurrentes no pueden ocupar la misma posición. Los errores `STORE_LIMIT`/`PRODUCT_LIMIT` indican falta de capacidad, y `QUOTA_BUSY` indica que se debe recargar y reintentar tras actividad concurrente.

Contacto:

```json
{
  "contact": {
    "email": "tienda@ejemplo.com",
    "phone": "",
    "whatsapp": "5491112345678",
    "message": "¡Hola! Quisiera hacer una consulta.",
    "showWhatsapp": true,
    "showContactForm": true
  }
}
```

El formulario público usa el SMTP de la plataforma, envía al correo de la tienda y coloca al visitante en Reply-To. El botón de WhatsApp de una tienda usa un enlace al número configurado; es independiente de la conexión de whatsapp-web.js de administración.

`entitlement` contiene `allowed`, `trial`, `expiresAt`, `maxStores`, `maxProducts` y `reason`. El estado de publicación se vuelve a validar en la API pública, aunque la tienda conserve `active: true` después de vencer el plan.

### Diseño

`PUT /stores/:storeId/design` recibe `{ "design": { ... } }` y devuelve la tienda con su representación privada habitual. La fuente completa de campos, valores iniciales, enums y límites numéricos es `client/src/services/design.js`; la validación del servidor está en `api/src/utils/design.js`.

| Bloque | Campos y funciones principales |
| --- | --- |
| `brand` | Paleta clara (`primary`, `accent`, `background`, `text`), paleta oscura (`darkPrimary`, `darkAccent`, `darkBackground`, `darkText`), fuente, radio, logo, favicon, `colorMode`, `allowThemeToggle` y `textDirection`. |
| `navbar` | Alturas, logo y tamaños por dispositivo, nombre visible opcional, posición, alineación y lista de enlaces internos. |
| `copy` | Objeto plano de textos de interfaz de la tienda, con interpolación de valores conocidos. |
| `wallpaper` | Activación, modo `shared`/`responsive`, `sharedImage`/`desktopImage`/`mobileImage`, velo claro/oscuro, posición, ajuste y desplazamiento. |
| `shop` | Anuncio, variantes de portada, textos/imagen/diapositivas, destacados en grilla o carrusel, catálogo, tarjetas, hover, cinco modos de navegación por categorías, alineación, dirección de lectura, visibilidad y espaciado por área. |
| `product` | Composición `classic`/`focus`/`wide`, galería, datos visibles, relacionados, recomendaciones, mensajes y espaciado. |
| `cart` | Distribución `split`/`stacked`, resumen `card`/`minimal`, imágenes, sugerencias, notas, botones y espaciado. |
| `checkout` | Pasos o página única (`steps`/`single`), presentación `cards`/`minimal`, datos requeridos, resumen, mensajes, aceptación de términos y espaciado. |
| `terms` | `enabled`, `title`, `intro`, `content`, `showUpdatedAt`, `updatedAt`, `contentWidth`, `paddingX` y `paddingY`. |
| `sections` | Array de secciones propias; cada una puede tener un nivel de `blocks` o complementos. Incluye secciones `social` con `socialLinks`. |

El envío reemplaza el diseño completo después de normalizarlo. Se aceptan objetos parciales, pero sus omisiones se completan con valores predeterminados, **no con el diseño que ya tenía la tienda**. Para conservar lo que no se está editando, se debe leer el diseño, normalizarlo, cambiar sus campos y enviar ese objeto completo. El editor incluido sigue ese flujo.

La API exige tipos reales: booleanos JSON para visibilidad y enteros para tamaños/intervalos. El diseño completo admite hasta 160.000 caracteres serializados; los títulos y subtítulos hasta 240, los textos ordinarios hasta 4.000, las URLs hasta 2.048 y `terms.content` hasta 20.000. Los colores usan `#RRGGBB`. Los contenidos son texto y no se interpretan como HTML, JavaScript ni CSS personalizados.

| Opción | Valores o límite |
| --- | --- |
| `brand.radius` | 0–40 px. |
| `navbar.height`, `navbar.mobileHeight` | 48–220 px en escritorio; 48–160 px en móvil. |
| `navbar.paddingX` | 0–120 px. |
| `navbar.logoWidth`, `navbar.logoHeight` | Caja del logo de escritorio: 24–480 px de ancho y 24–200 px de alto. |
| `navbar.mobileLogoWidth`, `navbar.mobileLogoHeight` | Caja móvil: 24–280 px de ancho y 24–144 px de alto; la presentación se adapta al espacio real disponible. |
| `navbar.logoShape`, `navbar.logoFit`, `navbar.logoRadius` | `natural`, `square`, `rounded` o `circle`; `contain` o `cover`; radio 0–100 px. |
| `navbar.links` | Hasta 12 enlaces con IDs únicos. |
| `shop.categoryNavigation` | `chips`, `navbar`, `drawer`, `select` o `sidebar`. |
| `shop.columns` | 1–5 columnas en escritorio. |
| `shop.heroVariant` | `split`, `cover`, `image`, `centered`, `carousel`. `image` muestra sólo la imagen. |
| `shop.heroHeight`, `heroMobileHeight` | 240–900 px en escritorio; 200–800 px en celular. |
| `shop.heroOverlay`, `wallpaper.overlay`, `wallpaper.darkOverlay` | 0–90 %. |
| `shop.heroSlides` | Hasta 8 diapositivas; `heroInterval` entre 3 y 20 segundos. |
| `shop.featuredLayout` | `grid` o `rail`; intervalo 2–20 segundos y movimiento 150–1.500 ms. |
| `shop.catalogVariant` | `grid`, `compact`, `editorial`. |
| `shop.cardVariant` | `minimal`, `bordered`, `elevated`, `overlay`. |
| `shop.productHoverEffect` | `none`, `lift`, `zoom`; `productHoverSwap` muestra la segunda imagen cuando existe y el dispositivo permite hover. |
| Espaciado | Los campos `paddingX`/`paddingY`, incluidos sus prefijos, admiten 0–160 px. Cero se conserva. `fullWidth` quita el máximo de 1280 px del área correspondiente. |

Cada diapositiva tiene `id`, `image`, `title`, `subtitle`, `buttonText` y `buttonTarget`. Sus textos vacíos usan los textos generales de la portada. `heroTextColor` y `heroOverlay` se aplican a `cover` y `carousel`. El editor deshabilita los ajustes que no corresponden a la variante elegida; las opciones de avance automático de destacados sólo se usan en `rail`. El foco de teclado y la preferencia de menos movimiento pausan el avance; `featuredPauseOnHover` configura la pausa adicional por mouse.

`sections` admite hasta 12 elementos. Los tipos son `text`, `imageText`, `banner`, `benefits`, `faq`, `gallery` y `social`. Cada sección tiene un `id`, `enabled`, contenido opcional, presentación (`plain`, `card`, `contrast`, `split`, `overlay`), alineación, dirección de lectura, fondo, espaciado, ancho, 1–4 columnas y `placement` (`beforeCatalog` o `afterCatalog`). El orden del array se conserva dentro de cada ubicación. `blocks` admite hasta 12 complementos por sección, de tipo `text`, `image`, `button`, `benefit` o `faq`, sin otro nivel de anidamiento.

Los IDs de secciones, bloques y diapositivas son obligatorios, tienen 1–100 caracteres de `[a-zA-Z0-9_-]` y son únicos dentro de su lista. Los destinos de botones son `catalog`, `contact` o `terms`; no aceptan código o navegación arbitraria. Los botones hacia contenido desactivado se omiten en la tienda y se explican en la vista previa.

#### Cabecera, textos y dirección de lectura

`navbar.title` admite una cadena vacía. Con `useStoreName: true` se usa el nombre administrativo; con `useStoreName: false` se usa exactamente `title`, incluido el vacío. `showTitle: false` oculta el texto de marca. Esto permite mostrar sólo un logo sin punto añadido y conserva el nombre administrativo obligatorio y el nombre accesible de la marca. `sticky` controla la cabecera fija y `linksAlign` admite `left`, `center` o `right`.

Cada elemento de `navbar.links` tiene `{id,target,sectionId,label,enabled}`. Los destinos posibles son `home`, `catalog`, `featured`, `contact`, `terms`, `social` y `section`. Un enlace habilitado con destino `section` exige `sectionId`; una sección ausente o deshabilitada no impide guardar la configuración, pero su enlace no se muestra en la tienda. `social` resuelve la primera sección de redes sociales visible. El acceso al carrito permanece disponible independientemente de esta lista.

`copy` usa los campos publicados en `storeTextFields` y `storeTextSections`, exportados por `client/src/services/design.js` y `storeCopy.js`. Por ejemplo: `catalogDescription`, `featuredDescription`, `contactTitle`, `cartSubtitle`, `checkoutCustomerTitle`, `checkoutConfirm` y `trackingContactTitle`. Los textos explícitamente vacíos se conservan. Los títulos existentes como `shop.heroTitle`, `cart.title` y `terms.content` continúan en sus campos originales. Cada campo de `copy` tiene su propio máximo de 240 o 4.000 caracteres según el registro.

Los textos pueden incluir variables conocidas: `{count}`, `{storeName}`, `{current}`, `{pages}`, `{from}`, `{to}`, `{total}`, `{date}`, `{orderNumber}` y `{amount}`. La interpolación produce texto, nunca HTML o código. Los estados de pago, errores de validación y avisos de sistema siguen controlados por la aplicación.

`brand.textDirection` admite `ltr`, `rtl` o `auto`. Las áreas del catálogo tienen campos de alineación y dirección separados: `announcementAlign`/`announcementDirection`, `heroAlign`/`heroDirection`, `featuredAlign`/`featuredDirection`, `catalogAlign`/`catalogDirection`, `cardAlign`/`cardDirection`, `contactAlign`/`contactDirection` y `footerAlign`/`footerDirection`. Alineación admite `left`, `center` o `right`; dirección por área admite además `inherit`. Las páginas `product`, `cart`, `checkout` y `terms` usan `textAlign` y `textDirection`. Las secciones usan `alignment` y `textDirection`; los bloques permiten `alignment: inherit` para conservar la alineación de su sección.

#### Secciones de redes sociales

Una sección de tipo `social` usa `socialLinks`, `socialVariant` (`labels`, `icons`, `cards`), `socialIconSize` (16–64 px) y `socialNewTab` (booleano). Conserva título, subtítulo, cuerpo, alineación, dirección, posición y espaciado del resto de las secciones.

Cada elemento de `socialLinks` tiene `{id,network,label,url,enabled}` y la lista admite hasta 12 enlaces con IDs únicos. `network` admite `instagram`, `facebook`, `tiktok`, `youtube`, `x`, `linkedin`, `pinterest`, `threads`, `twitch`, `whatsapp` y `website`. Toda URL no vacía debe ser HTTP/HTTPS sin credenciales; un enlace habilitado dentro de una sección visible exige URL. No se realiza una conexión OAuth ni una publicación en la red: se configura un enlace que abre el visitante.

#### Temas, términos y guardado del editor

`brand.colorMode` admite `light`, `dark` o `system` y define el modo inicial. `brand.allowThemeToggle: true` permite al comprador elegir claro u oscuro con cualquiera de esos modos iniciales. La preferencia de ese comprador se guarda en el navegador por tienda y gana sobre el modo inicial mientras el cambio esté habilitado. El tema del panel y el de la vista previa tienen estados separados; no hay un endpoint de preferencia de tema del visitante.

La página de términos usa la ruta de frontend `/t/:slug/terminos`; no hay un endpoint REST separado. Se obtiene del diseño de la tienda. Activar `terms.enabled` exige título y contenido no vacíos. `updatedAt` es una fecha real `YYYY-MM-DD` o una cadena vacía. El catálogo público reemplaza el bloque de términos desactivado por sus valores iniciales para no publicar el borrador. La vista previa autenticada puede revisar ese borrador. `checkout.termsUrl` sólo se utiliza cuando los términos internos están desactivados; la aceptación del comprador se describe más abajo.

El botón **Guardar cambios** del editor puede ejecutar dos operaciones: primero el PUT de diseño pendiente y después `PUT /stores/:storeId` para `name`, `slug` y `description`. No forman una transacción conjunta. Si el diseño se guarda y la segunda operación falla, ese diseño queda persistido; los datos generales pendientes se conservan en el editor y el mensaje explica el resultado parcial. Reintentar envía las partes todavía pendientes. El nombre admite 120 caracteres y la descripción general 5.000.

Los cambios hechos mientras una solicitud está en curso permanecen como un nuevo borrador pendiente. Al salir, cambiar tienda o cerrar sesión se ofrece guardar, descartar o seguir editando. Guardar espera las imágenes y una respuesta correcta; descartar aborta las cargas y restaura las últimas partes guardadas. No se cambia el slug del iframe antes de guardar correctamente la nueva dirección.

### Carga de imágenes y fondos

`POST /stores/:storeId/uploads` requiere sesión con acceso a la tienda y CSRF. Recibe multipart con uno o varios campos `files` y un campo opcional `purpose`:

| `purpose` | Cantidad por solicitud | Resolución |
| --- | --- | --- |
| Omitido o `image` | Entre 1 y 5 imágenes. | Sin tamaño exacto obligatorio; se reducen dentro de 2000 × 2000 px, sin ampliar. |
| `wallpaper-desktop` | Un solo archivo. | Flexible; recomendación **1920 × 1080 px**. |
| `wallpaper-mobile` | Un solo archivo. | Flexible; recomendación **1080 × 1920 px**. |
| `wallpaper-shared` | Un solo archivo. | Flexible; recomendación **1920 × 1920 px**. |

Cada archivo debe ser una imagen estática JPG, PNG o WebP de hasta **5 MiB (5.242.880 bytes)** y **25.000.000 de píxeles**. Los fondos aceptan cualquier ancho y alto enteros positivos dentro de ese límite; no exigen un mínimo ni una proporción. El servidor valida el formato real, rechaza imágenes animadas y aplica la orientación. Conserva las dimensiones reales del fondo y normalmente lo convierte a WebP; si un eje supera los 16.383 píxeles admitidos por ese codificador, lo guarda como PNG. El resultado procesado también debe ocupar como máximo 5 MiB. La validación del editor complementa estos controles independientes del servidor.

Una respuesta 201 conserva el formato de array:

```json
{
  "data": [{
    "url": "https://media.tu-dominio.com/mi-tienda-ya-2/stores/ID/images/11111111-1111-4111-8111-111111111111.webp",
    "objectKey": "mi-tienda-ya-2/stores/ID/images/11111111-1111-4111-8111-111111111111.webp",
    "name": "11111111-1111-4111-8111-111111111111.webp",
    "width": 1600,
    "height": 900,
    "purpose": "wallpaper-desktop"
  }]
}
```

El ejemplo ilustra la estructura; cada archivo real recibe su propio nombre. La carga registra tienda, propósito, dimensiones y hash de contenido en `UploadedImage`. Después se asigna la URL devuelta al campo correspondiente de `design.wallpaper` y se guarda el diseño.

Los fondos sólo pueden usar archivos subidos desde esta aplicación **para esa misma tienda y con ese propósito**. Una URL remota, una imagen genérica cargada con `purpose=image` o el fondo de otra tienda no sirven como fondo, aunque coincidan sus dimensiones. Al guardar, la API vuelve a comprobar existencia en R2, tamaño, dimensiones contra su propio registro y hash; no compara las medidas con las recomendaciones. Revalida todos los campos de fondo no vacíos, incluso los que no están activos en ese momento. No descarga imágenes externas para validar fondos.

Con `wallpaper.enabled: true`, `mode: responsive` exige las dos imágenes de escritorio y celular; `mode: shared` exige la compartida, sin obligar a que sea cuadrada. El ajuste `cover` puede recortar los extremos según la pantalla; `contain` prioriza mostrar la imagen completa.

Errores relevantes: 413 `FILE_TOO_LARGE`; 422 `INVALID_IMAGE`, `INVALID_WALLPAPER` o `INVALID_FILES`. El exceso de archivos y un nombre de campo multipart incorrecto también se rechazan. Los errores del diseño usan 422 `INVALID_DESIGN`, con la ruta del campo cuando está disponible.

### Cobros y entregas

```json
{
  "deliveries": [
    { "id": "pickup", "type": "pickup", "name": "Retiro en el local", "description": "Coordinar horario", "price": 0, "active": true },
    { "id": "shipping", "type": "shipping", "name": "Envío", "description": "Entrega con costo fijo", "price": 3000, "active": true }
  ],
  "payments": [
    { "id": "cash", "type": "cash", "name": "Efectivo", "instructions": "Al retirar", "deliveryIds": ["pickup"], "active": true },
    { "id": "transfer", "type": "transfer", "name": "Transferencia", "deliveryIds": ["pickup", "shipping"], "active": true, "bank": { "holder": "Titular", "bank": "Banco", "cbu": "", "alias": "", "cuit": "" } }
  ]
}
```

Tipos de entrega: `pickup`, `shipping`, `digital`, `custom`. Tipos de cobro: `cash`, `transfer`, `mercadopago`. Los identificadores deben ser únicos dentro de cada lista. `deliveryIds` relaciona pagos con entregas existentes; una lista vacía no agrega restricciones por identificador, aunque siguen aplicándose las validaciones del tipo de entrega y los productos.

El cuerpo también admite `expectedUpdatedAt` con la fecha ISO de la tienda que el cliente acaba de leer. Si la tienda cambió, responde 409 `STORE_CONFLICT`. La escritura utiliza control de versión para detectar cambios concurrentes durante el guardado; el cliente debe recargar y revisar antes de reenviar.

Las credenciales de Mercado Pago se envían en `mercadopago: {accessToken,webhookSecret,sandbox}`. Los campos vacíos conservan las credenciales anteriores. `clearCredentials: true` las elimina. Las respuestas sólo exponen `hasAccessToken`, `hasWebhookSecret` y `sandbox`. No se puede habilitar un medio Mercado Pago sin Access Token y secreto de Webhooks.

## Categorías y productos

| Método | Ruta | Uso |
| --- | --- | --- |
| GET / POST | `/stores/:storeId/categories` | Listar o crear. |
| GET / PUT / DELETE | `/stores/:storeId/categories/:id` | Consultar, editar o archivar. |
| GET / POST | `/stores/:storeId/products` | Listar o crear. |
| GET / PUT / DELETE | `/stores/:storeId/products/:id` | Consultar, editar o archivar. |

### Categorías y subcategorías

Crear una categoría principal:

```json
{ "name": "Indumentaria", "description": "", "parentId": null, "active": true }
```

Crear una subcategoría, usando el identificador real de cualquier categoría de la misma tienda:

```json
{ "name": "Remeras", "parentId": "64f000000000000000000001", "active": true }
```

`parentId` vale `null` de forma predeterminada. Se pueden anidar subcategorías dentro de otras subcategorías sin un máximo fijo de niveles. El padre y su cadena de ancestros deben existir, pertenecer a la tienda y no estar archivados. No se permite asignar la propia categoría como padre ni mover una rama dentro de cualquiera de sus descendientes. Los nombres de categorías no archivadas siguen siendo únicos dentro de la tienda.

`PUT` acepta cambios parciales: omitir `parentId` conserva la relación y enviarlo como `null` convierte una subcategoría en principal. Una categoría con hijos puede moverse a otra ubicación permitida; conserva sus descendientes y todas las asignaciones de productos. Para eliminarla sí debe estar sin hijos no archivados, incluidos los inactivos. En ese caso el servidor responde 409 `CATEGORY_HAS_CHILDREN` y no altera las asignaciones.

Archivar una categoría sin hijos la oculta y quita esa asignación de sus productos, sin borrar los productos. Las mutaciones se serializan con un token persistido por tienda. Una solicitud simultánea responde 409 `CATEGORY_CONFLICT`; el cliente debe recargar antes de reintentar. No hay un endpoint para forzar el desbloqueo: ante una operación de resultado incierto se conserva el token hasta la recuperación durante el arranque del único proceso, sin tráfico concurrente. Los datos internos que protegen estas relaciones no se exponen en respuestas de la API.

Filtros adicionales de `GET /stores/:storeId/categories`:

| Parámetro | Resultado |
| --- | --- |
| Sin `parentId` | Todas las categorías y subcategorías no archivadas, con `parentId` en cada fila. |
| `parentId=root` o `parentId=null` | Sólo categorías principales. Aquí `null` es el texto enviado en la URL. |
| `parentId=<id>` | Hijos directos del identificador indicado, dentro de la tienda autorizada. |

Los filtros pueden combinarse con búsqueda y paginación. Las respuestas públicas devuelven sólo categorías activas con todos sus ancestros activos y presentes. Ocultar cualquier nivel oculta su rama completa del menú. La actividad de la categoría determina su navegación, sin desactivar automáticamente los productos que tiene asignados.

### Productos

Producto de ejemplo:

```json
{
  "name": "Remera",
  "description": "Descripción de texto plano",
  "categoryId": null,
  "type": "physical",
  "digitalUrl": "",
  "images": [],
  "price": 12000,
  "previousPrice": 15000,
  "active": true,
  "featured": false,
  "madeToOrder": false,
  "stock": 0,
  "variants": [
    { "id": "s-negro", "name": "S / Negro", "sku": "RE-S-N", "stock": 8, "attributes": { "Talle": "S", "Color": "Negro" } },
    { "id": "m-negro", "name": "M / Negro", "sku": "RE-M-N", "stock": 12, "price": 12500, "attributes": { "Talle": "M", "Color": "Negro" } }
  ],
  "relatedProductIds": []
}
```

`type` admite `physical` o `digital`. Un producto digital necesita un enlace HTTP/HTTPS. Los productos digitales y hechos a pedido no reservan stock. Se admiten hasta 5 imágenes, 100 variantes y 50 productos relacionados.

El stock inicial se acepta al crear. En PUT, el stock existente se conserva; una variante agregada después comienza en cero y su cantidad se configura desde Stock. El servidor no deja cambiar tipo, condición de elaboración o estructura de variantes cuando existen reservas pendientes. Las referencias de categoría y productos relacionados tienen que pertenecer a la tienda. `categoryId` puede apuntar a una principal o a una subcategoría no archivada.

Los PUT parciales de productos conservan los campos no enviados. Desde v1.1.0 se normalizan los atributos de variantes almacenados como Map de Mongoose antes de validar una edición parcial: modificar descripción o precio no exige reenviar el objeto de atributos ni borra color/talle.

Las imágenes nuevas editables deben subirse desde la propia tienda: el backend verifica que la URL pertenezca a un `UploadedImage` de esa tienda almacenado en R2. Los assets de demostración propios siguen disponibles. Los uploads reales validan el contenido JPG/PNG/WebP y normalmente lo convierten a WebP; no basta con cambiar la extensión de un archivo.

### Marcar destacados y filtrar productos

`Product.featured` es booleano, inicialmente `false`, y puede enviarse al crear o editar. Para una acción desde el listado:

```http
PUT /api/stores/:storeId/products/:id
Content-Type: application/json
X-CSRF-Token: TOKEN_DE_LA_SESION
```

```json
{ "featured": true }
```

Se requiere la misma sesión, propiedad de la tienda y CSRF que para editar el producto. El valor debe ser un booleano JSON; la cadena `"false"` se rechaza. Este cambio puntual escribe únicamente el destacado e incrementa la versión del producto; no reemplaza cantidades, variantes ni reservas. Puede convivir con una reserva de compra sin sobrescribir su stock. La respuesta usa la representación privada habitual del producto.

`GET /stores/:storeId/products` admite, además de búsqueda/paginación:

| Parámetro | Resultado |
| --- | --- |
| `featured=true` | Sólo productos marcados como destacados. |
| `featured=false` | Productos sin destacar; también contempla documentos anteriores sin el campo. |
| `categoryId=<id>` | Productos asignados a la categoría seleccionada o a cualquiera de sus descendientes no archivados, desde cualquier nivel. |
| `category=<id>` | Alias de `categoryId`. Enviar ambos con valores distintos se rechaza. |

Una categoría ajena, inexistente o archivada produce una lista vacía. Un identificador mal formado produce 422. No se utiliza el filtro para acceder a datos de otra tienda.

| Código específico | HTTP | Significado |
| --- | --- | --- |
| `CATEGORY_NOT_FOUND` | 404 | La categoría solicitada no está disponible para la tienda. |
| `CATEGORY_SELF_PARENT` | 422 | Se intentó asignar la propia categoría como padre. |
| `CATEGORY_PARENT_INVALID` | 422 | El padre o un ancestro no es una categoría válida, presente y no archivada de la misma tienda. |
| `CATEGORY_CYCLE` | 422 | El movimiento colocaría una categoría dentro de su propio subárbol. |
| `CATEGORY_HAS_CHILDREN` | 409 | Hay hijos que deben resolverse antes de archivar el padre. No impide un movimiento válido de la rama. |
| `CATEGORY_CONFLICT` | 409 | Hay otra mutación de jerarquía en curso, un resultado incierto pendiente de recuperación o una escritura con versión desactualizada. |
| `CATEGORY_HIERARCHY_INVALID` | 500 | Hay un ciclo o relación inválida en datos existentes; el arranque de recuperación se detiene para revisarlos. |
| `CATEGORY_FILTER_INVALID` | 422 | Identificador o combinación de filtros de categoría inválidos. |
| `FEATURED_FILTER_INVALID` | 422 | El parámetro URL `featured` no es `true` ni `false`. |

## Stock

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/stores/:storeId/stock` | Productos con disponibilidad, variantes, `stockVersion` y `reservedStock`. |
| PUT | `/stores/:storeId/stock` | Asignar cantidades absolutas con comprobación de concurrencia. |
| GET | `/stores/:storeId/stock/movements` | Historial paginado de ajustes, reservas, reposiciones y ventas. |

Petición de ajuste:

```json
{
  "reason": "Recuento de inventario",
  "items": [
    { "productId": "ID_PRODUCTO", "stock": 25, "expectedStock": 18 },
    { "productId": "ID_OTRO_PRODUCTO", "variantId": "m-negro", "stock": 12, "expectedStock": 10 }
  ]
}
```

El lote admite 1–500 filas. `expectedStock` es obligatorio y representa el valor leído antes de editar. El servidor devuelve `{updated,conflicts}`. Un conflicto de una fila no revierte las otras: el cliente debe mostrar las filas aplicadas y pedir revisar las conflictivas. No puede ajustarse el stock general de un producto que administra variantes ni el de productos digitales/hechos a pedido.

## Pedidos privados

| Método | Ruta | Uso |
| --- | --- | --- |
| GET / POST | `/stores/:storeId/orders` | Listar o crear un pedido manual con la estructura de checkout; no registra aceptación por el comprador. |
| GET | `/stores/:storeId/orders/:id` | Consultar pedido, historial e incidencias. |
| PUT | `/stores/:storeId/orders/:id/status` | `{status,confirmFinal?,note?}`. |
| DELETE | `/stores/:storeId/orders/:id` | Solicitar cancelación final; requiere `{confirmFinal:true,note?}`. |
| PUT | `/stores/:storeId/orders/:id/fulfillment` | `{fulfillmentStatus,note?}`. |
| POST | `/stores/:storeId/orders/:id/verify-payment` | Consultar a Mercado Pago y reconciliar. |
| POST | `/stores/:storeId/orders/:id/resend-digital` | Encolar nuevo intento de entrega digital de un pedido pagado. |
| GET | `/stores/:storeId/orders/:id/receipt` | Descargar comprobante privado. |

Estados de pedido: `pending`, `awaiting_payment`, `processing`, `paid`, `cancelled`. `creating` es interno. `paid` y `cancelled` requieren `confirmFinal: true`; no se reabren. Repetir el mismo estado final es idempotente y permite reparar efectos pendientes.

La API no admite marcar manualmente como pagado un pedido de Mercado Pago: usa Verificar pago o un Webhook válido. Efectivo y transferencia pueden confirmarse después de revisar el cobro. Un pedido manual puede registrarse desde un panel aunque la tienda no esté publicada; no habilita a compradores públicos a vender sin plan.

Estados de entrega: `unfulfilled`, `preparing`, `shipped`, `delivered`. Enviado y entregado requieren un pedido pagado. El pedido cancelado no admite cambios de entrega.

## Catálogo, compra y seguimiento público

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/public/stores/:slug` | `{store,categories,products,featuredProducts,meta}`; búsqueda, filtro y paginación. |
| GET | `/public/stores/:slug/products/:id` | `{product,related,recommendations}`. |
| POST | `/public/stores/:slug/recommendations` | `{productIds:[...]}` → array de productos. |
| POST | `/public/stores/:slug/contact` | `{name,email,message,website?}`; `website` funciona como campo antispam. |
| POST | `/public/stores/:slug/orders` | Crear el pedido y, si corresponde, obtener la URL de Mercado Pago. |
| GET | `/public/orders/:id?token=...` | Consultar estado e instrucciones del pedido autorizado por token. |
| POST | `/public/orders/:id/verify-payment?token=...` | Consultar a Mercado Pago usando la autorización del pedido. |
| POST | `/public/orders/:id/receipt?token=...` | Multipart `file`, imagen o PDF de hasta 8 MiB. |
| POST | `/webhooks/mercadopago/:storeId` | Recibir notificación firmada del proveedor. |

El catálogo público acepta `search`, `categoryId` —también `category`—, `featured=true|false`, `sort` (`price_asc`, `price_desc`, `name`), `page` y `limit`. Los filtros de categorías tienen la misma expansión a todos los descendientes descrita arriba. Su metainformación está dentro de `data.meta`, junto a la tienda y los productos. `meta.total` cuenta los productos de la consulta actual, antes de paginar.

`featuredProducts` es un array adicional de hasta **12** productos marcados como destacados, activos y no archivados, siempre de esa tienda. Se ordena por `createdAt` descendente y, como desempate, `_id` descendente. Su selección es global: no cambia por `search`, categoría, `featured`, `sort`, `page` o `limit`. Por ejemplo, una consulta con `featured=false&page=2&limit=1` sigue recibiendo los destacados globales en ese array. Un producto destacado también puede aparecer en la lista ordinaria si cumple sus filtros.

Cada categoría pública incluye `parentId` —ID o `null`— y cada producto público incluye `featured`, también en detalle, relacionados y recomendaciones. `featuredProducts` usa la misma selección segura de campos públicos: no contiene enlaces de entrega digital, credenciales ni reservas privadas. El cliente aplica `design.shop.showFeatured` y `featuredTitle` para presentar esa sección; ocultarla no altera los productos guardados.

El catálogo y checkout no funcionan cuando la tienda está inactiva, archivada o su dueño no tiene habilitación vigente. La nueva colección de destacados queda protegida por esa misma comprobación.

Crear pedido:

```json
{
  "customer": {
    "name": "Nombre del comprador",
    "email": "comprador@ejemplo.com",
    "phone": "1112345678",
    "address": "Dirección si hay envío",
    "city": "Localidad",
    "postalCode": "Código postal",
    "notes": "Observaciones"
  },
  "items": [{ "productId": "ID_PRODUCTO", "variantId": "m-negro", "quantity": 2 }],
  "deliveryId": "pickup",
  "paymentId": "cash",
  "termsAccepted": true,
  "idempotencyKey": "clave-aleatoria-unica-de-16-o-mas-caracteres"
}
```

Se admiten entre 1 y 100 líneas y hasta 999 unidades por producto/variante. Las cantidades deben ser números enteros. La clave de idempotencia admite letras, números, guiones y guiones bajos, con 16–160 caracteres. Debe conservarse al reintentar el mismo envío y cambiarse para una compra diferente.

La respuesta es `{order,accessToken,checkoutUrl?}`. El cliente conserva el token junto con el identificador para abrir `/pedido/:id?token=...`. Ese token permite consultar datos privados del comprador: no debe compartirse como enlace promocional de una tienda.

El servidor calcula precios, variantes, entrega y total desde datos persistidos; no acepta importes calculados por el navegador. Una compra con productos físicos, o una tienda con `checkout.requirePhone: true`, exige teléfono. Las entregas `shipping` y `custom` requieren dirección, localidad y código postal; una entrega digital no puede contener productos físicos. Subir un comprobante sólo está disponible para transferencia y pedidos no finales. El archivo se revisa manualmente antes de registrar el pago.

Los enlaces digitales se envían por SMTP después de confirmar el pago y no están presentes en ninguna respuesta pública de productos o pedidos. El seguimiento permanece consultable mediante su token aunque la tienda deje de estar publicada.

### Aceptación de términos e idempotencia

Para un pedido público nuevo, la API determina los términos desde el diseño guardado. El cuerpo del comprador sólo puede indicar la decisión con `termsAccepted`; no puede imponer fecha, contenido ni hash del documento aceptado.

| Configuración al crear el pedido | Validación y registro |
| --- | --- |
| `terms.enabled: true` | Exige `termsAccepted: true`. Usa la página interna, aunque también exista `checkout.termsUrl`. |
| Términos internos desactivados y `checkout.termsUrl` no vacío | Exige `termsAccepted: true`. Registra el enlace externo y su etiqueta configurados. |
| Sin términos internos ni enlace externo | No exige la casilla; registra `{required:false,accepted:false,source:"none"}`. |
| Pedido manual desde el panel | Registra `{required,accepted:false,source:"manual"}`. El vendedor no genera una aceptación en nombre del comprador. |

En una compra pública nueva, si se envía `termsAccepted` debe ser un booleano JSON: `"true"`, `1` y `null` producen 422 `INVALID_TERMS_ACCEPTANCE`. Si la aceptación es obligatoria y no se envía `true`, responde 422 `TERMS_ACCEPTANCE_REQUIRED`. Un diseño interno habilitado pero sin título o contenido válido impide crear el pedido con 409 `TERMS_NOT_CONFIGURED`. Estas comprobaciones se realizan antes de crear el pedido o reservar stock.

Para una aceptación requerida y válida, `Order.termsAcceptance` guarda `required`, `accepted`, `source`, `acceptedAt`, `contentHash` y un `snapshot` con `title`, `intro`, `content`, `url` y `updatedAt`. `acceptedAt` lo fija el servidor. El hash SHA-256 se calcula sobre la serialización de `{source,snapshot}`. Si el origen es externo, el snapshot contiene el enlace y la etiqueta; `intro`, `content` y `updatedAt` quedan vacíos. El servidor no descarga el documento remoto ni afirma que el hash representa su contenido.

Las respuestas habituales de pedidos presentan un resumen de aceptación: `required`, `accepted`, `source`, `acceptedAt`, `contentHash`, `title` y `url`. El cuerpo completo del snapshot queda almacenado en el pedido y no se incluye en esa representación de la API. Los pedidos anteriores a esta función pueden no tener `termsAcceptance`.

La clave `idempotencyKey` identifica un intento por tienda. La comparación del contenido usa comprador, entrega, pago y líneas normalizadas; combina líneas repetidas y ordena por producto/variante. **`termsAccepted` no forma parte de ese hash de solicitud**. Si ya existe un pedido compatible para esa clave, la API conserva y devuelve la aceptación original antes de volver a evaluar los términos actuales. Cambiar después la página o volver a enviar sin la casilla no reemplaza ni fabrica otra aceptación del pedido existente. El acceso público a la tienda sigue sujeto a sus controles habituales.

| Estado del intento anterior | Resultado al reutilizar la clave |
| --- | --- |
| Mismo contenido y pedido ya creado, no cancelado | Devuelve el pedido y su autorización; no crea otra aceptación ni vuelve a reservar stock. |
| Contenido de compra diferente | 409 `IDEMPOTENCY_CONFLICT`. |
| Creación todavía en proceso | 409 `ORDER_IN_PROGRESS`; conservar la clave y reintentar. |
| Intento cancelado | 409 `ORDER_ALREADY_CANCELLED`; iniciar un pedido nuevo con otra clave. |

La vista previa valida datos, entrega, pago y aceptación antes de mostrar su aviso informativo, pero no llama al endpoint para crear un pedido, reservar stock ni registrar una aceptación.

## Comprobaciones y evolución

Los esquemas y reglas efectivas están en `api/src/models`, `routes` y `services`. Las pruebas en `api/test` cubren los flujos de seguridad y comercio. La referencia describe la versión entregada; una integración externa nueva debe respetar los mismos controles de dueño, CSRF, idempotencia, validación de precios y protección de enlaces privados.

## Dominio público de una tienda (v1.10.0)

Rutas autenticadas con acceso a la tienda:

```text
GET  /api/stores/:storeId/domain
PUT  /api/stores/:storeId/domain
POST /api/stores/:storeId/domain/verify
```

Ejemplos de configuración:

```json
{ "mode": "path" }
```

```json
{ "mode": "subdomain", "subdomain": "mi-marca" }
```

```json
{ "mode": "custom", "customDomain": "tienda.mi-marca.com" }
```

En modo `custom`, la respuesta incluye el TXT de verificación y el destino CNAME/ALIAS. `POST .../verify` consulta DNS y, cuando el TXT contiene el token exacto, ejecuta el aprovisionamiento automático de Nginx/Certbot. El dominio sólo queda `verified` después de que `nginx -t`, la emisión SSL y la recarga final terminan correctamente. Si falla infraestructura, permanece `pending` y se puede reintentar.

`GET /api/public/host-store` resuelve la tienda correspondiente al hostname de la petición y se utiliza como endpoint auxiliar de diagnóstico/integración. La tienda compilada normalmente recibe esta resolución directamente en el HTML servido por Express.

## ABM de tiendas del vendedor · v1.16.1

Disponible únicamente para vendedores cuyo `entitlement.maxStores` sea mayor que 1. Todas las consultas y mutaciones se limitan al `ownerId` de la sesión.

- `GET /api/me/stores`: listado paginado de las tiendas propias.
- `GET /api/me/stores/:id`: consulta una tienda propia.
- `POST /api/me/stores`: crea una tienda propia usando la cuota del plan.
- `PUT /api/me/stores/:id`: edita nombre, slug, descripción y publicación de una tienda propia.
- `DELETE /api/me/stores/:id`: archiva una tienda propia. Si tiene una transferencia pendiente, primero debe cancelarse.

Las transferencias salientes se siguen ejecutando con `/api/me/store-transfers`, pero para vendedores multi-tienda la interfaz las inicia, muestra y cancela directamente desde este ABM.

## Transferencias de tiendas · v1.16.0

- `GET /api/me/store-transfers`: pendientes entrantes/salientes, historial, cupo del destinatario y disponibilidad del permiso.
- `POST /api/me/store-transfers`: inicia una transferencia. Requiere `stores.transfer`. Body: `{ storeId, recipientEmail }`.
- `POST /api/me/store-transfers/:id/cancel`: cancela una transferencia saliente todavía pendiente.
- `POST /api/me/store-transfers/:id/accept`: acepta una transferencia dirigida al email de la sesión. Exige suscripción vigente no-trial y cupo de tienda.
- `POST /api/me/store-transfers/:id/return`: inicia una devolución al dueño anterior a partir de una transferencia ya aceptada.


## Redes sociales y anuncios (v1.18.0)

Todos los endpoints de tienda exigen acceso a la tienda indicada. Los secretos de Facebook no se devuelven en las respuestas.

- `GET /stores/:storeId/social`: redes visibles y estado seguro de Facebook.
- `POST /stores/:storeId/social/facebook/connect`: inicia OAuth y devuelve la URL de autorización.
- `GET /social/facebook/callback`: callback OAuth autenticado.
- `POST /stores/:storeId/social/facebook/sandbox`: conecta credenciales de Marketing API Sandbox cuando el servidor lo permite.
- `POST /stores/:storeId/social/facebook/refresh`: vuelve a consultar activos de Meta.
- `PUT /stores/:storeId/social/facebook/assets`: elige cuenta publicitaria y Página.
- `DELETE /stores/:storeId/social/facebook`: desconecta Facebook de la tienda.
- `GET /stores/:storeId/social/facebook/products`: productos activos elegibles para anuncios.
- `POST /stores/:storeId/social/facebook/ads`: crea campaña, conjunto, creativo y anuncio de tráfico, todos pausados.

Administración incorpora además `GET /admin/custom-plan-requests/:id` para la vista dedicada de una solicitud de plan.

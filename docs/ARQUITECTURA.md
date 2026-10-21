# Arquitectura de Mi Tienda Ya 2

## Estructura y ejecución

El proyecto usa JavaScript ESM y dos workspaces npm: `api` y `client`. El frontend está construido con Vue y CSS propio; no incorpora un segundo framework visual. La API usa Node.js, Express y MongoDB mediante Mongoose. El enfoque de Programación Orientada a Objetos concentra las reglas del negocio en servicios con responsabilidades separadas.

La versión 1.6.0 conserva categorías anidadas sin un máximo fijo de niveles, fondos de resolución flexible y configuración de cabecera, textos, dirección de lectura y redes sociales por tienda. Mantiene los destacados independientes de la paginación, los términos con aceptación registrada, la auditoría histórica y las reglas de roles, planes y reservas de stock.

En desarrollo, `npm run dev` inicia los dos procesos de trabajo. En la distribución compilada, `npm run build` genera `client/dist` y `npm start` inicia una sola aplicación Express: sirve `/api`, las imágenes de productos y el cliente compilado. PM2 puede administrar ese proceso único. El proceso incorpora el trabajador de correos y reconciliación de pedidos; WhatsApp sólo inicia su navegador cuando el administrador pulsa Conectar.

La configuración se lee del `.env` situado en la raíz. `ENV_FILE` permite seleccionar otro archivo; debe definirse antes de iniciar Node. `api/src/config.js` resuelve las rutas del proyecto desde su propia ubicación, por lo que los archivos no dependen de iniciar el comando desde una carpeta específica. El proyecto necesita el código del cliente además de su compilación: el contrato puro de diseño se comparte con la API desde `client/src/services/design.js`.

## Capas y responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| `api/src/app.js` | Configurar Express, cabeceras, CORS, límites, lectura de sesión, rutas, archivos estáticos y manejo uniforme de errores. |
| `api/src/index.js` | Validar configuración, conectar MongoDB, crear índices y administrador inicial, iniciar servicios y cerrar recursos. |
| `models/index.js` | Usuarios, planes, tiendas, categorías, productos, configuración, auditoría, imágenes registradas, sesiones y enlaces de acceso. |
| `models/commerce.js` | Pedidos con snapshot de aceptación de términos, movimientos de stock y trabajos persistentes de correo. |
| `middleware/core.js` | Autenticación, CSRF, permisos de administrador y aislamiento de la tienda seleccionada. |
| `AuthService` | Sesiones, contraseña del administrador y acceso de vendedores mediante enlaces. |
| `SettingsService` | Recuperar la configuración global única con valores iniciales. |
| `EntitlementService` | Calcular si un vendedor tiene prueba o plan vigente y los límites aplicables. |
| `QuotaService` | Adquirir posiciones de cuota mediante índices únicos de MongoDB y reconciliar publicaciones al cambiar un plan. |
| `CategoryService` | Crear, mover y archivar categorías multinivel; serializar cambios de jerarquía por tienda, reconstruir referencias al arrancar y resolver filtros transitivos de categoría/destacados. |
| `AuditService` | Capturar contexto y cambios, filtrar datos sensibles al escribir y leer, presentar eventos y resolver filtros/detalle históricos. |
| `ImageService` | Validar y convertir imágenes, registrar su procedencia y comprobar fondos por tienda, propósito, dimensiones y hash. |
| `TermsService` | Validar la aceptación de un pedido nuevo y construir su snapshot, fecha y hash desde el diseño persistido. |
| `MailService` | Encapsular Nodemailer y SMTP; comunicar fallas sin inventar entregas exitosas. |
| `WhatsAppService` | Administrar una instancia de whatsapp-web.js y el estado consultable del QR. |
| `CatalogService` | Catálogo público, destacados globales, productos, recomendaciones y formulario de contacto. |
| `InventoryService` | Reservar, confirmar y reponer stock; asignar cantidades absolutas. |
| `CommerceService` | Crear pedidos, estados, pagos, autorización de consulta y paneles comerciales. |
| `MercadoPagoService` | Crear preferencias Checkout Pro, consultar pagos y verificar firma de Webhooks. |
| `ReceiptService` | Validar y almacenar comprobantes privados, y servirlos sólo al dueño o administrador. |
| `CommerceWorker` | Reparar efectos pendientes, consultar reservas vencidas y enviar correos con reintentos. |

En el cliente, `ApiClient` centraliza HTTP y CSRF. Los servicios de sesión y espacio de trabajo mantienen usuario y tienda seleccionada. Los componentes comunes ofrecen tablas, notificaciones y confirmaciones. Los formularios de alta y edición tienen rutas propias. Los diálogos se reservan para avisos y confirmaciones.

## Modelo de datos y aislamiento

`User.role` sólo acepta `admin` o `vendedor`. Un índice único parcial sobre el rol `admin` impide crear un segundo administrador, incluso si se intenta escribir directamente a través del modelo. El correo de los usuarios tiene un índice único. La primera inicialización crea el administrador utilizando `ROOT_USER` y un hash bcrypt de `ROOT_PASSWORD`; las siguientes inicializaciones conservan la cuenta y la contraseña persistidas.

Cada `Store` pertenece a un vendedor mediante `ownerId`. Categorías, productos y pedidos incluyen `storeId`. Las rutas privadas recuperan primero la tienda y comprueban que la sesión corresponda a su dueño o al administrador. Los productos relacionados y las categorías se validan contra la misma tienda; no se aceptan referencias de otra cuenta.

Las bajas de usuarios, tiendas, categorías y productos son lógicas. Los pedidos conservan una copia de nombre, variante, precio, medio de pago, entrega y demás datos de la compra. Cambiar después un producto o la configuración de cobros no modifica un pedido existente.

Los campos sensibles se seleccionan expresamente cuando el servicio los necesita. Las respuestas públicas se construyen con funciones de selección de campos: no contienen enlaces digitales, credenciales de Mercado Pago, rutas de comprobantes, claves de idempotencia ni hashes de autorización.

## Auditoría histórica

`AuditService` centraliza escritura, lectura, filtros y presentación. Los registros incluyen acción, recurso, identificadores, fecha y copias del contexto: `actorSnapshot`, `storeSnapshot` y `entitySnapshot`. El nombre que se muestra corresponde a la captura del evento, por lo que una modificación posterior de la tienda o del usuario no cambia ese registro histórico. Los eventos antiguos sin copias se muestran como datos no registrados; el servicio no inventa nombres ni valores anteriores.

Las mutaciones que registran cambios usan sus valores previos reales y `AuditService.changes()`. El resultado describe campos con `before` y `after`; los arrays pueden aparecer como un cambio de lista completa. Los ajustes de stock incluyen cantidades y conflictos, y los pedidos registran creación, estado, entrega y comprobantes. El listado del dashboard utiliza la misma presentación legible de auditoría.

La API de administración expone `GET /admin/audit` y `GET /admin/audit/:id`. El primero acepta acción, tipo de recurso, actor, tienda, fechas `from`/`to`, búsqueda y paginación. Los días del filtro se interpretan en UTC; `to` incluye su día completo. El detalle distingue valores ausentes de valores registrados vacíos mediante `beforeRecorded` y `afterRecorded`, y ofrece otros hechos del evento. La API no expone operaciones para editar o borrar auditoría.

La redacción se aplica antes de guardar y nuevamente al leer, incluyendo eventos anteriores. Filtra campos sensibles y descriptores de cambios que apunten a contraseñas, tokens, secretos, enlaces digitales privados o credenciales; también oculta rutas y valores reconocidos dentro de URLs y autorizaciones. Conserva indicadores booleanos de configuración. No se presenta una captura de credenciales como un cambio de texto normal.

La mayoría de las rutas escriben el evento después de la mutación de negocio. Esa secuencia no es una transacción conjunta entre la entidad y `AuditLog`; la auditoría no actúa como un mecanismo de reversión de operaciones ya persistidas.

## Categorías multinivel y consistencia de relaciones

`Category.parentId` es `null` para una principal y contiene el ID de su contenedora para cualquier subcategoría. Esa contenedora puede estar a su vez dentro de otra. `Product.categoryId` sigue siendo una sola referencia y puede apuntar a cualquier nivel. Se mantiene la unicidad de nombres de categorías no archivadas dentro de cada tienda.

| Campo de categoría | Función |
| --- | --- |
| `storeId` | Limitar la categoría y sus relaciones a una tienda. |
| `parentId` | Relación pública con la categoría contenedora inmediata, o `null`. |
| `active`, `archived` | Visibilidad de navegación y baja lógica. |
| `hierarchyLinks` | Referencias internas de hijos, con identificador del hijo y token de la operación. Se excluyen de la API. |
| `parentLinkToken` | Token interno de la relación que quedó confirmada en el hijo. Se excluye de la API. |
| `__v` | Versión utilizada para detectar lecturas que quedaron desactualizadas durante una escritura. |

El servicio rechaza autorreferencias, padres de otra tienda, padres archivados y movimientos dentro de la propia rama. Se recorre toda la cadena de ancestros del destino para detectar ciclos. Una categoría con descendientes puede cambiar de ubicación: la operación cambia su `parentId` y conserva todos sus hijos y las asignaciones de productos. La baja continúa limitada a hojas; los hijos inactivos también impiden borrar su padre. Archivar una hoja quita su referencia de los productos y conserva tanto los productos como los pedidos históricos.

### Creación, movimientos y carreras

Cada alta, edición o baja adquiere primero un token de exclusión en `CategoryHierarchy`, cuyo `_id` es el ID de la tienda. Una única escritura de MongoDB comprueba que no haya token, coloca uno nuevo e incrementa `revision`. El índice único de `_id` impide que una segunda solicitud adquiera el mismo bloqueo. Esa solicitud recibe 409 `CATEGORY_CONFLICT`; las otras tiendas siguen disponibles. No se utiliza una cola en memoria como garantía de exclusión.

Mientras posee el token, el servicio valida el árbol actual, reserva una referencia en el nuevo padre, crea o modifica el hijo y libera la referencia anterior. Las escrituras sobre categorías conservan la comprobación de `__v`. Las reservas llevan tokens propios para que un intento rechazado no retire una referencia confirmada por otro. El bloqueo cubre todo el proceso de comprobación y cambio: dos solicitudes que intenten mover ramas una dentro de otra no validan sobre el mismo árbol desactualizado.

Una escritura que falla libera su referencia tentativa sólo después de comprobar que el hijo no quedó confirmado con ese token. Los errores confirmados de negocio, validación o clave duplicada liberan la exclusión; un error inesperado de red o resultado incierto conserva el token para impedir nuevas mutaciones hasta la recuperación. El token no vence por tiempo: una pausa del proceso no habilita a otro escritor. No se debe borrar manualmente un token para resolver una demora mientras el proceso anterior pueda seguir escribiendo.

El diseño funciona con MongoDB standalone y el despliegue soportado de un proceso de aplicación. La exclusión serializa cambios de jerarquía; no convierte las distintas escrituras de categorías, productos y auditoría en una transacción conjunta. Una interrupción puede requerir la reconciliación del arranque. Las lecturas públicas y privadas no esperan el bloqueo.

### Arranque y recuperación

`bootstrap()` crea/verifica índices, mantiene las cuotas y ejecuta `CategoryService.initialize()` antes de que Express escuche peticiones. Primero valida todo el bosque de categorías. Luego reconstruye las referencias internas a partir del `parentId` persistido, completa tokens de relaciones anteriores y elimina referencias sobrantes de intentos interrumpidos. Las categorías antiguas sin `parentId` se normalizan como principales. También completa la desasignación de productos si una baja se interrumpió después de archivar una hoja. Las asignaciones a categorías válidas se conservan. Sólo después de completar la reconciliación se quitan los tokens de exclusión pendientes.

Si encuentra un ciclo o un padre ajeno, inexistente o archivado, el arranque falla con `CATEGORY_HIERARCHY_INVALID` antes de reconstruir relaciones o quitar bloqueos; no transforma ni borra contenido para ocultar el problema. Los niveles tercero y posteriores son válidos. La reconstrucción debe realizarse sin escrituras concurrentes sobre esa base. En el despliegue soportado se ejecuta al iniciar el único proceso, antes de atender tráfico; una carga o mantenimiento que invoque `bootstrap()` debe respetar esa misma condición. No ejecutar un arranque de recuperación junto a otra instancia activa.

El arranque también completa `featured: false` en productos anteriores que no tengan el campo. No necesita convertir las categorías existentes ni recrear el catálogo para actualizar desde la versión 1.0.

### Filtros y visibilidad

El filtro de productos `categoryId` —alias `category`— se limita primero a la tienda e incluye la categoría seleccionada y todos sus descendientes no archivados mediante un recorrido iterativo. Funciona igual desde una principal o desde una subcategoría intermedia. Un ID de otra tienda o de una categoría archivada devuelve un conjunto vacío. El listado privado de categorías puede filtrar por padre inmediato o sólo principales.

El menú público presenta una categoría sólo cuando ella y todos sus ancestros están activos y presentes. Ocultar un nivel intermedio oculta su rama completa del menú. Desactivar una categoría no desactiva sus productos: éstos pueden seguir apareciendo en el catálogo general cuando estén activos. La baja de un padre con hijos está bloqueada para evitar dejar una jerarquía sin referencia.

`CategoryTree` comparte recorridos iterativos entre el cliente privado y la tienda: `trail()` y `label()` construyen rutas completas, `branchIds()` obtiene descendientes y `rows()` produce un listado con `depth`, `parentPath` y `categoryPath`. `assignableParents(id)` permite cualquier contenedora fuera del propio subárbol. Los formularios usan esas rutas para asignar productos y mover categorías; ninguna pantalla interpreta que una subcategoría deba ser una hoja.

## Autenticación y sesiones

### Administrador

El acceso inicial está en `/root/login`. La cuenta usa bcrypt real. Después del primer inicio de sesión, las demás operaciones administrativas quedan bloqueadas hasta completar el cambio de contraseña en `/root/change-password`. La contraseña nueva debe ser distinta, tener al menos 12 caracteres y no exceder 72 bytes, que es el límite utilizado para bcrypt.

Cambiar la contraseña elimina las sesiones previas de esa cuenta y crea una sesión nueva. Modificar `ROOT_PASSWORD` en el archivo de entorno no reemplaza una contraseña ya almacenada: las variables sólo sirven para crear la cuenta inicial.

### Vendedores

El vendedor solicita acceso con su correo. El servidor genera un token aleatorio de 256 bits, guarda únicamente su hash SHA-256 y envía el enlace por SMTP. El tiempo permitido se toma de `Settings.magicLinkMinutes`. No se imprime el enlace en consola ni se devuelve en la respuesta de la API.

El token se consume mediante una actualización condicionada: debe existir, no estar utilizado y no haber vencido. La fecha de vencimiento se comprueba al consumir; no se depende de que el índice TTL de MongoDB ya haya eliminado el registro. El cliente usa una petición POST para completar el acceso.

Al primer acceso verificado se crea el vendedor, cuando todavía no existe, y se asigna su período de prueba. Esto también se aplica a una cuenta que el administrador haya creado previamente sin iniciar su prueba. Se genera una tienda inicial en borrador. El correo debe poder recibir mensajes y el servidor SMTP debe estar configurado; no hay contraseñas de vendedor ni mecanismos alternativos que eludan esa verificación.

### Cookie y CSRF

La sesión usa la cookie `mt_session`, HttpOnly y SameSite=Lax. Es Secure en producción o cuando `APP_URL` usa HTTPS. El token de sesión es aleatorio y sólo se persiste su hash. La sesión contiene un segundo token para CSRF: el cliente lo obtiene con `/auth/me` o al ingresar y lo envía en `X-CSRF-Token` para las mutaciones autenticadas.

Se comprueba el origen de peticiones del navegador y se limita la frecuencia de accesos y operaciones públicas. Los límites de Express residen en la memoria del proceso. Si en una evolución se ejecutan varios procesos API, deben reemplazarse por un almacenamiento compartido para conservar un límite global.

## Planes y prueba

`Settings.trialDays` vale 15 inicialmente y puede configurarse entre 0 y 365. Cambiarlo afecta a las pruebas que comiencen después de la modificación; no recalcula automáticamente las ya iniciadas. La prueba permite una tienda y no fija un máximo de productos.

Un vendedor tiene habilitación de publicación cuando está activo y tiene un plan asignado con `planExpiresAt` posterior al momento actual, o una prueba vigente. El plan prevalece cuando está vigente. Sus límites son `maxStores` y `maxProducts`; cero en `maxProducts` significa sin límite. Un plan desactivado se oculta de la contratación pública, pero una asignación vigente existente continúa funcionando hasta su vencimiento.

El vendedor puede continuar editando productos, diseño y configuración después de vencer su habilitación. No puede activar una tienda nueva y el catálogo/checkout públicos comprueban nuevamente el estado vigente del dueño. Por eso una tienda que conservó su bandera `active` no sigue vendiendo después del vencimiento.

La renovación suma días desde la fecha mayor entre el vencimiento anterior y el momento actual. El administrador también puede fijar una fecha ISO explícita. Al asignar o quitar un plan se desactivan las tiendas publicadas que exceden el límite o que quedan sin habilitación. La creación de tiendas adicionales corresponde al administrador.

Las altas adquieren una posición numérica de cuota guardada en el propio documento. MongoDB impone índices únicos parciales sobre tienda/producto y dueño/tienda. La publicación tiene otro índice único por dueño y posición, limitado a tiendas activas. Dos solicitudes que intenten ocupar la última posición no pueden confirmar ambas la escritura: una obtiene la posición y la otra recalcula o recibe el límite correspondiente. No depende de un mutex en memoria ni de un permiso temporal que pueda vencer mientras un proceso sigue trabajando. Las posiciones internas se asignan también a registros anteriores, al iniciar y antes de una operación que las necesite.

Al reducir `maxStores` en un plan o cambiar la asignación de un usuario se conservan todas sus tiendas y productos. Se desactivan las tiendas publicadas que excedan el máximo, priorizando las más antiguas por `createdAt` y luego `_id`. El catálogo y el checkout aplican el mismo orden en cada acceso, por lo que la expiración de un plan que vuelve a una prueba de una sola tienda tampoco deja publicadas varias tiendas de forma efectiva. Una ampliación posterior del plan no vuelve a publicar automáticamente una tienda desactivada: el dueño puede activarla desde su panel.

Los productos previamente aceptados se conservan aunque luego se reduzca `maxProducts`. La reducción impide nuevas altas mientras no haya capacidad. La creación relee la habilitación antes de publicar su resultado para detectar un cambio de plan intercalado; si el intento todavía no aceptado queda fuera de la cuota, lo archiva sin publicar y devuelve el error al formulario. El cambio de plan no borra contenido existente. La edición de usuario utiliza control de versión para evitar que dos renovaciones concurrentes se sobrescriban silenciosamente.

La distribución se ejecuta como un solo proceso PM2 en modo fork, porque el navegador de WhatsApp y los límites de solicitudes en memoria tienen ese alcance. La exclusión de posiciones y el stock condicional se apoyan en índices y escrituras de MongoDB, y no en el número de procesos; esto no convierte automáticamente al conjunto de integraciones en un despliegue distribuido. No deben omitirse los índices, escribir documentos manualmente para eludir las cuotas ni compartir el perfil de WhatsApp entre instancias.

## Stock y consistencia de pedidos sin replica set

La aplicación no requiere transacciones MongoDB ni replica set. Reserva el stock de cada producto con una sola actualización condicional de documento: comprueba disponibilidad, descuenta unidades, agrega la reserva del pedido y aumenta `stockVersion`. Si dos compradores compiten por las últimas unidades, la condición de stock evita cantidades negativas.

Un producto físico con variantes administra disponibilidad por variante. El stock general queda para productos sin variantes. Los productos digitales y los hechos a pedido no consumen stock. La edición habitual del producto conserva las cantidades existentes; la sección Stock ofrece asignaciones absolutas y exige el valor que la pantalla había leído (`expectedStock`) para detectar una venta o ajuste concurrente.

Desde v1.1.0, la validación de una edición parcial convierte los atributos de variantes de Map de Mongoose a objetos planos mediante `toObject({flattenMaps:true})`. Así puede validarse el producto completo sin exigir que el formulario reenvíe todos los atributos. Se conservan los pares color/talle y las cantidades existentes cuando se cambia otro campo.

Un ajuste masivo devuelve dos listas: filas aplicadas y filas con conflicto. Cada fila se procesa independientemente; no se revierte todo el lote si una fila cambió. La interfaz debe conservar los cambios exitosos y pedir revisión de los conflictos.

La creación de un pedido utiliza un estado interno `creating` y una clave de idempotencia única por tienda. El servidor combina líneas duplicadas, valida variantes y medios disponibles, y calcula importes desde los productos actuales. Repetir una clave con la misma compra recupera el resultado; utilizar la clave con otro contenido genera conflicto. Si falla la creación después de reservar algún producto, la cancelación libera las reservas ya aplicadas.

Los estados visibles son pendiente, esperando pago, en proceso, pagado y cancelado. Pagado y cancelado son finales. El servidor exige confirmación explícita y no permite reabrirlos. La entrega se administra por separado: pendiente, preparando, enviado o entregado. No se marca enviado/entregado antes de confirmar el cobro.

El trabajador revisa operaciones incompletas cada 30 segundos mientras el proceso está vivo. Repara creaciones abandonadas durante más de 10 minutos y efectos finales pendientes. Las reservas de Mercado Pago vencen según `ORDER_RESERVATION_MINUTES` —acotado entre 15 y 1440 minutos— y se consulta al proveedor antes de cancelarlas. Cuando esa consulta falla, conserva la reserva para reintentar. Efectivo y transferencia requieren resolución manual; no se cancelan por ese temporizador.

Las operaciones de varios documentos son recuperables mediante compensación, no una transacción global instantánea. Un cierre brusco puede dejar un breve estado intermedio hasta que vuelva a ejecutarse el trabajador. Conservar MongoDB, los archivos persistentes y las claves de cifrado es necesario para recuperar el funcionamiento.

## Términos y aceptación en pedidos

`TermsService.acceptance()` consulta el diseño persistido de la tienda. Los términos internos habilitados prevalecen sobre un enlace externo de `checkout.termsUrl`. Si cualquiera de esas opciones requiere aceptación, un pedido público nuevo debe enviar el booleano `termsAccepted: true`. Un valor de otro tipo o la falta de aceptación se rechazan antes de crear el pedido y antes de reservar stock. Los términos internos habilitados también necesitan título y contenido válidos.

El servidor crea `Order.termsAcceptance` con origen, obligatoriedad, decisión y, cuando corresponde, fecha del servidor, snapshot y hash SHA-256. El snapshot interno contiene título, introducción, contenido, URL y fecha de actualización configurada. Para un enlace externo se registran sólo la URL y etiqueta conocidas; el servidor no descarga ni calcula el hash del texto remoto. El hash corresponde a `{source,snapshot}`, excluyendo la fecha de aceptación, y queda unido al pedido aunque luego cambie la página de términos.

Los pedidos manuales usan `source: manual` y `accepted: false`; el vendedor no acepta en nombre del comprador. Cuando no hay términos obligatorios se usa `source: none`. Las órdenes anteriores pueden no tener ese campo. La representación habitual de la API muestra el resumen de aceptación y su hash; el texto completo del snapshot se conserva en MongoDB.

La búsqueda de un intento idempotente existente ocurre antes de generar una aceptación nueva. El hash de la solicitud comercial combina datos normalizados del comprador, entrega, pago y líneas, y excluye `termsAccepted`. Reenviar la misma compra con la misma clave devuelve su aceptación original, aunque los términos hayan cambiado o la casilla no vuelva a enviarse. Una clave reutilizada con otra compra provoca conflicto; una creación en proceso pide reintentar y una cancelada exige una clave nueva. El endpoint público mantiene sus controles de disponibilidad de tienda y plan.

`safePublicStore()` reemplaza los términos desactivados por los valores iniciales del bloque. Así, guardar un borrador privado no lo publica en el catálogo. El editor puede visualizarlo mediante las rutas autenticadas. La página pública es `/t/:slug/terminos`; la navegación a esa página no crea una aceptación por sí sola.

## Cobros y entrega digital

Cada tienda configura sus medios de pago y entregas. `deliveryIds` limita las entregas aceptadas por un medio de pago. Los datos bancarios se guardan en la tienda y se copian al pedido. Subir un comprobante no marca el pedido como pagado: el vendedor lo revisa y confirma manualmente.

Para Mercado Pago, los secretos se cifran mediante AES-256-GCM usando `ENCRYPTION_KEY`. La API del panel devuelve indicadores de configuración, nunca los valores en claro. La aplicación crea una preferencia de Checkout Pro con referencias al pedido y tienda. El retorno del navegador no aprueba pagos; la API consulta a Mercado Pago y compara importe, moneda, referencias y cuenta receptora. Los Webhooks deben incluir una firma válida. Si llega un pago aprobado después de una cancelación final, se registra una incidencia para revisar en Mercado Pago; no se reabre el pedido ni se entrega automáticamente el producto.

Los correos de pedido y de entrega digital usan documentos `MailJob` con una clave única y reintentos. El enlace digital se toma de la copia privada del producto guardada en el pedido y sólo se envía cuando está pagado. Un fallo de SMTP queda visible; el panel permite solicitar un nuevo intento. Se utiliza un Message-ID estable como ayuda contra duplicados.

La entrega de correo tiene semántica de reintento: si SMTP acepta un mensaje y el proceso se detiene antes de guardar el resultado, podría enviarse nuevamente. No se garantiza un único correo físico ante una interrupción en esa ventana. Los enlaces son URLs suministradas por el vendedor; esta versión no aloja archivos digitales ni genera enlaces de descarga firmados o con un número limitado de usos.

## Diseño, temas y experiencia pública

El contrato compartido en `client/src/services/design.js` es un módulo puro, sin dependencias de navegador ni Vue. Define `defaultDesign`, plantillas de secciones, bloques, diapositivas, enlaces de cabecera y redes sociales, enums, rangos y funciones de normalización. `storeCopy.js` comparte los textos iniciales y su interpolación segura. La API importa esas fuentes y aplica la validación de `api/src/utils/design.js` antes de persistir; ambas deben estar presentes en el despliegue además del cliente compilado.

El diseño contiene `brand`, `navbar`, `copy`, `wallpaper`, `shop`, `product`, `cart`, `checkout`, `terms` y el array `sections`. `normalizeDesign()` completa los campos nuevos de tiendas anteriores; conserva sus valores conocidos y el comportamiento previo del color principal oscuro cuando ese campo todavía no estaba almacenado. Un diseño anterior con logo y sin configuración de navbar mantiene la marca sin título adicional. Las plantillas no ejecutan HTML, JavaScript ni CSS aportados por el usuario: el contenido textual se renderiza como texto.

El límite total es de 160.000 caracteres serializados. Los títulos y subtítulos admiten 240 caracteres, el texto ordinario 4.000 y el contenido de términos 20.000. Se permiten hasta 8 diapositivas de portada, 12 secciones propias y 12 complementos por sección, con un único nivel de anidamiento. Los identificadores son únicos en cada lista. Las secciones se ordenan dentro de dos ubicaciones, antes o después del catálogo, y los botones apuntan a destinos predefinidos de la tienda.

`sectionSpacing()` conserva el cero y aplica los límites 0–160 px. El máximo habitual del contenido es 1280 px, con una opción de ancho completo por área. Las reglas móviles reducen los espacios excesivos y conservan el borde a borde cuando se elige cero. Las variantes de portada, catálogo, tarjetas, producto, carrito y checkout utilizan los mismos campos que edita el panel. Las validaciones de datos necesarios para comprar siguen en la API, independientemente de la presentación elegida.

### Cabecera, textos y navegación

La cabecera configurable usa `navbar`: altura y caja de logo independientes para escritorio y celular, espaciado, posición fija opcional, forma del logo, alineación y una lista de hasta doce enlaces. `useStoreName: false` con `title: ''` permite dejar únicamente el logo; `showTitle: false` también oculta el texto. El nombre administrativo obligatorio se conserva como identificación de la tienda y nombre accesible. El tamaño visual del logo se ajusta al espacio disponible sin desbordar la cabecera móvil.

Los enlaces apuntan a destinos conocidos: inicio, catálogo, destacados, contacto, términos, primera sección social o un ID de sección. El cliente omite los destinos deshabilitados o ausentes y mantiene el acceso al carrito. `shop.categoryNavigation` selecciona chips, árbol en navbar, panel desplegable, selector compacto o barra lateral; el árbol lateral pasa a desplegable en móvil. Estas variantes reutilizan la misma jerarquía y filtro de catálogo.

`copy` es un objeto plano de textos por tienda. `StoreCopy` conserva cadenas vacías explícitas e interpola valores conocidos, como `{count}` o `{storeName}`, sin interpretar código. Los títulos ya existentes mantienen sus campos originales; los errores de validación, estados financieros y avisos del sistema no son textos arbitrarios del vendedor. La dirección `brand.textDirection` se hereda y puede cambiarse por área; alineación izquierda/centro/derecha y dirección `ltr`/`rtl`/`auto` se configuran por separado.

Las secciones predefinidas incluyen `social`, con hasta doce `socialLinks`, presentación `labels`/`icons`/`cards`, tamaño de iconos y opción de pestaña nueva. Cada enlace identifica red, etiqueta, URL y visibilidad. El servidor valida HTTP/HTTPS sin credenciales y exige URL a cada enlace habilitado dentro de una sección visible. Una red social se abre como enlace; esta sección no publica contenido ni conecta una cuenta externa.

### Apariencia separada por tienda

`ThemeService` mantiene la apariencia del panel y de la plataforma con la clave `mty:appearance`. `StoreThemeService` mantiene la elección del visitante para cada tienda con `mty:store-appearance:<identificador>` y un sufijo `:preview` para el editor. Cambiar la tienda no reutiliza por accidente la preferencia de otra, y cambiar la apariencia del panel no impone una preferencia a los compradores.

La precedencia de la tienda es: preferencia del visitante si está habilitada, modo inicial `light`/`dark` si está fijado y, para `system`, apariencia del dispositivo. `allowThemeToggle` funciona con cualquiera de los modos iniciales. `designStyle()` genera variables CSS usando la paleta clara u oscura elegida. El servicio atiende cambios del dispositivo y del almacenamiento, y el selector continúa funcionando en memoria cuando el navegador bloquea la persistencia.

La vista previa tiene su propio estado de apariencia. Si el editor cambia `colorMode` o `allowThemeToggle`, se limpia esa preferencia de preview para mostrar el nuevo modo inicial. El selector dentro del iframe no modifica el borrador de diseño ni la preferencia pública del comprador.

### Vista previa y sincronización

`DesignView` conserva el alto disponible bajo la navbar fija del panel. Los controles y la tienda tienen desplazamiento independiente; un `ResizeObserver` mide ancho y alto reales y calcula el tamaño y escala del iframe. La vista móvil mantiene ambos paneles dentro de ese espacio, con la tienda arriba y los controles debajo.

El iframe abre `/t/:slug?preview=:storeId` o una página de compra de esa tienda. `StoreLayout` recupera los datos por los endpoints privados de la tienda; la query `preview` por sí sola no concede acceso. Se conserva la validación de sesión y dueño o administrador. Cambiar sólo entre páginas de la misma tienda no vuelve a cargar todo el contexto.

La comunicación usa `postMessage` y el contrato de `previewProtocol.js`:

| Mensaje | Dirección | Propósito |
| --- | --- | --- |
| `MTY_PREVIEW_READY` | Tienda → editor | Indicar que el contexto está listo y comunicar la página actual. |
| `MTY_DESIGN_PREVIEW` | Editor → tienda | Aplicar el borrador y, opcionalmente, `general.name`/`general.description` y un carrito de muestra. |
| `MTY_PREVIEW_NAVIGATE` | Editor → tienda | Pedir una página conocida con un `navigationId`. |
| `MTY_PREVIEW_LOCATION` | Tienda → editor | Informar navegación, incluidos atrás/adelante, y confirmar una orden de navegación cuando corresponde. |

Ambos lados comprueban origen exacto, ventana esperada y `storeId`. Las órdenes admiten sólo tienda, producto, carrito, checkout y términos dentro del slug actual. Los ACK no recargan el iframe ni reemplazan cambios de pestaña más recientes. Una respuesta redundante de la portada conserva los controles de Identidad o Secciones; navegar realmente a otra página selecciona sus controles. El slug de preview sigue siendo el guardado mientras se edita una dirección nueva.

El carrito de preview está separado del carrito público. El checkout comparte la validación de datos y términos con el flujo de interfaz habitual y muestra errores antes de su aviso informativo, pero no crea pedidos, reserva stock ni registra una aceptación. El formulario de contacto en preview tampoco envía correo.

### Guardado global y salida del editor

El borrador mantiene snapshots separados de diseño y datos generales (`name`, `slug`, `description`). La condición de cambios pendientes incluye las cargas de imágenes en curso. **Guardar cambios** espera esas cargas, valida el contenido y ejecuta primero el PUT de diseño modificado y luego el PUT de datos generales modificados. Son solicitudes independientes, no una transacción global.

Cada operación exitosa actualiza sólo el snapshot que envió. Si la segunda falla, el diseño guardado se conserva, el mensaje explica el resultado parcial y el resto sigue pendiente. Un cambio realizado mientras el servidor responde permanece en el borrador y no se sustituye por una respuesta antigua. La tienda de la navbar y la dirección del iframe se actualizan después de una respuesta correcta de datos generales.

El guard de ruta y `workspace.ensureWorkspaceCanLeave()` comparten el diálogo ternario. Guardar espera el resultado y sólo permite continuar si ya no hay cambios pendientes. Descartar aborta las cargas y restaura los snapshots; el control de generación impide aplicar una respuesta de upload tardía. Seguir editando cancela la navegación. El cierre de sesión consulta ese guard antes de invalidar la sesión, para que un guardado autorizado todavía pueda completarse.

El servicio de confirmación conserva la API booleana anterior y agrega decisiones explícitas `save`, `discard` y `cancel`. `beforeunload` se registra únicamente cuando hay cambios, cargas o guardado; solicita el aviso genérico del navegador. No garantiza que el navegador emita ese evento al cerrar una aplicación móvil y no constituye guardado automático del borrador.

### Productos destacados

`Product.featured` es un booleano independiente del estado de publicación del producto y comienza en `false`. La API permite editarlo en el formulario completo o mediante un PUT que contiene sólo `{featured}`. Este último caso realiza una actualización atómica del campo e incrementa `stockVersion` para que una edición completa previamente leída detecte el cambio. No reemplaza stock, variantes ni reservas; una compra concurrente puede reservar unidades sin que el marcado revierta su descuento.

`CatalogService.catalog()` devuelve `featuredProducts` como colección adicional de hasta 12 productos de la tienda, activos, no archivados y marcados. Se consulta de forma independiente de la página, búsqueda, categoría, orden y filtro `featured` del listado `products`. Tiene orden estable por fecha de creación e identificador descendentes. `data.meta` describe únicamente la consulta paginada de `products`.

La respuesta de cada producto público incluye `featured`; los destacados utilizan la misma selección de campos que el catálogo normal y no revelan URLs digitales ni datos privados. La disponibilidad de tienda y plan se comprueba antes de consultar ambas colecciones. `shop.showFeatured` y `shop.featuredTitle` controlan la presentación del bloque sin modificar la selección almacenada en cada producto.

Las recomendaciones se calculan dentro de cada tienda. Priorizan productos presentes en pedidos pagados junto a los seleccionados; después utilizan relaciones manuales y productos de las categorías correspondientes. Se excluyen los productos ya seleccionados y los inactivos. No se comparten historiales de compradores ni asociaciones entre tiendas.

El carrito se mantiene en el navegador por tienda. El precio que pueda mostrar ese estado local no es autoridad de cobro: la API recalcula la orden y rechaza productos o cantidades que ya no estén disponibles.

## Archivos, PWA y despliegue

Las imágenes se reciben por `POST /stores/:storeId/uploads`, en multipart `files` y con `purpose`. Una carga genérica (`image`, valor predeterminado) acepta de una a cinco imágenes y las reduce dentro de 2000 × 2000 px sin ampliarlas. Los fondos admiten un archivo por solicitud, dimensiones enteras positivas y hasta 25.000.000 de píxeles después de aplicar la orientación. No hay un mínimo de resolución ni una proporción obligatoria. Las siguientes medidas son recomendaciones de composición:

| Propósito | Resolución recomendada |
| --- | --- |
| `wallpaper-desktop` | 1920 × 1080 px. |
| `wallpaper-mobile` | 1080 × 1920 px. |
| `wallpaper-shared` | 1920 × 1920 px. |

El límite es de 5 MiB por archivo de entrada y por resultado procesado. `ImageService` usa Sharp para comprobar que el contenido sea una imagen estática JPG, PNG o WebP y aplicar orientación. Los fondos conservan sus dimensiones reales y normalmente se convierten a WebP. Cuando un eje supera los 16.383 píxeles admitidos por ese codificador, se guarda PNG para aceptar panoramas válidos dentro del límite de 25 megapíxeles. El editor comprueba también tipo, peso y dimensiones antes de enviar, pero la validación del servidor es independiente.

Cada archivo recibe un nombre propio y un registro `UploadedImage` con tienda, usuario que lo subió, propósito, dimensiones, tamaño y hash de contenido. Al guardar un diseño se revalidan todos sus fondos no vacíos, incluso los deshabilitados: el archivo debe pertenecer a esa tienda y propósito, existir como archivo local, mantener las dimensiones de su propio registro y coincidir con el hash guardado. No se lo compara con la resolución recomendada. El servidor no descarga fondos remotos ni admite reutilizar como fondo una carga genérica sin ese propósito.

Para activar `responsive` se necesitan imágenes de escritorio y celular; para activar `shared`, la imagen compartida, sin exigir que sea cuadrada. La presentación `cover` puede recortar según la pantalla, por lo que una imagen compartida no garantiza mostrar todos sus bordes. Las imágenes cargadas sirven como archivos estáticos públicos; el acceso privado se reserva para los comprobantes. Los SVG de demostración incluidos son assets propios y no pasan por el cargador de usuarios.

Los comprobantes tienen validación de contenido y límite de 8 MiB. Se guardan fuera de la ruta estática pública. El endpoint de descarga exige una sesión autorizada para la tienda. El comprador sólo puede adjuntar un comprobante si conoce el token privado de su pedido.

El manifiesto, los iconos y el service worker proporcionan la base PWA. El service worker usa un caché versionado, elimina cachés de versiones anteriores y excluye `/api/` y `/uploads/`. Guarda assets de interfaz e iconos; ante una navegación sin conexión muestra la página offline. Los pedidos, los pagos y el acceso a la API requieren conexión; no se encolan compras para ejecutarlas sin conexión. Antes de publicar, se necesita HTTPS para instalación PWA y para las integraciones externas.

MongoDB, la carpeta de imágenes/comprobantes, la carpeta de autenticación de WhatsApp y el archivo de entorno deben conservarse entre despliegues. Una copia sólo del código no es un respaldo de los datos. La configuración PM2 entregada está pensada para una instancia en modo fork: una misma sesión de WhatsApp no debe abrirse desde varios navegadores que compitan por el mismo perfil.

## Demostración optativa

`npm run seed:demo` carga Feria Estudio y seis productos ilustrativos, con categorías principales, subcategorías y destacados. Se ejecuta sólo por solicitud explícita del operador y no forma parte del inicio normal. No crea planes con precios inventados ni testimonios comerciales. Las categorías nuevas pasan por `CategoryService.create()` y el script conserva las que ya existen.

`DEMO_EMAIL` define el correo del vendedor. Si no se configura, se usa `demo@example.com`, que es sólo un marcador de ejemplo. Para ingresar de verdad hay que usar una dirección propia y tener SMTP funcionando. El script no envía un mensaje automáticamente, no imprime tokens y no establece contraseñas de vendedor. Conserva registros de demostración existentes y no renueva su prueba al repetirse. El producto digital apunta a example.com para demostrar la configuración: debe reemplazarse por un recurso real antes de vender.

## Verificación

Las pruebas automatizadas del servidor están en `api/test` y las del cliente en `client/test`. Las de API usan MongoDB temporal standalone con `mongodb-memory-server`. Los proveedores externos se sustituyen únicamente dentro de las pruebas; una ejecución normal no simula pagos aprobados, correos entregados ni conexiones de WhatsApp.

`api/test/version12.test.js` contiene casos del contrato ampliado, fondos, auditoría y aceptación de términos, incluidos reintentos idempotentes. Se mantienen las suites de seguridad, cuotas, jerarquía de categorías y comercio. En el cliente, `designerState.test.js` ejecuta el setup real del diseñador con fronteras en memoria para revisar guardado parcial, cambios durante una solicitud, cargas, descarte y sincronización. Otras suites cubren validación de checkout, temas separados, mensajes de preview, reproducción de carruseles y compatibilidad de confirmaciones.

`npm test` ejecuta las suites de ambos workspaces y `npm run build` compila el cliente. Esta descripción de cobertura no sustituye un resultado de ejecución: los resultados y límites de la verificación realizada se registran en `PRUEBAS.md`, sin mantener aquí cifras de una versión anterior. La configuración de proveedores está en `INTEGRACIONES.md` y la referencia de rutas en `API.md`.

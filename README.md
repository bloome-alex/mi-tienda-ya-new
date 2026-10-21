# mi-tienda-ya-2 · v1.3.0

Plataforma para crear y administrar tiendas online, con panel de administrador, panel de vendedor, catálogo público, carrito, checkout y editor de diseño. La versión **1.3.0** usa **Vue 3.5.44 y CSS propio**, JavaScript, Node.js, Express y MongoDB standalone. La API está organizada mediante **Programación Orientada a Objetos**, con servicios para autenticación, permisos, cuotas, inventario, pedidos y proveedores externos.

El proyecto tiene dos workspaces npm, `api` y `client`. Vue Router resuelve la navegación y Vite compila el cliente. Se respetó el pedido de usar Vue con estilos propios: no se incorporó Vuetify, Bootstrap ni otro framework visual.

La distribución incluye código fuente, `package-lock.json`, configuración de ejemplo, cliente compilado en `client/dist`, pruebas, documentación y opciones de despliegue con PM2 o Docker Compose. No incluye `node_modules`, credenciales reales, bases de datos ni archivos de clientes.

## Qué incluye

- Un único administrador, creado desde las variables de entorno, con cambio de contraseña obligatorio en el primer ingreso y almacenamiento mediante bcrypt real.
- Acceso de vendedores por enlaces de correo de un solo uso, duración configurable, prueba inicial y asignación/renovación de planes.
- Paneles con tablas, formularios en páginas propias, notificaciones y confirmaciones. El panel privado mantiene navbar y menú lateral fijos; el selector de tienda está en la barra superior junto al estado de publicación. En móvil ocupa una segunda fila y el menú lateral se abre con su botón.
- Home público de la plataforma con navbar y sin menú lateral. Cabecera propia de cada tienda con título opcional, logo y alturas por dispositivo, enlaces configurables y navegación de categorías.
- Textos editables agrupados y buscables, con alineación y dirección de lectura por zona. Secciones de redes con iconos, nombres o tarjetas y selección de perfiles visibles.
- Apariencia inicial en negro, blanco y grises, con modo claro/oscuro desde la navbar. La preferencia se conserva en el navegador; inicialmente sigue la apariencia del dispositivo.
- Administración de usuarios, tiendas, planes, página de inicio y contacto de la plataforma. Auditoría en español, con filtros, página de detalle y cambios antes/después cuando fueron registrados.
- Productos físicos y digitales, hasta cinco fotos, variantes, productos relacionados, fabricación a pedido e inventario con ajustes absolutos.
- Categorías y subcategorías multinivel, con tabla jerárquica, movimiento de ramas, filtros que incluyen todos los descendientes y cinco presentaciones públicas de navegación.
- Productos destacados desde su formulario o directamente desde la tabla, con filtro y guardado individual. La tienda muestra una sección configurable con hasta 12 destacados activos, independiente de los filtros y la paginación del catálogo.
- Pedidos manuales y de la tienda, estados finales, seguimiento privado, entrega, comprobantes bancarios y Mercado Pago Checkout Pro.
- Diseño de **tienda, producto, carrito y checkout**, más identidad de marca, con vista previa de escritorio y móvil. Los controles y la tienda tienen desplazamiento independiente; navegar en la vista previa selecciona los controles correspondientes y elegir una sección abre esa página, conservando el borrador.
- Paletas claras/oscuras por tienda, fondos de resolución flexible hasta 25 MP y 5 MiB, cinco portadas, tarjetas con efectos opcionales y carruseles configurables. Siete secciones predefinidas, incluidas redes sociales, con orden, visibilidad y espaciado propio.
- Términos propios por tienda, validaciones de checkout con notificaciones rojas y protección de cambios con Guardar, Descartar o Seguir editando.
- Recomendaciones a partir de compras conjuntas, relaciones manuales y categorías de la misma tienda.
- SMTP, conexión de WhatsApp por QR con `whatsapp-web.js`, contacto por `wa.me` y PWA con pantalla sin conexión.

La [matriz de funcionalidades](docs/FUNCIONALIDADES.md) detalla todos los campos y el alcance efectivo de cada función. [Cambios de la versión 1.3.0](docs/CAMBIOS-1.3.0.md) describe las novedades y cómo actualizar una instalación conservando su configuración y sus datos. El [manual del diseñador](docs/DISENO.md) explica las variantes, los fondos, los espaciados y las secciones.

## 1. Preparar el entorno

Requisitos:

- **Node.js 24 recomendado**, con npm. El mínimo declarado por el proyecto es Node.js 22.12.
- **MongoDB 8 recomendado**, accesible desde la API. Puede ser standalone; no requiere replica set.
- Un servidor SMTP para enviar enlaces de acceso y correos de pedidos.
- Chromium/Puppeteer cuando se utilice la conexión de WhatsApp. El resto de la aplicación puede iniciarse sin abrir ese navegador.

Desde la carpeta extraída del ZIP:

```bash
cd mi-tienda-ya-2
cp .env.example .env
npm ci
```

En Windows podés copiar `.env.example` a `.env` desde el explorador o con `Copy-Item .env.example .env` en PowerShell. Los ejemplos de asignación de variables delante de un comando utilizan sintaxis de terminal POSIX.

Si vas a instalar Chromium por separado, omití su descarga durante la instalación con `PUPPETEER_SKIP_DOWNLOAD=true npm ci`. Una variable escrita en `.env` no se aplica automáticamente al proceso `npm ci`. La [guía de despliegue](docs/DESPLIEGUE.md) explica ambas opciones.

### Variables necesarias

Completá el archivo `.env`; contiene comentarios para cada opción.

| Variable | Configuración |
| --- | --- |
| `MONGODB_URI` | Conexión con tu base; por ejemplo, `mongodb://127.0.0.1:27017/mi_tienda_ya_2` en una instalación local. |
| `ROOT_USER` | Usuario del único administrador inicial. |
| `ROOT_PASSWORD` | Contraseña inicial propia: al menos 12 caracteres y como máximo 72 bytes. Se cambiará en el primer acceso. |
| `ENCRYPTION_KEY` | Clave aleatoria de exactamente 64 caracteres hexadecimales. Protege credenciales de cobro y tokens persistidos que deben poder recuperarse. |
| `SESSION_SECRET` | Secreto aleatorio independiente recomendado. Si queda vacío, se utiliza `ENCRYPTION_KEY`. |
| `APP_URL` | Origen público de la aplicación, sin rutas ni barra final. Debe coincidir con la dirección que abre el usuario; también se usa en enlaces de correo y retornos de pago. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Servidor de correo. Habitualmente, puerto 587 con `false` para STARTTLS o 465 con `true`. |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Credenciales y remitente autorizado por tu proveedor de correo. |
| `WHATSAPP_CLIENT_ID` | Identificador exclusivo de esta instalación, por ejemplo `mi-tienda-ya-2-produccion`. |

Para generar cada secreto, ejecutá el siguiente comando y copiá su salida en la variable correspondiente. Ejecutalo nuevamente para obtener la segunda clave:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardá estas claves junto con el respaldo de los datos. Cambiar `ENCRYPTION_KEY` sin migrar los datos cifrados impide recuperar los secretos ya almacenados.

### Elegir la URL correcta

| Modo | `NODE_ENV` | `APP_URL` | Comando |
| --- | --- | --- | --- |
| Desarrollo, Vue y API con recarga | `development` | `http://localhost:5173` | `npm run dev` |
| Cliente compilado y API en un proceso local | `development` | `http://localhost:5000` | `npm run build`, después `npm start` |
| Servidor público detrás de HTTPS | `production` | `https://tu-dominio.com` | Compilar y ejecutar con PM2 o Docker Compose. |

`PORT` vale 5000 y `CLIENT_PORT` vale 5173 de forma predeterminada. Para probar la compilación sobre HTTP local, conservá `NODE_ENV=development`. En producción el arranque exige una `APP_URL` con HTTPS.

## 2. Ejecutar la aplicación

### Desarrollo

```bash
npm run dev
```

Abrí [http://localhost:5173](http://localhost:5173). El comando inicia la API y Vite; el servidor de desarrollo deriva `/api` y `/uploads` a Express.

### Compilación y ejecución en un proceso

Después de configurar `APP_URL=http://localhost:5000` para una prueba local:

```bash
npm run build
npm start
```

Abrí [http://localhost:5000](http://localhost:5000). Express sirve la API y `client/dist`. Aunque el ZIP contiene una compilación, el comando de build permite regenerarla después de editar el cliente.

## 3. Configurar la primera tienda

1. **Administrador.** Entrá a `/root/login` con `ROOT_USER` y `ROOT_PASSWORD`. Completá el cambio obligatorio de contraseña. Sólo existe un administrador; las demás cuentas son vendedores.
2. **Reglas de la plataforma.** En Configuración → General, definí días de prueba y minutos de vigencia del enlace. En Contacto y Página de inicio, cargá los datos reales de soporte, portada, beneficios, testimonios y preguntas frecuentes.
3. **Planes.** Creá los planes con nombre, ícono, precios, funcionalidades y límites. Su asignación y renovación se administran desde Usuarios. Los planes publicados son informativos: esta versión no realiza una suscripción automática para cobrarle al vendedor.
4. **Vendedor.** Con SMTP configurado, solicitá un enlace en `/login` usando un correo que controles. El primer acceso verificado inicia la prueba y genera una tienda inicial en borrador. El administrador también puede crear vendedores y asignarles un plan.
5. **Tienda.** En Tiendas, el administrador puede crear y asignar tiendas a vendedores, dentro de sus límites. Elegí la tienda en el panel y completá su nombre, dirección pública y descripción. La tienda inicial permite empezar sin una asignación manual adicional.
6. **Cobros, entrega y contacto.** Configurá primero las formas de entrega y después los medios de pago compatibles. Completá los datos bancarios reales o las credenciales de Mercado Pago. Indicá correo, teléfono, WhatsApp y mensaje inicial del negocio.
7. **Catálogo.** Creá categorías principales y, si hace falta, subcategorías. En cada producto elegí la principal y una subcategoría opcional; definí fotos, precios, variantes, stock inicial, fabricación a pedido y relaciones. Marcá tus elegidos como destacados desde la ficha o con el botón de su fila en Productos. Para productos digitales cargá la URL que recibirá el comprador después del pago. Los cambios posteriores de cantidades se hacen desde Stock.
8. **Diseño.** Ajustá Identidad, Tienda, Producto, Carrito y Checkout; agregá contenido propio desde Secciones y escribí las condiciones desde Términos. Elegí el modo inicial y si permitís cambiarlo al cliente; configurá paletas, fondos, variantes, imágenes, espaciados y visibilidad. Recorré la vista previa: abrir un producto, el carrito, el checkout o los términos cambia también los controles del editor. Elegir una página en el editor navega la vista previa sin perder el borrador. Revisá escritorio y móvil y pulsá **Guardar cambios**.
9. **Publicación.** Activá la tienda desde Diseño o su configuración. La API comprueba que el vendedor esté activo, tenga prueba o plan vigente y disponga de cupo. Abrí su ruta `/t/slug` y recorré una compra de prueba con los medios configurados.

El diseñador mantiene su área de trabajo debajo de la navbar: podés desplazar los controles sin perder la vista de la tienda y recorrer la tienda dentro del marco. En pantallas pequeñas, la vista previa queda arriba y los controles debajo. En **Diseño → Identidad**, elegí el modo inicial y habilitá ambos modos si querés que el cliente pueda cambiarlos. La selección se guarda por tienda, separada del panel; se pueden definir paletas distintas para claro y oscuro.

La prueba inicial dura **15 días** de forma predeterminada; el administrador puede configurar entre 0 y 365 días. El cambio se aplica a nuevas pruebas. La vigencia inicial del enlace es de 15 minutos, configurable entre 1 y 1440 minutos.

Al vencer la prueba o el plan, el vendedor conserva el acceso a su panel y puede editar su contenido. La tienda pública y el checkout quedan sujetos a una habilitación vigente. Reducir el cupo de tiendas desactiva las publicaciones excedentes conservando su contenido; ampliar el plan después no las publica automáticamente.

## 4. Direcciones principales

Todas las rutas son relativas a `APP_URL`.

| Dirección | Uso |
| --- | --- |
| `/` | Página de presentación configurable de la plataforma. |
| `/login` | Solicitar un enlace de acceso para vendedor. |
| `/auth/verify?token=...` | Confirmar el enlace recibido por correo. |
| `/root/login` | Acceso del administrador. |
| `/root/change-password` | Cambio inicial obligatorio de contraseña. |
| `/app/dashboard` | Resumen correspondiente al rol. |
| `/app/users`, `/app/stores`, `/app/settings`, `/app/audit` | Administración de la plataforma. |
| `/app/products`, `/app/categories`, `/app/stock`, `/app/orders` | Gestión del catálogo, inventario y pedidos. |
| `/app/payments`, `/app/contact`, `/app/plan`, `/app/design` | Cobros/entrega, contacto, plan y diseño. |
| `/t/:slug` | Tienda pública. |
| `/t/:slug/producto/:id` | Detalle de producto. |
| `/t/:slug/carrito`, `/t/:slug/checkout` | Carrito y pasos de compra. |
| `/t/:slug/terminos` | Condiciones propias de la tienda, si se habilitaron. |
| `/app/audit/:id` | Detalle de auditoría con contexto y cambios registrados. |
| `/pedido/:id?token=...` | Seguimiento privado del pedido. |
| `/api/health` | Estado de la API y conexión con MongoDB. |

## 5. Demostración optativa

La instalación normal no agrega precios comerciales ni testimonios inventados. Podés cargar el catálogo ilustrativo de **Feria Estudio** de forma explícita.

**Ejecutá la carga con la API detenida y MongoDB en ejecución.** El script realiza la inicialización de la aplicación, incluida la preparación de la jerarquía de categorías. Si estás usando `npm run dev`, detené ese comando antes de cargar; con PM2, usá `pm2 stop mi-tienda-ya-2`. Después de finalizar el script, iniciá la aplicación otra vez con el método habitual. Desde la carpeta del proyecto:

```bash
DEMO_EMAIL=tu-correo@tu-dominio.com npm run seed:demo
```

También podés agregar `DEMO_EMAIL` a `.env` y ejecutar `npm run seed:demo`. Usá una dirección propia: si no la configurás, el marcador predeterminado es `demo@example.com`, que no permite recibir tus enlaces de acceso.

El script crea un vendedor en prueba y una tienda con slug `feria-estudio`, accesible en `/t/feria-estudio`. Incluye **tres categorías principales, tres subcategorías y seis productos** con ilustraciones SVG propias. Indumentaria contiene Remeras y Buzos; Accesorios contiene Bolsas de tela; Digital completa las principales. El catálogo presenta variantes, productos destacados, un producto hecho a pedido y un ejemplo digital, con una identidad neutra preparada para claro/oscuro.

La carga es idempotente: repetirla no duplica ese catálogo ni renueva la prueba; conserva los registros ya existentes. No crea contraseñas de vendedor ni envía correos automáticamente. Para ingresar, solicitá el enlace por el flujo normal de `/login`. No es necesario ejecutar este comando al actualizar una instalación existente.

Los datos bancarios y la URL digital de la demostración son ejemplos identificados como tales. Reemplazalos antes de recibir pedidos reales. El script respeta los límites vigentes y no reemplaza una tienda con el mismo slug que pertenezca a otra cuenta.

## 6. Integraciones y alcance operativo

**SMTP.** Envía los enlaces de acceso, notificaciones de pedidos, consultas del formulario y enlaces de productos digitales pagados. Los correos de pedidos tienen trabajos persistentes con reintentos. Una interrupción después de la aceptación del proveedor y antes de guardar el resultado puede repetir un mensaje; no se garantiza una única entrega física de correo en esa situación.

**Mercado Pago.** Cada tienda configura sus credenciales y secreto de Webhook desde Cobros y entrega. La API crea preferencias Checkout Pro y verifica los pagos consultando al proveedor. La URL de retorno del navegador no basta para marcar un pedido como pagado. Se necesitan cuenta, credenciales y un endpoint público HTTPS; la [guía de integraciones](docs/INTEGRACIONES.md) indica la configuración concreta.

**Transferencias y efectivo.** Se pueden limitar a determinadas formas de entrega. Un comprobante bancario adjunto queda disponible para el vendedor y el administrador; adjuntarlo no confirma el pago. El vendedor verifica el cobro y cambia el estado manualmente.

**WhatsApp.** La conexión de administración utiliza `whatsapp-web.js`, `LocalAuth`, un `WHATSAPP_CLIENT_ID` exclusivo y consultas periódicas del estado del QR. El navegador se inicia cuando se pulsa Conectar. El botón flotante de cada tienda abre un enlace `wa.me` con el mensaje elegido y funciona de manera independiente de esa sesión.

**PWA.** Incluye manifiesto, iconos, service worker, recursos estáticos cacheables y pantalla sin conexión. El catálogo actualizado, la administración, los pedidos y los pagos requieren Internet. No se guardan compras para ejecutarlas después sin conexión.

**Datos persistentes.** Conservá MongoDB, `UPLOAD_DIR`, `WHATSAPP_DATA_PATH` y las claves de entorno. Si las rutas de archivos se dejan vacías, se utilizan `api/data/uploads` y `api/data/whatsapp`. Las bajas lógicas preservan los datos históricos; los pedidos guardan una copia de los datos comprados.

## 7. Producción con un proceso PM2

Prepará `NODE_ENV=production`, una `APP_URL=https://...`, MongoDB, SMTP y un proxy HTTPS. Usá `TRUST_PROXY=1` sólo cuando exista exactamente un proxy inverso de confianza delante de Express. Con PM2 instalado:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

La configuración incluida usa **una instancia en modo `fork`**. El proceso sirve frontend y API e incluye el trabajador de pedidos/correos. No se necesita Vite en producción. El perfil de WhatsApp, los límites de peticiones en memoria y la recuperación inicial de la jerarquía de categorías están diseñados para esta ejecución única; no cambies a cluster ni inicies dos instancias contra la misma base.

Para consultar y reiniciar:

```bash
pm2 logs mi-tienda-ya-2
pm2 restart mi-tienda-ya-2 --update-env
```

Las cuotas y las reservas de stock se protegen mediante índices y escrituras condicionales de MongoDB. Las operaciones que afectan a varios documentos utilizan compensación y recuperación, sin exigir transacciones de replica set. El detalle de estas reglas está en [Arquitectura](docs/ARQUITECTURA.md).

También se incluyen `Dockerfile` y `compose.yaml`, con MongoDB autenticado, datos persistentes y Chromium opcional. Consultá [Despliegue](docs/DESPLIEGUE.md) para Nginx, HTTPS, Docker, permisos de archivos y respaldos. La imagen Docker no se ejecutó durante la preparación de esta entrega.

## 8. Comandos y organización

| Comando | Función |
| --- | --- |
| `npm ci` | Instalar las versiones del archivo de bloqueo de ambos workspaces. |
| `npm run dev` | Iniciar API y cliente en desarrollo. |
| `npm run build` | Compilar el cliente en `client/dist`. |
| `npm start` | Iniciar Express, conectar con MongoDB, iniciar los servicios y servir el cliente compilado. |
| `npm test` | Ejecutar pruebas de API y de lógica del cliente: carrito, categorías, apariencia y protocolo de la vista previa. |
| `npm run check` | Comprobar sintaxis de los archivos JavaScript incluidos por el script. |
| `npm run seed:demo` | Agregar de forma optativa Feria Estudio, con la API detenida y MongoDB en ejecución. |

| Ubicación | Contenido |
| --- | --- |
| `api/src/models` | Esquemas e índices MongoDB. |
| `api/src/services` | Servicios POO de negocio, cuotas, stock, autenticación e integraciones. |
| `api/src/routes`, `api/src/middleware` | Endpoints, validaciones, sesiones, CSRF y permisos. |
| `api/test` | Pruebas de reglas del negocio y API contra MongoDB temporal. |
| `client/src/views` | Páginas públicas, de administración y de vendedores. |
| `client/src/components`, `client/src/layouts` | Componentes comunes y estructuras visuales. |
| `client/src/services` | Cliente HTTP, autenticación, carrito, árbol de categorías, apariencia, protocolo de vista previa y contrato compartido de diseño. |
| `client/public` | PWA, iconos e ilustraciones propias del catálogo de demostración. |
| `client/test` | Pruebas de carrito, categorías, checkout, apariencia, reproducción, guardado del diseñador y navegación segura de la vista previa. |
| `scripts` | Desarrollo, comprobaciones, carga optativa e inicialización MongoDB para Docker. |
| `docs` | API, arquitectura, funcionalidades, despliegue, integraciones, validación y cambios de versión. |

## 9. Verificación de esta entrega

**134 pruebas aprobadas: 72 de API y 62 del cliente, sin fallos ni casos omitidos.** También se completaron la compilación de 156 módulos, la comprobación de sintaxis y 12 verificaciones de arranque con MongoDB temporal. El informe de [pruebas y revisión de v1.3.0](docs/PRUEBAS.md) documenta los resultados y la revisión visual de componentes con datos ficticios en escritorio y móvil.

En el primer `npm test`, `mongodb-memory-server` puede descargar el binario de MongoDB. Las pruebas utilizan una base temporal propia y requieren permiso para abrir puertos locales.

## Documentación

- [Cambios de la versión 1.3.0 y actualización de instalaciones existentes](docs/CAMBIOS-1.3.0.md).
- [Historial de cambios de la versión 1.2.0](docs/CAMBIOS-1.2.0.md).
- [Manual del diseñador, variantes, fondos y secciones](docs/DISENO.md).
- [Historial de cambios de la versión 1.1.0](docs/CAMBIOS-1.1.0.md).
- [Funcionalidades y límites de esta versión](docs/FUNCIONALIDADES.md).
- [Instalación, PM2, Docker, HTTPS y persistencia](docs/DESPLIEGUE.md).
- [Configuración de SMTP, Mercado Pago y WhatsApp](docs/INTEGRACIONES.md).
- [Arquitectura POO, sesiones, cuotas y consistencia](docs/ARQUITECTURA.md).
- [Referencia de API](docs/API.md).
- [Pruebas y recorrido de validación](docs/PRUEBAS.md).


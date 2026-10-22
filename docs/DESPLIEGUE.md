# Instalación y despliegue

El proyecto utiliza npm workspaces `api` y `client`. La API sigue una estructura de Programación Orientada a Objetos con servicios responsables de autenticación, stock, pedidos e integraciones. El frontend está hecho con Vue y CSS propio, y la base de datos es MongoDB.

En producción se ejecuta **un proceso Node.js**: Express sirve la API y los archivos compilados de Vue. No hace falta mantener un proceso Vite en producción.

## 1. Instalación local

Requisitos: Node.js 24 recomendado, npm y MongoDB 8 disponible. El motor soportado por el proyecto comienza en Node.js 22.12. No necesitás configurar un replica set.

Desde la carpeta del proyecto:

```bash
cp .env.example .env
npm ci
```

Generá una clave de cifrado:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copiá la salida en `ENCRYPTION_KEY`. Volvé a ejecutar el comando para obtener un valor independiente para `SESSION_SECRET`.

Completá al menos:

```dotenv
ROOT_USER=admin
ROOT_PASSWORD=TU_CONTRASENA_INICIAL_DE_AL_MENOS_12_CARACTERES
ENCRYPTION_KEY=TU_CLAVE_HEXADECIMAL_DE_64_CARACTERES
SESSION_SECRET=OTRA_CLAVE_ALEATORIA
MONGODB_URI=mongodb://127.0.0.1:27017/mi_tienda_ya_2
```

Los valores anteriores son indicaciones, no claves utilizables. `ENCRYPTION_KEY` debe contener exactamente 64 caracteres hexadecimales. La contraseña del administrador admite entre 12 caracteres y 72 bytes, por la utilización de bcrypt.

### Desarrollo: frontend y API juntos

```dotenv
NODE_ENV=development
PORT=5000
CLIENT_PORT=5173
APP_URL=http://localhost:5173
TRUST_PROXY=0
```

```bash
npm run dev
```

Abrí `http://localhost:5173`. El comando inicia Vue/Vite y la API, y Vite deriva `/api` al puerto 5000. `/uploads/images` queda como compatibilidad temporal para archivos locales anteriores a v1.8.0. Los enlaces de correo se generan con `APP_URL`, por lo que deben apuntar al puerto del frontend.

### Compilación y ejecución local con un proceso

Cambiá `APP_URL` a `http://localhost:5000`, conservando `NODE_ENV=development` para esta prueba HTTP local:

```bash
npm run build
npm start
```

Abrí `http://localhost:5000`. Express sirve tanto la aplicación como la API.

### Primer ingreso

1. Entrá a `/root/login`.
2. Usá el usuario y la contraseña inicial de `.env`.
3. Completá el cambio obligatorio de contraseña antes de administrar la plataforma.
4. Configurá planes, contacto, contenido de inicio y duración de prueba/enlaces.
5. Configurá SMTP antes de solicitar un acceso para vendedores.

El administrador inicial se crea sólo si la base no tiene uno. Después del cambio, modificar `ROOT_PASSWORD` no restablece la contraseña almacenada. Conservá configuradas las variables iniciales para la validación de arranque y guardá de forma segura la contraseña vigente.

## Cloudflare R2 antes de producción

Creá dos buckets: uno para assets públicos y otro para comprobantes privados. El dominio indicado en `R2_PUBLIC_URL` debe estar conectado sólo al bucket de assets. El bucket de comprobantes debe permanecer sin acceso público.

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ASSETS_BUCKET_NAME=mi-tienda-ya-assets
R2_RECEIPTS_BUCKET_NAME=mi-tienda-ya-receipts
R2_PUBLIC_URL=https://media.tu-dominio.com
R2_PREFIX=mi-tienda-ya-2
```

Si actualizás una instalación con archivos locales, detené la aplicación, respaldá MongoDB y `UPLOAD_DIR` y ejecutá `npm run migrate:r2` antes de volver a publicar.

## 2. Producción con PM2

Configurá el dominio público y un proxy inverso con HTTPS:

```dotenv
NODE_ENV=production
PORT=5000
APP_URL=https://tiendas.tu-dominio.com
TRUST_PROXY=1
WHATSAPP_CLIENT_ID=mi-tienda-ya-2-produccion
```

`TRUST_PROXY=1` supone exactamente un proxy de confianza delante de Express. El puerto 5000 debe estar restringido al proxy. Si tu infraestructura agrega más proxies, ajustá la configuración de red y el código de confianza de Express antes de utilizarla.

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

El archivo incluido usa una sola instancia en modo `fork`, sin vigilancia de archivos. Esto permite mantener un único perfil de WhatsApp y un único proceso visible en PM2. No lo cambies a cluster ni lo dupliques usando la misma sesión de WhatsApp.

Comandos habituales:

```bash
pm2 status
pm2 logs mi-tienda-ya-2
pm2 restart mi-tienda-ya-2 --update-env
```

Cuando actualices el proyecto, instalá sus dependencias y compilá antes de reiniciar:

```bash
npm ci
npm run build
pm2 restart mi-tienda-ya-2 --update-env
```

Conservá `.env`, la base MongoDB y `api/data`. No copies una configuración de prueba encima de los datos productivos.

### Usar otro archivo de variables

La aplicación admite `ENV_FILE`. Indicá una ruta absoluta:

```bash
ENV_FILE=/ruta/mi-tienda-ya-2/.env.produccion npm start
```

Con PM2 podés añadirlo al bloque `env` de `ecosystem.config.cjs`:

```js
env: {
  NODE_ENV: 'production',
  ENV_FILE: '/ruta/mi-tienda-ya-2/.env.produccion'
}
```

Las variables ya presentes en el proceso tienen prioridad sobre el archivo. Para varias instalaciones, usá diferentes nombres PM2, puertos, bases MongoDB, carpetas de datos y `WHATSAPP_CLIENT_ID`.

## 3. Proxy Nginx

Configuración inicial HTTP, antes de emitir el certificado:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tiendas.tu-dominio.com;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```

Guardala con el dominio correcto en tu configuración Nginx y habilitá el sitio según tu distribución. Antes de recargar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Si utilizás Certbot y ya está instalado:

```bash
sudo certbot --nginx -d tiendas.tu-dominio.com
```

El certificado y su renovación quedan bajo tu instalación de Certbot. La configuración final debe atender HTTPS y redirigir HTTP a HTTPS. `APP_URL` debe coincidir exactamente con el dominio público, sin rutas ni barra final.

El mismo proxy sirve las rutas de aplicación, incluyendo `/api`, `/t/...` y `/pedido/...`; las imágenes nuevas se sirven desde `R2_PUBLIC_URL`. `/uploads/images` sólo conserva compatibilidad con archivos locales anteriores. No hay un servidor Vite separado en producción. La PWA, las cookies seguras y los webhooks de Mercado Pago requieren HTTPS en este despliegue.

## 4. Docker Compose

Esta alternativa incluye dos servicios:

- `app`: Node.js 24 sobre Debian Bookworm Slim; API y frontend compilado en un proceso.
- `mongo`: MongoDB 8.0 standalone, con autenticación y sin publicar el puerto 27017.

La imagen de la aplicación se ejecuta como usuario `node`, no como root. Incluye Chromium para la integración WhatsApp y `dumb-init` para gestionar correctamente los procesos hijos.

### Preparar las variables

Completá `.env` como en la instalación anterior y agregá las variables de MongoDB para Compose:

```dotenv
APP_URL=https://tiendas.tu-dominio.com
HTTP_PORT=5000
MONGO_DB_NAME=mi_tienda_ya_2
MONGO_ADMIN_USER=mty_database_admin
MONGO_ADMIN_PASSWORD=GENERAR_UNA_CLAVE_HEXADECIMAL
MONGO_APP_USER=mty_app
MONGO_APP_PASSWORD=GENERAR_OTRA_CLAVE_HEXADECIMAL
```

Generá cada contraseña con el mismo comando `crypto.randomBytes(32)` mostrado antes. Para estas variables utilizá valores hexadecimales: Compose compone una URI MongoDB y otros caracteres especiales requerirían codificación de URI.

El script `scripts/mongo-init.js` crea un usuario de aplicación con permiso `readWrite` sólo sobre su base. La API recibe las credenciales de ese usuario; no recibe la contraseña de administrador de MongoDB.

Compose establece automáticamente `NODE_ENV=production`, `PORT=5000`, `TRUST_PROXY=1`, la URI de MongoDB y las rutas persistentes del contenedor. El `.env` se utiliza para sustituir variables; no se copia dentro de la imagen.

### Iniciar

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Nginx del host debe apuntar a `http://127.0.0.1:5000`. El puerto de la aplicación sólo se publica en loopback. Si cambiás `HTTP_PORT`, actualizá también el upstream Nginx.

Para reconstruir una versión nueva:

```bash
docker compose up -d --build
```

Para detener sin borrar los datos:

```bash
docker compose down
```

Los volúmenes `mongo_data` y `app_data` preservan la base, imágenes, comprobantes y sesión de WhatsApp. No uses `docker compose down -v` si querés conservarlos.

Los usuarios de MongoDB se crean sólo al inicializar un volumen vacío. Cambiar sus contraseñas en `.env` no cambia las credenciales de una base existente: una rotación debe realizarse también dentro de MongoDB, coordinando luego el reinicio de la aplicación. No borres un volumen como forma de cambiar una contraseña.

### Chromium y WhatsApp en Docker

La imagen instala Chromium en `/usr/bin/chromium` y usa `PUPPETEER_SKIP_DOWNLOAD=true` durante la construcción, evitando una segunda descarga del navegador. La instalación puede deshabilitarse con el argumento de build `INSTALL_CHROMIUM=false` si no necesitás WhatsApp.

Por defecto se conserva el sandbox del navegador. Algunos hosts Docker restringen los espacios de nombres requeridos por Chromium; si los registros indican que el sandbox no puede iniciarse, podés optar explícitamente por:

```dotenv
WHATSAPP_NO_SANDBOX=true
```

Después recreá el servicio con `docker compose up -d`. Esta opción reduce el aislamiento del navegador, por lo que no se activa automáticamente. El resto de la aplicación funciona sin iniciar WhatsApp; la conexión se solicita desde administración.

## 5. Chromium fuera de Docker

Si se utiliza el navegador descargado por Puppeteer, dejá vacío `PUPPETEER_EXECUTABLE_PATH` y permití la descarga durante `npm ci`. Si preferís Chromium del sistema, instalalo con el administrador de paquetes de tu servidor y configurá su ruta. Ejemplo de nombre habitual en Debian:

```dotenv
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

Para omitir la descarga durante esa instalación:

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm ci
```

Un valor en `.env` por sí solo no modifica el proceso `npm ci`: en ese comando la variable se transmite expresamente. Ejecutá PM2 con un usuario sin privilegios y con permisos sobre las carpetas de datos.

## 6. Persistencia y recuperación

Conservá y respaldá juntos:

- MongoDB, usando una estrategia de respaldo adecuada al servidor elegido.
- Los buckets `R2_ASSETS_BUCKET_NAME` y `R2_RECEIPTS_BUCKET_NAME`.
- `UPLOAD_DIR` sólo mientras exista contenido local pendiente de migrar.
- La sesión `WHATSAPP_DATA_PATH`, si deseás restaurar el emparejamiento.
- El archivo `.env`, especialmente `ENCRYPTION_KEY` y `SESSION_SECRET`.

Cambiar o perder `ENCRYPTION_KEY` impide descifrar credenciales de cobro y tokens de seguimiento ya almacenados. Antes de cambiarla hace falta un procedimiento de migración y recifrado; esta primera versión no incluye una rotación automática.

El endpoint `GET /api/health` comprueba que la conexión con MongoDB esté disponible. Los registros muestran problemas de arranque, SMTP y WhatsApp sin incluir contraseñas.

## 7. Alcance de las verificaciones

Se verificaron la sintaxis de los archivos JavaScript, la compilación de Vue y las pruebas automatizadas de API con MongoDB temporal. El archivo Compose se revisó como YAML y por su configuración. En el entorno de construcción del ZIP no había un motor Docker para ejecutar la imagen: validá `docker compose up --build` en tu servidor antes de usarlo con datos reales.

SMTP, WhatsApp y Mercado Pago requieren configuración y pruebas con tus cuentas. La guía [INTEGRACIONES.md](INTEGRACIONES.md) detalla sus pasos y políticas de pago, reserva y entrega digital.

## Referencias

- [Imágenes oficiales de Node.js y variantes Debian](https://github.com/nodejs/docker-node).
- [Buenas prácticas de la imagen Node.js](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md).
- [Imagen oficial MongoDB y variables de inicialización](https://hub.docker.com/_/mongo).
- [Entrypoint oficial MongoDB](https://github.com/docker-library/mongo/blob/master/docker-entrypoint.sh).

## Dominios por tienda (v1.10.0)

La aplicación puede servir una tienda por URL clásica, subdominio administrado o dominio propio. Configurá:

```dotenv
STOREFRONT_BASE_DOMAIN=mitiendaya.com.ar
STOREFRONT_CNAME_TARGET=stores.mitiendaya.com.ar
STOREFRONT_VERIFICATION_PREFIX=_mitiendaya-verification
STOREFRONT_RESERVED_SUBDOMAINS=www,app,api,admin,root,mail,static,assets,media,cdn,stores
```

### Subdominios administrados

Publicá un DNS wildcard para `*.mitiendaya.com.ar` (o el valor de `STOREFRONT_BASE_DOMAIN`) hacia tu proxy/CDN. Ese frontal debe entregar HTTPS válido para los subdominios y reenviar el `Host` original a Express.

Ejemplo conceptual de Nginx detrás de una capa que ya resolvió/emitió TLS:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Con `TRUST_PROXY=1`, usá exactamente un proxy de confianza delante del proceso Node como ya se indica en esta guía.

### Dominios propios

El vendedor guarda su hostname en **Tu tienda → Dominio**. La aplicación muestra dos datos DNS:

1. TXT de propiedad: `_mitiendaya-verification.<dominio>` con el token generado.
2. CNAME/ALIAS hacia `STOREFRONT_CNAME_TARGET`.

La API verifica el TXT. El enrutamiento y TLS siguen siendo responsabilidad de la infraestructura frontal. Si el dominio es apex (`marca.com`) y el proveedor no acepta CNAME en la raíz, usá ALIAS/ANAME, CNAME flattening o la alternativa equivalente de ese proveedor.

Para aceptar dominios arbitrarios en producción necesitás un proxy/CDN capaz de aprovisionar certificados para esos hostnames. Un certificado emitido sólo para `APP_URL` o para `*.STOREFRONT_BASE_DOMAIN` no cubre `marca.com`.

### Cambio futuro del dominio base

`mitiendaya.com.ar` es solamente el valor inicial. Para migrarlo, cambiá `STOREFRONT_BASE_DOMAIN`, `STOREFRONT_CNAME_TARGET`, DNS wildcard y certificados. Las tiendas configuradas en modo subdominio calcularán su URL usando el nuevo dominio base; los dominios propios no cambian.

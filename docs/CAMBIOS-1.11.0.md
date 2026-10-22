# Cambios 1.11.0 · aprovisionamiento automático de dominios propios

## Objetivo

Cuando una tienda utiliza un dominio propio ya no hace falta crear manualmente un `server` de Nginx ni ejecutar Certbot para ese hostname. El flujo de **Tu tienda → Dominio** valida primero el TXT de propiedad y, si coincide, aprovisiona Nginx y HTTPS antes de marcar el dominio como activo.

## Flujo

`POST /api/stores/:storeId/domain/verify` ahora realiza, en orden:

1. valida que la tienda siga configurada en modo `custom`;
2. resuelve el TXT `_mitiendaya-verification.<dominio>` y compara el token;
3. invoca el helper privilegiado mediante `DomainProvisioningService`;
4. el helper publica temporalmente el challenge HTTP de ACME en Nginx;
5. ejecuta `nginx -t` y recarga Nginx;
6. Certbot solicita el certificado con challenge `webroot`;
7. escribe el bloque HTTP→HTTPS y el bloque HTTPS con el certificado emitido;
8. vuelve a ejecutar `nginx -t` y recarga Nginx;
9. sólo después de completar todo marca `domain.status=verified` y expone el dominio como URL pública.

Si Nginx o Certbot fallan, el dominio continúa `pending`, se mantiene la URL `/t/<slug>` como respaldo y la operación se puede volver a intentar.

## Seguridad

Node/PM2 no recibe permisos root generales. La aplicación únicamente puede ejecutar, mediante `sudo -n`, `/usr/local/sbin/mitiendaya-domain-provision`. El helper instalado allí es propiedad de `root`, valida el identificador de tienda y el hostname, utiliza argumentos separados —sin interpolarlos en un shell— y sólo admite las acciones `provision` y `remove`.

El instalador crea una regla dedicada en `/etc/sudoers.d/mi-tienda-ya-domain-provisioner`. No se recomienda ejecutar Node como root.

## Instalación única en el servidor

Instalá Nginx y Certbot si todavía no existen. El helper utiliza Certbot en modo `webroot`, por lo que no necesita el plugin `certbot-nginx`.

```bash
sudo apt update
sudo apt install -y nginx certbot
```

Desde la raíz del proyecto ejecutá una vez, reemplazando el usuario que ejecuta PM2 y el correo de Let's Encrypt:

```bash
sudo APP_USER=miusuario \
  CERTBOT_EMAIL=admin@mitiendaya.com.ar \
  PROXY_PASS=http://127.0.0.1:5000 \
  bash scripts/server/install-domain-provisioner.sh
```

Después habilitá en `.env`:

```dotenv
DOMAIN_PROVISIONING_ENABLED=true
DOMAIN_PROVISIONER_BIN=/usr/local/sbin/mitiendaya-domain-provision
DOMAIN_PROVISIONING_USE_SUDO=true
DOMAIN_PROVISIONER_SUDO_BIN=/usr/bin/sudo
DOMAIN_PROVISIONING_TIMEOUT_MS=180000
```

Reiniciá el proceso Node cargando las variables nuevas. Con PM2, por ejemplo:

```bash
pm2 restart mi-tienda-ya-2 --update-env
```

## DNS necesario

El vendedor sigue teniendo que crear los registros que muestra la pantalla de Dominio:

- TXT de propiedad;
- CNAME/ALIAS del dominio hacia `STOREFRONT_CNAME_TARGET`.

La automatización no puede modificar el proveedor DNS del vendedor. El CNAME/ALIAS debe estar propagado y el puerto 80 del servidor debe ser alcanzable públicamente para que Let's Encrypt pueda completar HTTP-01.

## Renovación

El instalador agrega `/etc/letsencrypt/renewal-hooks/deploy/mi-tienda-ya-nginx-reload`. Cuando Certbot renueva un certificado, el hook valida y recarga Nginx. En distribuciones Debian/Ubuntu verificá además que `certbot.timer` esté activo:

```bash
systemctl status certbot.timer
```

## Limpieza

Al cambiar una tienda desde un dominio propio a otro modo, cambiar el hostname custom o archivar la tienda, la aplicación solicita al helper eliminar el sitio Nginx y el certificado asociados a esa tienda. Un nuevo dominio para esa misma tienda genera luego una configuración limpia.

## Archivos principales

- `api/src/services/DomainProvisioningService.js`
- `api/src/services/DomainService.js`
- `scripts/server/mitiendaya-domain-provision`
- `scripts/server/install-domain-provisioner.sh`
- `client/src/views/seller/DomainView.vue`
- `.env.example`

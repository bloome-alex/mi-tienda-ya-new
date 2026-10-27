# MiTiendaYa 1.21.1

## Corrección: acceso permanente por `/t/:slug`

Una tienda ya no cambia el modo de enrutamiento del frontend solamente por tener un dominio o subdominio configurado.

La aplicación distingue explícitamente dos formas de acceso:

- **Path permanente de MiTiendaYa:** `APP_URL/t/:slug`.
- **Hostname adicional:** subdominio administrado o dominio propio verificado.

El path de MiTiendaYa permanece disponible en todos los modos de dominio. El dominio/subdominio continúa usando rutas limpias (`/`, `/producto/:id`, `/carrito`, etc.), mientras que el acceso por path conserva siempre el prefijo `/t/:slug` en la navegación interna.

Esto corrige la vista previa de **Diseño de tu tienda**, que usa deliberadamente el path permanente para mantener el iframe en el mismo origen del panel y completar correctamente el handshake de vista previa.

## Contrato de URLs

`DomainService.publicDomain()` expone ahora:

- `publicUrl`: URL preferida de la tienda (dominio/subdominio cuando corresponde).
- `pathUrl`: URL permanente `APP_URL/t/:slug`.

La pantalla **Tu tienda → Dominio** muestra también el enlace permanente para dejar claro que continúa disponible aunque se configure otra dirección.

## Datos

No requiere migraciones ni cambios de esquema en MongoDB.

## Pruebas

Se agregaron contratos para comprobar que:

- `/t/:slug` usa el router de plataforma aunque la tienda tenga dominio propio.
- las rutas internas conservan `/t/:slug` cuando se accede por path;
- el dominio/subdominio mantiene rutas limpias;
- el diseñador construye la vista previa sobre `/t/:slug`;
- el backend expone `pathUrl` sin reemplazar `publicUrl`.

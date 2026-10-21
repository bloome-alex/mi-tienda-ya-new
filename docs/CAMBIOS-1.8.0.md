# Cambios 1.8.0 · Cloudflare R2

Esta versión mueve los archivos generados por las tiendas a Cloudflare R2 y elimina la dependencia del disco local para nuevas cargas.

## Qué se almacena en R2

- Fotos de productos.
- Logo, favicon, fondos y demás imágenes utilizadas por el diseñador.
- Imágenes de portadas, carruseles, secciones y complementos personalizados.
- Comprobantes de transferencia bancaria.

MongoDB conserva únicamente las referencias, metadatos y claves de objeto necesarias para relacionar cada archivo con su tienda.

## Dos buckets por seguridad

La aplicación usa dos buckets R2:

- `R2_ASSETS_BUCKET_NAME`: imágenes/archivos públicos que necesita renderizar la tienda. `R2_PUBLIC_URL` debe apuntar únicamente a este bucket.
- `R2_RECEIPTS_BUCKET_NAME`: comprobantes privados. No debe tener `r2.dev`, Custom Domain ni otra publicación anónima habilitada.

Ambos pueden usar las mismas credenciales S3 si el token está limitado exclusivamente a esos dos buckets.

## Variables nuevas

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ASSETS_BUCKET_NAME=
R2_RECEIPTS_BUCKET_NAME=
R2_PUBLIC_URL=
R2_ENDPOINT=
R2_PREFIX=mi-tienda-ya-2
```

`R2_ENDPOINT` es opcional; si queda vacío se usa `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

## Sincronización y limpieza

`R2StorageService` encapsula la API S3 de R2 y `AssetService` administra el ciclo de vida de los archivos:

- al reemplazar una foto de producto o una imagen del diseño, la referencia nueva se guarda y la imagen anterior deja de conservarse cuando ya no está utilizada;
- al eliminar/archivar un producto, sus imágenes no compartidas se borran de R2 antes de completar la solicitud;
- al quitar una imagen del diseño, se elimina de R2 si ningún producto ni otra zona del diseño la sigue utilizando;
- al reemplazar un comprobante, el anterior se elimina del bucket privado;
- una carga abandonada por el formulario se intenta eliminar inmediatamente desde el cliente y, si queda huérfana, el worker la limpia después de 24 horas.

Las operaciones de borrado esperan la respuesta de R2. Como MongoDB y R2 no comparten una transacción distribuida, una caída temporal de Cloudflare puede ocurrir después de una escritura en MongoDB. En ese caso `StorageCleanupService` registra el objeto pendiente en MongoDB y el worker vuelve a intentar el borrado con espera creciente. Así se evita depender de una única llamada para limpiar archivos huérfanos.

## Comprobantes privados

Los comprobantes nunca se devuelven mediante `R2_PUBLIC_URL`. Se escriben en `R2_RECEIPTS_BUCKET_NAME` y el backend los recupera con las credenciales S3 sólo después de validar la sesión y el acceso a la tienda. La respuesta utiliza `Cache-Control: private, no-store`.

## Actualizar desde v1.7.0 o anterior

1. Hacé una copia de MongoDB y de tu antiguo `UPLOAD_DIR`.
2. Creá los dos buckets R2.
3. Conectá un Custom Domain únicamente al bucket de assets.
4. Creá un API Token/S3 credential con lectura y escritura sobre ambos buckets.
5. Completá las variables R2 del `.env`.
6. Detené la aplicación.
7. Instalá dependencias y migrá:

```bash
npm ci
npm run migrate:r2
```

8. Revisá que las imágenes públicas carguen y que un comprobante pueda abrirse desde un pedido autenticado.
9. Compilá y reiniciá:

```bash
npm run build
npm start
```

El migrador sube cada archivo antes de cambiar la referencia de MongoDB y sólo elimina la copia local una vez actualizada la base. Si algún archivo falla, el proceso informa el error y finaliza con código distinto de cero. Conservá el respaldo local hasta verificar la migración.

`UPLOAD_DIR` permanece soportado sólo como fuente de la migración y compatibilidad temporal con archivos anteriores. Las cargas nuevas no se escriben ahí.

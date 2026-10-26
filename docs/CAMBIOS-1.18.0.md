# MiTiendaYa 1.18.0

## Solicitudes de planes

Administración → **Solicitudes de planes** conserva el listado paginado y agrega una acción **Visualizar**. Cada solicitud abre su propia ruta (`/app/custom-plan-requests/:id`) y muestra email, WhatsApp, fecha, estado, identificador y descripción completa. No se utilizan modales para el detalle.

## Redes sociales y anuncios

Cada tienda dispone de **Redes y anuncios**. La pantalla presenta Facebook, Instagram, YouTube y TikTok. En 1.18.0 sólo Facebook está operativo; las otras tres redes se muestran como **Muy pronto** y no realizan llamadas externas.

La integración está encapsulada en `FacebookAdsService` y `MetaGraphClient`. La configuración y los anuncios pertenecen a la tienda, se persisten en MongoDB y el access token se guarda cifrado con `ENCRYPTION_KEY`. Las credenciales de la aplicación Meta nunca se envían al navegador.

### Datos del servidor

```dotenv
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v26.0
META_REDIRECT_URI=https://TU-DOMINIO/api/social/facebook/callback
META_FACEBOOK_LOGIN_CONFIG_ID=
META_SANDBOX_CONNECT_ENABLED=false
```

- `META_APP_ID`: identifica la aplicación creada en Meta for Developers.
- `META_APP_SECRET`: secreto de servidor usado para el intercambio OAuth y `appsecret_proof`. Debe mantenerse únicamente en el backend.
- `META_GRAPH_VERSION`: versión de Graph/Marketing API usada por la aplicación. Esta entrega parte de `v26.0`.
- `META_REDIRECT_URI`: callback exacto autorizado en Meta. En producción debe ser HTTPS y coincidir con el valor configurado en Facebook Login for Business.
- `META_FACEBOOK_LOGIN_CONFIG_ID`: identificador opcional de una configuración de Facebook Login for Business. Permite centralizar la autorización definida en Meta en vez de enviar la lista de scopes en la URL.
- `META_SANDBOX_CONNECT_ENABLED`: muestra el formulario de token manual para un Marketing API Sandbox. Se recomienda `true` sólo en desarrollo y `false` en producción.

La conexión solicita `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement` y `pages_manage_ads`. La disponibilidad efectiva depende del modo/acceso aprobado para la aplicación Meta y de los activos a los que la persona autorizada tenga acceso.

Durante desarrollo, Meta permite probar con personas que tengan un rol explícito en la app. Para abrir la conexión a vendedores externos en producción, la aplicación Meta debe completar los requisitos de acceso/revisión que Meta aplique a esos permisos y activos.

Después de conectar, el vendedor selecciona una cuenta publicitaria y una Página de Facebook. La selección se guarda por tienda.

### Primer tipo de anuncio

1. Elegir un producto activo con primera imagen pública HTTP/HTTPS.
2. Escribir nombre interno, texto principal y título.
3. Indicar presupuesto diario y país objetivo.
4. MiTiendaYa crea campaña de tráfico, conjunto de anuncios, imagen/creativo y anuncio.
5. Todos los objetos publicitarios creados por esta pantalla nacen en estado `PAUSED`.

La primera imagen se descarga en el backend con controles contra redes privadas/SSRF, tamaño máximo de 10 MB y tipos JPG, PNG, WEBP o GIF. Luego se suben sus bytes a Meta; no se envía una URL arbitraria para que Meta la descargue.

### Prueba sin gastar dinero

La opción más segura es **Marketing API Sandbox** de Meta:

1. En Meta for Developers, abrir la aplicación y entrar a las herramientas de Marketing API/Sandbox Ad Account Management.
2. Crear una cuenta publicitaria Sandbox y generar su Sandbox Access Token.
3. Asociar una Página de Facebook de prueba/permitida al Sandbox y obtener tanto el `act_...` de la cuenta como el ID de esa Página.
4. En desarrollo usar `META_SANDBOX_CONNECT_ENABLED=true`.
5. Asegurar que la tienda y la primera imagen del producto tengan una URL pública accesible por Meta. En desarrollo puede usarse un túnel HTTPS; `localhost` no sirve como destino de anuncio.
6. En **Tienda → Redes y anuncios → Prueba sin gasto**, ingresar Sandbox Access Token, Ad Account ID y Page ID.
7. Crear un anuncio de un producto. MiTiendaYa registrará los IDs externos y lo dejará pausado.
8. Verificar la jerarquía creada en las herramientas Sandbox de Meta. Un Sandbox no entrega anuncios reales ni factura; además MiTiendaYa crea los objetos como `PAUSED`.

Si Meta no ofrece Sandbox para la aplicación/cuenta utilizada, se puede validar el OAuth y crear objetos `PAUSED` en una cuenta real sin activarlos. Eso comprueba creación/configuración, pero no prueba entrega y debe revisarse siempre en Ads Manager antes de activar algo.

## Seguridad y alcance

- Los tokens se cifran en MongoDB y el esquema los excluye de consultas normales (`select: false`).
- El estado OAuth es aleatorio, hasheado y expira automáticamente.
- Una tienda sólo puede operar su propia integración mediante los permisos de acceso de tienda existentes.
- Las imágenes remotas no pueden resolver a localhost, rangos privados, link-local o direcciones reservadas.
- Al fallar una creación después de crear la campaña, el servicio intenta eliminar la campaña parcial.
- Esta función no agrega una nueva capacidad al catálogo comercial de planes: se conservan exactamente las 15 funcionalidades de planes definidas en 1.17.0.

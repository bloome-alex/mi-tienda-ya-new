# MiTiendaYa 1.21.0

## Cierre del módulo Redes y anuncios

Esta versión completa las integraciones publicitarias disponibles desde cada tienda. El módulo queda compuesto por:

- Facebook Ads
- Instagram Ads
- Google Ads
- YouTube Ads
- TikTok Ads

No quedan proveedores marcados como "Muy pronto" dentro de Redes y anuncios.

Todas las conexiones son por tienda. Un vendedor puede conectar cuentas distintas en tiendas distintas y desconectar una red sin afectar las demás. Los secretos se cifran antes de persistirse en MongoDB.

La implementación mantiene responsabilidades separadas siguiendo Programación Orientada a Objetos: los clientes HTTP encapsulan los contratos de cada proveedor y los servicios de dominio encapsulan OAuth, selección de activos y creación de anuncios. `YouTubeAdsService` reutiliza la infraestructura común de `GoogleAdsService`, pero conserva su propia conexión y reglas de campaña.

## Google Ads

Se agrega conexión OAuth multiusuario con acceso offline. MiTiendaYa descubre las cuentas Google Ads disponibles, incluidas cuentas cliente accesibles a través de una cuenta manager, y permite seleccionar la cuenta de la tienda.

La primera versión crea campañas de tráfico de producto en Google Search:

- presupuesto diario de la cuenta;
- campaña `SEARCH`;
- Maximize Clicks (`targetSpend` sin fijar `target_spend_micros`);
- Google Search habilitado y expansiones/redes adicionales deshabilitadas;
- país objetivo;
- palabra clave de concordancia de frase basada en el producto;
- Responsive Search Ad con tres títulos y dos descripciones;
- campaña, grupo y anuncio en `PAUSED`.

Google Ads API queda configurada por defecto en `v26`. Desde septiembre de 2026 el acceso de Google Ads API se administra en el proyecto de Google Cloud que posee las credenciales OAuth; no se agrega un developer token a las solicitudes.

Variables de administración:

```env
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_API_VERSION=v26
GOOGLE_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/google/callback
```

El vendedor no necesita conocer estas variables. Sólo autoriza su propia cuenta de Google y selecciona su cuenta publicitaria.

## YouTube Ads

YouTube Ads comparte el proyecto OAuth de Google Ads, pero mantiene una integración separada por tienda y callback propio.

La creación usa campañas `DEMAND_GEN` porque Google Ads API permite administrarlas completamente y ofrece controles de canal. MiTiendaYa restringe explícitamente el ad group a:

- YouTube In-stream;
- YouTube In-feed;
- YouTube Shorts.

Y deshabilita Discover, Gmail, Display y Maps.

Para crear un anuncio se solicita:

- producto;
- nombre interno;
- texto/título;
- presupuesto y país;
- URL o ID de un video de YouTube;
- logo opcional. Si se omite, se intenta usar el icono de la tienda o la imagen del producto.

El logo se convierte a PNG cuadrado de 512x512. El video y el logo se crean como assets de Google Ads, y el anuncio Demand Gen se crea en `PAUSED` dentro de la misma mutación atómica.

Variable adicional:

```env
GOOGLE_YOUTUBE_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/youtube/callback
```

## TikTok Ads

Se agrega integración con TikTok API for Business / Marketing API. La versión predeterminada es `v2.0`.

El vendedor autoriza MiTiendaYa mediante la URL de autorización de anunciante generada para la app de TikTok for Business. Después selecciona:

1. cuenta publicitaria;
2. identidad publicitaria no-Spark compatible (`CUSTOMIZED_USER`);
3. video disponible en la biblioteca del anunciante.

La creación inicial utiliza un flujo de tráfico hacia la ficha pública del producto:

- objetivo `TRAFFIC`;
- promoción web;
- placement exclusivo `PLACEMENT_TIKTOK`;
- país objetivo;
- presupuesto diario;
- identidad no-Spark autorizada;
- video de la biblioteca;
- CTA `SHOP_NOW`;
- campaña, grupo y anuncio en `DISABLE`.

Las identidades Spark (`TT_USER`, `AUTH_CODE`, etc.) no se mezclan con este flujo porque TikTok las vincula a publicaciones mediante `tiktok_item_id`; MiTiendaYa usa el contrato no-Spark documentado para videos de biblioteca (`video_id`).

Si falla una etapa posterior a crear la campaña, MiTiendaYa intenta eliminar la campaña parcial y no persiste un `SocialAd` exitoso localmente.

Variables de administración:

```env
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
TIKTOK_ADS_API_VERSION=v2.0
TIKTOK_ADS_REDIRECT_URI=https://TU-DOMINIO/api/social/tiktok/callback
TIKTOK_ADS_AUTHORIZATION_URL=
```

`TIKTOK_ADS_AUTHORIZATION_URL` es la URL de autorización de anunciante que entrega TikTok for Business para la aplicación. Los vendedores no necesitan verla ni configurarla.

## Seguridad operativa

MiTiendaYa no activa campañas desde la aplicación en esta entrega. Los objetos se crean pausados/deshabilitados para que el vendedor los revise en la plataforma publicitaria correspondiente antes de comenzar a gastar.

Las URLs de destino e imágenes utilizadas por las integraciones se someten a la política de recursos públicos antes de enviarse a proveedores externos. Las conexiones están asociadas al `storeId` y las selecciones de cuentas/identidades se validan contra los activos realmente autorizados.

## Testing

Se incorporan stacks mock independientes:

```bash
npm run test:mock:facebook
npm run test:mock:instagram
npm run test:mock:google
npm run test:mock:youtube
npm run test:mock:tiktok
```

Gate completo de publicidad:

```bash
npm run test:mock:ads
```

Gate de todas las integraciones críticas, incluyendo suscripciones de Mercado Pago:

```bash
npm run test:mock:integrations
```

Ver `docs/PRUEBAS-PUBLICIDAD-1.21.0.md` para el detalle de escenarios.

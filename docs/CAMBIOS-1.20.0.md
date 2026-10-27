# MiTiendaYa 1.20.0

## Home / planes

- Las cards públicas de planes muestran antes de las funcionalidades:
  - cantidad máxima de tiendas;
  - productos por tienda;
  - `0` productos se presenta como productos ilimitados.
- Los valores salen de `maxStores` y `maxProducts` del plan publicado; no se duplican en el frontend.

## Instagram Ads

Instagram pasa de "Muy pronto" a integración disponible.

La implementación reutiliza la infraestructura común de Meta mediante herencia de `FacebookAdsService`, pero mantiene una integración independiente por tienda con `provider: instagram`.

Flujo normal:

1. El vendedor abre Redes sociales y anuncios → Instagram.
2. Autoriza MiTiendaYa mediante Meta.
3. MiTiendaYa descubre cuentas publicitarias activas y Páginas administradas.
4. Sólo se ofrecen Páginas con una cuenta profesional de Instagram vinculada.
5. El vendedor selecciona la cuenta publicitaria y la identidad de Instagram.
6. Los anuncios de producto se crean en `PAUSED` y exclusivamente con `publisher_platforms: ['instagram']`.
7. El creativo usa `instagram_user_id`, no el campo deprecado `instagram_actor_id`.

La conexión de Instagram se guarda separada de Facebook en MongoDB. Desconectar una no elimina la otra.

### Configuración adicional

Se reutilizan `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` y, si corresponde, `META_FACEBOOK_LOGIN_CONFIG_ID`.

Se agrega:

```env
META_INSTAGRAM_REDIRECT_URI=https://TU-DOMINIO/api/social/instagram/callback
```

Esta URL debe agregarse también como callback autorizado en la aplicación de Meta.

Para OAuth sin Configuration ID se solicitan:

- `ads_management`
- `ads_read`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_ads`
- `instagram_basic`

Si se usa Facebook Login for Business con `config_id`, esa configuración debe incluir los permisos requeridos para Instagram.

## Google Ads

- Se agrega Google Ads al selector de redes.
- En esta versión figura exclusivamente como `Muy pronto`.
- No se crean rutas, credenciales ni lógica falsa de Google Ads.

## Testing

Nuevo comando:

```bash
npm run test:mock:instagram
```

El comando general ahora ejecuta Mercado Pago + Facebook + Instagram:

```bash
npm run test:mock:integrations
```

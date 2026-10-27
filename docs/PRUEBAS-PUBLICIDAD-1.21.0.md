# Pruebas mock de publicidad — MiTiendaYa 1.21.0

El objetivo de estos scripts es validar el mismo código de dominio que se usa en QA/Producción, sustituyendo únicamente los servidores externos por mocks HTTP locales. No requieren credenciales reales ni generan gasto.

## Requisitos

- Node.js compatible con el proyecto (`22.18+` o una versión `24.11+`).
- Dependencias instaladas con `npm ci`.
- MongoDB real no es necesario para estos scripts: utilizan `mongodb-memory-server`.

## 1. Facebook Ads

```bash
npm run test:mock:facebook
```

Stack existente: 11 subtests. Valida OAuth/Sandbox, cifrado, activos, campaña → ad set → creativo → anuncio, estado pausado, placements Facebook y rollbacks.

## 2. Instagram Ads

```bash
npm run test:mock:instagram
```

Stack existente: 13 subtests. Valida OAuth, cuenta profesional vinculada, `instagram_user_id`, permisos, placements Instagram, estado pausado, refresh y rollbacks.

## 3. Google Ads

```bash
npm run test:mock:google
```

6 subtests:

1. OAuth offline, refresh token cifrado y solicitudes sin developer token.
2. Creación atómica de campaña Search de tráfico, con campaña/grupo/anuncio pausados.
3. Cuenta cliente bajo manager usando `login-customer-id`.
4. Renovación automática de un access token vencido.
5. Error de `GoogleAdsService.Mutate` sin persistir un anuncio local falso.
6. País no targeteable aborta antes de mutar recursos.

## 4. YouTube Ads

```bash
npm run test:mock:youtube
```

6 subtests:

1. OAuth de YouTube separado y tokens cifrados.
2. Demand Gen atómico limitado a In-feed, In-stream y Shorts; el resto de canales deshabilitados; objetos pausados.
3. Parseo de ID de video y URLs `watch`, `youtu.be` y `shorts`.
4. Video inválido aborta antes de enviar operaciones a Google Ads.
5. Error de la mutación atómica no deja anuncios parciales ni un registro local exitoso.
6. Google Ads y YouTube Ads pueden coexistir con conexiones independientes para la misma tienda.

## 5. TikTok Ads

```bash
npm run test:mock:tiktok
```

10 subtests:

1. OAuth, consumo de state, descubrimiento de anunciante/identidad/videos y cifrado de credenciales.
2. Creación Traffic exclusiva de TikTok con campaña, grupo y anuncio en `DISABLE`.
3. Rollback `DELETE` de campaña si falla una etapa posterior.
4. Rechazo de anunciante inactivo antes de persistir la integración.
5. Cambio/recarga de activos de la cuenta publicitaria.
6. Rechazo de identidad que no pertenece al anunciante.
7. Separación explícita de identidades Spark: el flujo basado en `video_id` sólo acepta `CUSTOMIZED_USER` (no-Spark).
8. Rechazo de video que no pertenece a la biblioteca seleccionada antes de crear campaña.
9. Rechazo de país no targeteable antes de crear campaña.
10. Renovación de token de corta duración mediante `/oauth/token/`.

## Gate del módulo de publicidad

```bash
npm run test:mock:ads
```

Ejecuta, en este orden:

```text
Facebook → Instagram → Google Ads → YouTube Ads → TikTok Ads
```

El resultado esperado es cero fallos en todos los stacks. Los conteos individuales esperados son:

```text
Facebook:  11 tests
Instagram: 13 tests
Google:     6 tests
YouTube:    6 tests
TikTok:    10 tests
```

## Gate general de integraciones

```bash
npm run test:mock:integrations
```

Ejecuta primero el stack de suscripciones de Mercado Pago y luego todo el módulo publicitario. Antes de QA con credenciales reales este comando debe finalizar con código de salida `0`.

## Qué probar después con credenciales QA

Una vez verdes los mocks:

- Google Ads: OAuth real, listado de cuentas, cuenta manager/cliente si aplica, creación Search PAUSED.
- YouTube Ads: OAuth real, video público válido, creación Demand Gen PAUSED y comprobación de channel controls en Google Ads.
- TikTok Ads: autorización real de anunciante, identidad no-Spark (`CUSTOMIZED_USER`), video de biblioteca y creación `DISABLE`.

No activar campañas ni cargar presupuesto real hasta comprobar en cada plataforma que la cuenta, destino, creatividad, moneda y segmentación son correctos.

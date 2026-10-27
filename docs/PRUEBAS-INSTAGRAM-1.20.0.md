# Pruebas mock de Instagram Ads — 1.20.0

## Requisito

Usar una versión de Node compatible con el proyecto (`22.18.0+` o `24.11.0+`).

```bash
npm ci
npm run test:mock:instagram
```

El stack levanta MongoDB en memoria y un servidor HTTP local que simula Meta Graph/Marketing API v26. No requiere credenciales reales ni dinero. Contiene 13 subtests que cubren las 16 condiciones enumeradas abajo.

Resultado esperado:

```text
# tests 13
# pass 13
# fail 0
```

## Casos cubiertos

1. Sandbox valida cuenta publicitaria, Página e identidad profesional y cifra el token.
2. OAuth solicita `instagram_basic`, intercambia token corto por largo y descubre activos.
3. Rechazo cuando no hay una cuenta profesional vinculada a la Página.
4. Rechazo por permisos incompletos sin persistir una conexión parcial.
5. Creación `campaign → adset → image → creative → ad`.
6. Todos los objetos creados nacen en `PAUSED`.
7. El ad set usa exclusivamente `publisher_platforms: ['instagram']`.
8. El creativo usa `instagram_user_id` junto con el `page_id` vinculado.
9. Rollback si Meta falla luego de crear la campaña.
10. No intenta rollback de un ID inexistente si falla antes de crear la campaña.
11. Rollback cuando la carga de imagen no devuelve hash.
12. Un token inválido no crea integración local.
13. Una cuenta publicitaria inactiva se rechaza.
14. Un Instagram User ID no vinculado a la Página se rechaza.
15. Refresh vuelve a validar activos y vínculo Página ↔ Instagram.
16. Si la cuenta profesional se desvincula, la conexión queda marcada con error.

## Suite conjunta

```bash
npm run test:mock:subscriptions
npm run test:mock:facebook
npm run test:mock:instagram
npm run test:mock:integrations
```

No pasar a QA con credenciales reales mientras alguno de los mocks falle.

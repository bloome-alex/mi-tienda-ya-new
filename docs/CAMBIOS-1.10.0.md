# Cambios 1.10.0 · dominios por tienda

## Objetivo

Cada tienda puede elegir su dirección pública sin cambiar el `slug` ni perder la URL clásica. La implementación mantiene MongoDB como fuente de configuración y concentra la lógica de host/DNS en `DomainService`, siguiendo la organización orientada a objetos del API.

## Modalidades

1. **Ruta clásica**: `${APP_URL}/t/<slug>`.
2. **Subdominio administrado**: `<subdominio>.<STOREFRONT_BASE_DOMAIN>`.
3. **Dominio propio**: cualquier hostname válido ajeno al dominio base, después de verificar su propiedad mediante TXT.

Los subdominios y dominios propios son únicos entre tiendas no archivadas. Los nombres reservados de infraestructura no pueden asignarse a una tienda.

## Variables nuevas

```dotenv
STOREFRONT_BASE_DOMAIN=mitiendaya.com.ar
STOREFRONT_CNAME_TARGET=stores.mitiendaya.com.ar
STOREFRONT_VERIFICATION_PREFIX=_mitiendaya-verification
STOREFRONT_RESERVED_SUBDOMAINS=www,app,api,admin,root,mail,static,assets,media,cdn,stores
```

Cambiar `STOREFRONT_BASE_DOMAIN` permite migrar el dominio administrado de la plataforma sin modificar el código.

## Dominio propio

Al guardar un dominio propio, la tienda queda en estado **Pendiente de verificación**. El panel muestra:

- un TXT `_mitiendaya-verification.<dominio>` con un token exclusivo de la tienda;
- el destino CNAME/ALIAS configurado en `STOREFRONT_CNAME_TARGET`.

El botón **Verificar DNS** consulta el TXT. Sólo después de encontrar el token exacto el dominio queda marcado como verificado y pasa a ser la URL pública de la tienda.

La aplicación no emite certificados TLS. El proxy/CDN frontal debe aceptar el hostname, conservar `Host`, dirigirlo a esta aplicación y servir un certificado HTTPS válido. Para dominios apex, el proveedor DNS debe ofrecer ALIAS/ANAME, CNAME flattening o un mecanismo equivalente si no admite CNAME en la raíz.

## Subdominios administrados

Para `tienda.mitiendaya.com.ar`, el entorno debe resolver `*.mitiendaya.com.ar` hacia el mismo proxy/CDN. También debe existir cobertura TLS wildcard o aprovisionamiento equivalente. El subdominio se considera administrado por la plataforma y no necesita TXT individual.

## Resolución por Host

Express identifica la tienda a partir de `req.hostname`. En producción, el HTML compilado recibe metadatos de la tienda y Vue monta la tienda directamente en `/`, `/producto/:id`, `/carrito`, `/checkout` y `/terminos`, sin mostrar `/t/<slug>` en el navegador.

La URL `/t/<slug>` continúa disponible en el dominio principal como fallback.

CORS acepta solicitudes de dominios que realmente resuelven a una tienda configurada. Los hosts desconocidos no adquieren acceso adicional al API.

## Pagos y correos

Los enlaces públicos de seguimiento y los retornos de Mercado Pago usan el dominio público de la tienda. Los Webhooks de Mercado Pago siguen usando `APP_URL`, porque debe ser el endpoint estable de la plataforma y no depender del DNS de cada vendedor.

## Actualización

No hay migración manual de MongoDB. Al iniciar, Mongoose crea los índices parciales únicos para `domain.subdomain` y `domain.customDomain`.

Después de reemplazar el código:

```bash
npm ci
npm run build
npm start
```

En Docker Compose, las nuevas variables ya se pasan al contenedor `app`.

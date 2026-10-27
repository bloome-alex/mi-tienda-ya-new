# MiTiendaYa 1.25.0

## Política de privacidad y condiciones del servicio de la aplicación

Se incorporan dos documentos legales globales de MiTiendaYa, independientes de los términos particulares que cada vendedor pueda publicar dentro de su tienda:

- **Política de Privacidad de MiTiendaYa**: `/politica-de-privacidad` (alias `/privacidad`).
- **Condiciones del Servicio de MiTiendaYa**: `/condiciones-del-servicio` (alias `/terminos` en el dominio principal de la plataforma).

Los documentos se publican habilitados por defecto y se enlazan desde el pie de la página principal. En dominios propios o subdominios que resuelven una tienda, `/terminos` continúa correspondiendo a los términos particulares de esa tienda; las rutas globales se utilizan en el host principal de MiTiendaYa.

## Administración editable

`Administración → Configuración → Legales` permite:

- publicar o despublicar cada documento;
- modificar título e introducción;
- editar todas las secciones;
- agregar o quitar secciones;
- abrir la página pública desde el mismo panel;
- actualizar automáticamente la fecha visible de última modificación al guardar.

Los textos se guardan como **texto plano**, no interpretan HTML y se validan por longitud en la API. Esto evita convertir el editor legal en una vía para inyectar código ejecutable.

La configuración se persiste en el documento global `Settings` de MongoDB. Las instalaciones existentes reciben automáticamente el contenido inicial cuando el campo legal aún no existe, sin migración manual.

## Contenido inicial

La Política de Privacidad inicial contempla, entre otros temas:

- cuentas, perfiles, autenticación y sesiones;
- tiendas, productos, variantes, stock, pedidos y clientes;
- Mercado Pago para cobros y suscripciones;
- Facebook Ads, Instagram Ads, Google Ads, YouTube Ads y TikTok Ads;
- tokens OAuth e identificadores de activos publicitarios;
- WhatsApp y correo SMTP;
- imágenes, comprobantes y almacenamiento Cloudflare R2;
- dominios propios, DNS, certificados y PWA;
- reportes de errores y adjuntos;
- auditoría y trazabilidad;
- conservación, eliminación, proveedores externos y derechos de los titulares;
- medidas de seguridad implementadas por la plataforma.

Las Condiciones del Servicio iniciales abarcan:

- roles de administrador y vendedor;
- pruebas, planes, límites y funcionalidades;
- suscripciones y facturación;
- tiendas, productos, stock, pedidos, pagos y entregas;
- productos digitales;
- dominios, subdominios, certificados y PWA;
- publicidad y anuncios;
- redes sociales, WhatsApp y emails;
- transferencias de tiendas;
- reportes de errores y soporte;
- uso aceptable, propiedad intelectual, disponibilidad y mantenimiento;
- seguridad, suspensión, finalización y responsabilidades.

## Seguridad

Los documentos describen controles que ya forman parte de la aplicación: HTTPS en producción, cookies de sesión seguras, CSRF, CORS por origen, Helmet/CSP, rate limiting, validación de entradas, permisos y acceso por tienda, bcrypt para la contraseña administrativa, cifrado de secretos recuperables, validación de webhooks, archivos privados y auditoría.

El contenido inicial es una base amplia alineada con las funcionalidades de MiTiendaYa. Debe revisarse con asesoramiento legal profesional antes de considerarlo texto jurídico definitivo para una empresa concreta.

## API

Nuevo endpoint público:

```text
GET /api/public/legal/privacy
GET /api/public/legal/terms
```

`GET /api/public/config` informa si cada documento está publicado para que la interfaz pueda mostrar u ocultar sus enlaces.

`GET /api/admin/settings` devuelve los documentos y sus URLs públicas, y `PUT /api/admin/settings` acepta el bloque `legal` validado. Las modificaciones quedan identificadas en auditoría como documentos legales actualizados sin copiar el texto completo dentro del detalle de cambios.

## Actualización

No se requiere migración manual de MongoDB. La primera lectura de la configuración global normaliza e inicializa los documentos legales cuando todavía no existen.

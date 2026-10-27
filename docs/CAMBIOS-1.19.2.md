# MiTiendaYa 1.19.2

## Limpieza de experiencia para vendedores

- La tarjeta **Qué necesita Facebook** de Redes y anuncios se muestra únicamente a usuarios Administradores.
- El modo Sandbox de Facebook queda reservado a Administradores; los vendedores sólo ven el flujo normal de conexión.
- Los vendedores ya no ven nombres de variables de entorno ni mensajes sobre backend/servidor al conectar Facebook.
- Se simplificaron textos de Facebook Ads para hablar de conexión, revisión y estado pausado sin exponer detalles de Marketing API u OAuth cuando el usuario es vendedor.
- Se revisaron ayudas de Dominio, Mercado Pago, Productos y PWA para retirar referencias innecesarias a Nginx, SSL interno, API, navegador/backend y manifest.
- Los datos que el vendedor sí necesita para completar una configuración externa se mantienen, pero se presentan como instrucciones de producto.

## Arquitectura

No se modifica la lógica de negocio ni el esquema de MongoDB. Los cambios son de presentación y autorización visual en Vue, reutilizando el rol de sesión existente y manteniendo la separación de responsabilidades actual.

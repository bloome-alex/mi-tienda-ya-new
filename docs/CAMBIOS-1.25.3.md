# MiTiendaYa 1.25.3

Corrección detectada en la prueba end-to-end en producción de la 1.25.2.

- **Seguimiento del pedido tras pagar con Mercado Pago (404).** En tiendas sin dominio propio, el retorno de Mercado Pago (`back_urls`) y el enlace del mail de confirmación apuntaban a `/t/:slug/pedido/:id`, ruta que no existe en el cliente: el comprador veía "Página no encontrada" después de pagar. Ahora se usa `DomainService.orderTrackingUrl()`, que genera `APP_URL/pedido/:id` (o el dominio/subdominio propio de la tienda). Los enlaces ya enviados siguen funcionando: el cliente redirige `/t/:slug/pedido/:id` a `/pedido/:id` conservando el token. Pruebas en `api/test/order-tracking-url.test.js`.

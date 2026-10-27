# MiTiendaYa 1.23.0

## Cobros y Entregas

- Se corrigió el contraste de **Dirección para recibir notificaciones** de Mercado Pago en modo oscuro usando los colores del tema.
- Una tienda puede configurar **múltiples cuentas de Mercado Pago Checkout Pro**.
- Cada forma de pago de tipo Checkout Pro selecciona expresamente qué cuenta recibirá el cobro.
- Las credenciales permanecen cifradas en MongoDB y nunca se devuelven al frontend.
- Cada cuenta recibe una URL de notificaciones propia.
- El pedido conserva el identificador de la cuenta elegida para que verificaciones, webhooks, reembolsos o contracargos posteriores sigan usando las credenciales correctas aunque se edite la forma de pago.
- Las cuentas utilizadas por formas de pago o pedidos históricos no pueden eliminarse accidentalmente.
- Las tiendas que usaban la integración única anterior migran automáticamente a una cuenta `Cuenta principal` sin perder credenciales ni asociaciones.

## Límites por plan

Se agregaron dos capacidades numéricas nuevas al plan:

- **Formas de pago por tienda** (`maxPaymentMethods`).
- **Formas de entrega por tienda** (`maxDeliveryMethods`).

`0` representa sin límite comercial, conservando un máximo técnico de 20 elementos por tienda.

Los límites se muestran en:

- ABM de Planes.
- Cards del Home.
- Comparación pública de planes.
- Mi Suscripción.
- Cobros y Entregas.

El backend aplica los cupos; no dependen solamente de ocultar botones en Vue. Si un downgrade deja una tienda por encima del nuevo cupo, el vendedor puede conservar o reducir la configuración, pero no aumentarla hasta volver a estar dentro del límite.

Para no quitar capacidades a clientes existentes, los planes anteriores a 1.23.0 se migran con 20 formas de pago y 20 formas de entrega; luego pueden ajustarse desde Administración.

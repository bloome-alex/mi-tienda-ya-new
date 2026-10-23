# Cambios v1.13.0

## Administración > Configuración > Suscripciones

- La descripción de **Habilitar contratación automática** ya no aparece pegada al título del checkbox.
- El texto se muestra debajo de la card como un hint, usando la misma estética de ayuda que los demás campos del panel.

## Personificación exclusiva de desarrollo/prueba

Se agregó la variable:

```dotenv
DEV_IMPERSONATION_ENABLED=false
```

Cuando vale `true` y `NODE_ENV` no es `production`, un administrador puede ingresar temporalmente como un vendedor desde **Administración > Usuarios** mediante **Entrar como vendedor**.

La sesión conserva el administrador que inició la personificación y muestra una franja visible con **Volver a Administración**. La API rechaza esta función en producción incluso si la variable se configura accidentalmente en `true`.

La personificación no modifica contraseñas, enlaces mágicos ni el usuario vendedor.

## Emails a vendedores

Se agregó **Administración > Emails** para enviar comunicaciones a todos los vendedores que tengan email registrado usando el SMTP existente.

Incluye tres plantillas iniciales:

- **Novedades de versión**, con versión, resumen de cambios y CTA opcional.
- **Comunicado**.
- **Aviso de servicio**.

La pantalla muestra el número de destinatarios, una vista previa antes del envío y el resultado del lote. El HTML se genera desde plantillas controladas; el contenido ingresado por el administrador se escapa antes de incorporarse al email.

## Branding visible

Todas las referencias visibles del frontend a `Mi Tienda Ya` o `mi-tienda-ya-2` se unificaron como **MiTiendaYa**.

El nombre del navbar utiliza un wordmark específico:

- modo claro: `MiTienda` blanco con contorno negro y `YA` negro;
- modo oscuro: `MiTienda` oscuro con contorno crema claro y `YA` crema claro.

Los nombres internos de paquetes, rutas de infraestructura, prefijos de R2 y otros identificadores técnicos no se modificaron.

## Modo oscuro y focus

- Se reemplazaron blancos y grises fríos del modo oscuro por una paleta crema cálida y menos contrastante.
- Se revisaron fondos, superficies, bordes, textos secundarios, badges, avisos, toasts, botones de peligro, selección de texto y controles.
- El modo claro conserva su paleta anterior.
- Inputs, selects, textareas y búsquedas ya no muestran halo azul al recibir foco.
- Enlaces y botones conservan una indicación de foco mínima para navegación por teclado.

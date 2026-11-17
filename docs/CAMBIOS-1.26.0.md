# MiTiendaYa 1.26.0

Mejoras de experiencia para vendedores y compradores surgidas de la prueba completa en producción.

## Comprador
- **WhatsApp siempre visible:** mientras se muestra el aviso “Instalá la aplicación”, el botón flotante de WhatsApp sube para no quedar tapado.
- **Carruseles en celular:** al tocar la portada o los destacados se pausan 6 segundos, así el botón no cambia bajo el dedo (en computadora ya se pausaban con el mouse y el teclado).
- **Precio “Desde”:** si las variantes tienen precios distintos, la tarjeta muestra “Desde $X” con el menor precio. El texto se edita en Textos (`priceFrom`).
- **Fotos en los mails:** la confirmación de pedido usa miniaturas JPG (`/api/public/email-images/...`) que se ven también en Outlook de escritorio, que no muestra WebP.

## Vendedor
- **Ver cambios en la tienda abierta:** al guardar en el panel, la tienda abierta en otra pestaña del mismo navegador muestra “Guardaste cambios en esta tienda · Ver cambios”.
- **Editor de diseño:** al abrir una sección, su encabezado queda a la vista (antes el contenido “saltaba” al cerrarse la anterior).
- **Deshacer “Restaurar diseño inicial”:** después de restaurar aparece “Deshacer” hasta guardar; las imágenes subidas en la sesión se conservan para poder recuperarlas.
- **Ayudas más claras:** el “Estilo general” explica qué cambia cada opción, y las columnas aclaran que en pantallas angostas (como la vista previa) se muestran menos.
- **Vista previa del carrito:** aviso de que es un carrito de prueba, separado del de la tienda publicada.
- **Resumen:** singular y plural correctos (“1 pedido por resolver”, “1 unidad vendida”).

Pruebas: `client/test/version126.test.js`, `api/test/email-images.test.js`.

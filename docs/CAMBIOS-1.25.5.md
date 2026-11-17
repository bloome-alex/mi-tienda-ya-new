# MiTiendaYa 1.25.5

Correcciones de experiencia detectadas al personalizar una tienda completa en producción.

## Editor de diseño
1. **Avisos que tapaban “Guardar cambios”.** En el panel los avisos se muestran abajo a la izquierda (junto al menú) y no bloquean los clics alrededor.
2. **Números fuera de rango.** Mientras se escribe sólo se aplica un valor válido y se avisa el rango; al salir del campo se ajusta al límite más cercano. La vista previa ya no se deforma (por ejemplo, una portada de 99.999 px).
3. **Colores inválidos.** El campo hexadecimal avisa el error, no aplica el color inválido y acepta `#abc` o valores sin `#`.
4. **Enlaces inválidos.** Los campos de URL y las redes sociales marcan “Revisá el enlace” si no es una dirección http(s) completa (antes decían “Enlace configurado” con `javascript:`). El servidor ya los rechazaba.
5. **Texto de los enlaces del menú.** Si el texto no fue personalizado, acompaña el cambio de destino (Catálogo → Términos, o el título de la sección elegida).
6. **Texto partido letra por letra** en la nota de “Datos de la tienda”.

## Tienda
7. **Mensaje de consulta enviada** con los colores de la tienda (antes usaba el verde del panel).
8. **Enlaces con #ancla** (por ejemplo `/t/tienda#store-contact`) abren directamente en la sección.
9. **Categorías en panel lateral:** en escritorio ya no aparece también el botón “Explorar categorías”; en celular ese botón abre el panel (antes no hacía nada).

Pruebas: `client/test/version1255.test.js`.

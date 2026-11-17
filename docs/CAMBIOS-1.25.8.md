# MiTiendaYa 1.25.8

- **Enlace a Términos en dominios y subdominios propios.** En una tienda servida desde su propio dominio o subdominio, el enlace del menú a Términos se armaba como `//terminos` (dirección de protocolo relativo hacia un sitio llamado “terminos”) y no funcionaba. Ahora es `/terminos`. Prueba en `client/test/storeNavigation.test.js`.

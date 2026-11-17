# MiTiendaYa 1.26.1

- **Corrección urgente:** la tienda pública no cargaba ("Preparando tu visita…") por una variable usada antes de declararse en `StoreLayout` (introducida en 1.26.0 con el aviso de cambios). Prueba de regresión en `client/test/version126.test.js`.

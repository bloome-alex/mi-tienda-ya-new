# Cambios 1.9.0 · unicidad por rama de categorías

## Categorías repetidas en ramas diferentes
La unicidad deja de aplicarse a `storeId + name` y pasa a aplicarse a `storeId + parentId + name` para categorías no archivadas. Esto equivale a exigir una ruta completa única: `Buzos > Naruto` y `Remeras > Naruto` pueden coexistir, mientras que dos `Naruto` bajo `Buzos` siguen siendo inválidas.

La regla funciona en cualquier profundidad y también al mover categorías. Si el destino ya tiene una categoría hermana con el mismo nombre, la operación se rechaza y se conserva la ubicación anterior.

## Actualización de MongoDB
En el arranque, `DatabaseIndexService` detecta el índice legado `storeId + name`, comprueba primero que no existan duplicados entre hermanos y elimina sólo ese índice antiguo. Después `Category.init()` crea `category_sibling_name_unique` sobre `storeId + parentId + name`.

No se eliminan categorías ni se reescriben rutas. Si una base fue modificada manualmente y contiene duplicados dentro de la misma rama, el arranque se detiene con un mensaje que identifica los conflictos para evitar pérdida de datos.

## Pruebas
`api/test/version19.test.js` cubre nombres repetidos en padres diferentes, rechazo entre hermanos, unicidad de raíces y movimientos conflictivos.

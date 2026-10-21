# Hotfix 1.8.1 · índice de UploadedImage.objectKey

## Problema corregido

La versión 1.8.0 declaraba `UploadedImage.objectKey` dos veces: como índice simple mediante `index: true` y como índice único parcial mediante `schema.index()`. Mongoose advertía la duplicación y, si MongoDB ya había creado `objectKey_1` como índice normal, el arranque fallaba al intentar crear otro índice con el mismo nombre y opciones diferentes.

## Corrección

- `objectKey` ya no declara `index: true` en el campo. Existe una sola definición del índice: única y parcial para valores string.
- Antes de inicializar el modelo, `DatabaseIndexService` inspecciona los índices existentes de `uploadedimages`.
- Si `objectKey_1` ya es el índice único parcial correcto, no hace nada.
- Si encuentra el índice legado simple, verifica primero que no haya `objectKey` duplicados, elimina únicamente ese índice y deja que Mongoose cree la definición correcta durante `UploadedImage.init()`.
- Si existen duplicados, la aplicación no borra datos automáticamente: cancela el arranque e informa hasta 10 claves conflictivas para que puedan revisarse.
- El proceso es idempotente y tolera que otra instancia haya eliminado el índice durante el mismo arranque.

## Actualización

No requiere migración manual cuando no existen `objectKey` duplicados. Reemplazá el código y reiniciá la API. En el primer arranque el índice legado se reconcilia automáticamente.

Para comprobar el índice luego del arranque:

```javascript
db.uploadedimages.getIndexes()
```

Debe existir `objectKey_1` con `unique: true` y `partialFilterExpression` para `objectKey` de tipo string.

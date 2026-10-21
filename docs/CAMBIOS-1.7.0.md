# mi-tienda-ya-2 · Cambios de la versión 1.7.0

## Corrección del editor de Textos

La sección **Diseño → Textos** ahora actualiza correctamente el borrador reactivo del diseñador. El problema estaba en el clonado previo a cada edición: el diseño recibido desde Vue es un `Proxy` reactivo y `structuredClone` no puede clonar directamente ese tipo de objeto en el navegador. La edición podía detenerse antes de emitir el nuevo diseño, por lo que no se actualizaba la vista previa ni se activaba **Guardar cambios**.

La actualización ahora se realiza sobre una copia serializable del contrato de diseño. Como el contrato sólo admite datos JSON, el resultado mantiene el aislamiento del borrador sin intentar clonar el `Proxy` de Vue.

Esto se aplica a todos los campos que aparecen en **Textos**, incluidos:

- textos comunes y navegación;
- portada, destacados, catálogo y pie;
- contacto y WhatsApp;
- producto, carrito y checkout;
- **Términos y condiciones**;
- diapositivas del carrusel;
- títulos, subtítulos, cuerpo y botones de secciones personalizadas;
- preguntas, respuestas, títulos y botones de complementos anidados;
- labels personalizados de redes sociales.

Al cambiar cualquiera de esos textos:

1. el borrador del diseño cambia inmediatamente;
2. el estado pasa a **Cambios sin guardar**;
3. se habilita **Guardar cambios**;
4. la vista previa recibe el nuevo diseño en tiempo real;
5. el guardado persiste el mismo valor que se visualizó en el editor.

## Compatibilidad

No hay migración de MongoDB ni cambios de esquema. Los diseños guardados en versiones anteriores siguen siendo compatibles mediante la normalización existente.

## Pruebas de regresión

Se agregó `client/test/version17.test.js` con cobertura específica para:

- edición de un diseño envuelto en un `Proxy`, reproduciendo el caso de Vue;
- recorrido de todos los campos publicados por el catálogo de Textos;
- detección de cambios para habilitar el guardado;
- Términos;
- secciones personalizadas;
- complementos anidados;
- textos del registro `copy` consumidos por la tienda pública.

En el entorno de preparación pasaron **51 pruebas del frontend que no requieren Vue instalado**, incluidas las seis nuevas de esta versión. La instalación completa de dependencias volvió a exceder el límite del entorno, por lo que no se incluye un `client/dist` de una versión anterior.

## Actualización desde v1.6.0

Respaldá tu `.env`, MongoDB y archivos persistentes. Reemplazá el código por esta versión y ejecutá:

```bash
npm ci
npm run build
npm start
```

Con PM2:

```bash
npm ci
npm run build
pm2 restart mi-tienda-ya-2 --update-env
```

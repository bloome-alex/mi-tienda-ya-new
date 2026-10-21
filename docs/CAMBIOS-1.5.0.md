# mi-tienda-ya-2 · Cambios de la versión 1.5.0

## Navegación de categorías en cabecera

- El hover se propaga a cada nivel del árbol: una subcategoría con hijos abre también su siguiente nivel al pasar el mouse.
- El mismo comportamiento se activa con foco de teclado.
- En dispositivos sin hover se mantiene el botón de expansión para conservar una interacción clara y accesible.

## Panel desplegable del catálogo

- El panel ya no ocupa espacio empujando las tarjetas ni usa un drawer global.
- Se superpone a los resultados del catálogo mediante la misma grilla del catálogo, por encima de las cards y sin cubrir el layout completo de la tienda.
- Diseño → Tienda → Catálogo permite elegir la animación **Deslizar**, **Aparecer** o **Expandir** y ajustar su duración entre 120 y 700 ms.
- `prefers-reduced-motion` desactiva las transiciones automáticamente.

## Textos

Se eliminó la descripción funcional que explicaba qué edita la sección Textos. La sección queda enfocada únicamente en sus controles.

## ABM de categorías

Las subcategorías ya no muestran un segundo chevron decorativo. El único chevron visible es el botón de expansión y aparece exclusivamente cuando la fila tiene hijos.

## Diseñador más compacto

- Se eliminó el encabezado “TU MARCA, TU ESTILO / Diseño de tu tienda / Personalizá cada detalle…”.
- El estado **Todo guardado / Cambios sin guardar** y **Guardar cambios** se ubicaron a la derecha de **Ver tienda** en la barra de estado de la tienda.
- Esto libera altura para la vista previa sin cambiar el scroll independiente de controles y preview.

## Datos y compatibilidad

No hay migración de MongoDB. Los dos campos nuevos del diseño son opcionales para documentos anteriores y se completan al normalizar:

- `shop.categoryPanelAnimation = "slide"`
- `shop.categoryPanelDuration = 260`

## Actualización

Conservá `.env`, MongoDB y la carpeta persistente de uploads. Reemplazá el código y ejecutá:

```bash
npm ci
npm run build
npm start
```

Si usás PM2, reiniciá el proceso habitual después del build.

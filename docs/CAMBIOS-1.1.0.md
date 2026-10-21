# Cambios de la versión 1.1.0

Esta versión mejora el espacio de trabajo del diseñador, incorpora apariencia clara y oscura, y amplía la organización y presentación del catálogo. Mantiene Vue con CSS propio, Express, MongoDB y los datos de las instalaciones existentes.

## Diseñador con vista previa permanente

El editor ocupa el espacio disponible debajo de la barra de navegación. Los controles tienen su propio desplazamiento y la tienda se recorre dentro de la vista previa. El tamaño del iframe se calcula a partir del ancho y del alto disponibles, tanto para escritorio como para teléfono.

En pantallas pequeñas, la vista previa queda arriba y los controles debajo, dentro de la misma área de trabajo. Se puede cambiar entre la simulación de escritorio y la de teléfono; en móviles se selecciona inicialmente teléfono.

La vista previa y los controles se sincronizan en ambos sentidos:

- Elegir **Tienda**, **Producto**, **Carrito** o **Checkout** abre esa página dentro de la vista previa.
- Navegar dentro de la tienda, incluido volver atrás o adelante, selecciona los controles de la página correspondiente.
- **Identidad** permite editar los ajustes de marca sobre la página que ya está abierta.
- La sincronización utiliza navegación interna y conserva el borrador del diseño. Cambiar de sección no guarda ni descarta los ajustes.

**Guardar diseño** sigue siendo la acción que aplica los cambios a la tienda. Se conserva la confirmación antes de salir o cambiar de tienda con ajustes pendientes. Para revisar el flujo completo de compra hace falta al menos un producto activo; el carrito de vista previa utiliza productos de esa tienda.

## Apariencia y navegación del panel

La plataforma adopta una identidad neutra con fondos, textos y controles preparados para modo claro y oscuro. El control de apariencia está disponible en la barra de navegación; la preferencia se conserva en el navegador. La opción inicial sigue la apariencia del dispositivo.

El selector de tienda se encuentra en la barra superior fija, junto al estado de publicación. En móviles se distribuye en una segunda fila para mantenerlo accesible mientras se trabaja. El menú lateral continúa fijo en escritorio y se abre mediante su botón en pantallas pequeñas.

En **Diseño → Identidad** se puede elegir el modo de color de la tienda: según el dispositivo, claro u oscuro. En el modo según el dispositivo también se puede habilitar el control para que el visitante cambie la apariencia; al fijar claro u oscuro se aplica la elección de la tienda. Se agregan tres estilos iniciales:

| Estilo | Apariencia |
| --- | --- |
| Estudio | Base negra y blanca, con tipografía moderna. |
| Contraste | Grises y una distribución minimalista. |
| Feria | Base neutra con un acento azul. |

## Categorías y subcategorías

El catálogo admite **dos niveles**: categoría principal y subcategoría. La gestión conserva el listado en tabla y los formularios de creación y edición en páginas propias.

Desde una categoría principal se puede crear una subcategoría. El formulario de producto ofrece un selector principal y otro de subcategoría. En la tienda, elegir una principal permite ver sus productos y los de sus subcategorías; después se puede filtrar por una subcategoría concreta.

Las categorías pertenecen a una misma tienda y no pueden formar ciclos ni superar los dos niveles. Una principal con subcategorías debe reorganizarse antes de eliminarla o convertirla en subcategoría. Las categorías existentes continúan como principales hasta que se les asigne una relación.

## Productos destacados

Desde el **listado de Productos** se puede activar o quitar el chip **Destacado** de cada fila, con guardado inmediato. El formulario también incorpora esa opción y el listado permite filtrar los destacados. El cambio rápido modifica únicamente esa marca, sin reemplazar stock ni variantes.

Los productos activos marcados se muestran en una sección propia de la tienda, antes del catálogo completo. Incluye hasta 12 productos, ordenados del más reciente al más antiguo; el bloque es independiente de los filtros y la página actual del catálogo. Se omite cuando no hay productos destacados disponibles.

En **Diseño → Tienda → Productos destacados** se configura su visibilidad y su título. Marcar un producto como destacado conserva su pertenencia al catálogo y su categoría. Los productos existentes no se marcan automáticamente.

## Actualizar una instalación existente

### Conservar configuración y datos

1. Respaldá la base MongoDB, el archivo `.env` y los archivos persistentes antes de reemplazar la aplicación. Detené el proceso anterior durante el reemplazo del código para que el arranque de esta versión prepare las referencias de categorías sin escrituras concurrentes.
2. Extraé el ZIP en una carpeta temporal y actualizá el código de la instalación. Conservá tu `.env`, los ajustes propios de PM2/proxy y los directorios de datos. Compará `.env.example` con tu configuración sin copiarlo encima del archivo existente.
3. Mantené `MONGODB_URI`, `ENCRYPTION_KEY`, `SESSION_SECRET` y las credenciales e identificadores de las integraciones. La clave de cifrado existente permite recuperar los secretos ya guardados. La contraseña vigente del administrador permanece en MongoDB.
4. Conservá `UPLOAD_DIR` y `WHATSAPP_DATA_PATH`, junto con su contenido. Si usás las rutas predeterminadas, se encuentran en `api/data/uploads` y `api/data/whatsapp`; preservá el directorio `api/data` completo.
5. Instalá las dependencias de esta versión, compilá el cliente y reiniciá con el mismo método de ejecución que utiliza la instalación.

Desde el directorio actualizado, para una instalación con PM2:

```bash
npm ci
npm run build
pm2 restart mi-tienda-ya-2 --update-env
```

Si ejecutás la aplicación con `npm start`, detené el proceso anterior durante el cambio, completá la instalación y compilación, y volvé a iniciarlo. Conservá el dominio y la conexión a la misma base de datos.

Con Docker Compose, mantené el mismo nombre de proyecto y los volúmenes `mongo_data` y `app_data`, y reconstruí la aplicación:

```bash
docker compose up -d --build app
```

La actualización no requiere borrar la base, recrear usuarios ni cargar la demostración. Tampoco requiere eliminar los volúmenes de Docker. Al iniciar, la aplicación prepara los nuevos campos de categorías y sus referencias preservando el catálogo. Los detalles de cada entorno están en [Instalación y despliegue](DESPLIEGUE.md).

### Adoptar la nueva paleta en tiendas existentes

Los colores, textos y ajustes personalizados almacenados se conservan. Las opciones nuevas reciben sus valores predeterminados; el modo oscuro adapta la presentación para mantener la legibilidad sin reemplazar los colores guardados.

Para aplicar la paleta neutra a una tienda existente:

1. Seleccioná la tienda en la barra superior y abrí **Diseño → Identidad**.
2. Elegí **Estudio** en “Un estilo para empezar”. Este preset ajusta paleta, tipografía, esquinas y distribución visual.
3. Revisá las cuatro páginas y las vistas de escritorio y teléfono. Ajustá el modo de color y la posibilidad de cambiarlo si corresponde.
4. Pulsá **Guardar diseño** cuando el resultado esté listo.

La elección del preset se puede revisar antes de guardar. Los productos, pedidos, usuarios y archivos de la tienda permanecen en su lugar.

## Comprobación después de actualizar

Comprobá `/api/health`, el acceso del administrador y la selección de tienda. Recorré el diseñador en escritorio y móvil, navegá entre producto, carrito y checkout, y verificá que los controles se sincronicen conservando un cambio pendiente. Revisá también el modo claro/oscuro, una categoría con subcategoría y un producto destacado en la tienda pública.

La guía [Pruebas y validación](PRUEBAS.md) reúne el recorrido de comprobación y las verificaciones de las integraciones que deben realizarse con las cuentas y el dominio de cada instalación.

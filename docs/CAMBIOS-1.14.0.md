# Cambios v1.14.0

## Branding y modo oscuro

- `MiTiendaYa` vuelve a un wordmark limpio: sin bordes alrededor de las letras. `MiTienda` toma el color de texto del tema y `Ya` usa el color principal, por lo que mantiene contraste tanto sobre superficies claras como oscuras.
- El modo oscuro vuelve a usar negros profundos (`#050607`, `#0c0e0f`, `#141719`). Los textos claros pasan a crema (`#f1e7d9`) para evitar blanco puro de alto contraste.
- Los estados recuperan acentos vivos controlados: verde para éxito, celeste para información, rojo para error y violeta para estados auxiliares, evitando saturaciones chillones.
- Los defaults/presets de nuevas tiendas y la pantalla offline usan la misma dirección visual. No se sobreescriben paletas personalizadas ya guardadas por una tienda.

## Planes convertidos en permisos reales

El modelo `Plan` incorpora:

- `featureKeys`: funcionalidades directas del plan.
- `inheritsPlanId`: plan base opcional.
- `features`: se conserva como representación legible/compatibilidad, pero ya no es la fuente de autorización.

`PlanFeatureService` resuelve la herencia de forma recursiva, impide ciclos y entrega las funcionalidades efectivas. Un plan hijo muestra `Incluye todo lo de <Plan base>` y solamente agrega sus permisos propios. Precio, duración y cupos no se heredan.

Los planes existentes que fueron creados antes de v1.14.0 reciben inicialmente todas las funcionalidades actuales para que una actualización no quite accesos de forma accidental.

### Catálogo inicial de funcionalidades vendibles

| Grupo | Funcionalidades |
| --- | --- |
| Secciones del panel | Productos, Categorías, Stock, Pedidos, Cobros y entregas, Diseño, Contacto, Dominio, Aplicación PWA |
| Dominio y publicación | Subdominio MiTiendaYa, dominio propio |
| Productos y catálogo | Variantes, productos digitales, destacados, relacionados |
| Ventas y cobros | Carga manual de pedidos, efectivo, transferencia/comprobantes, Mercado Pago Checkout Pro, formas de entrega configurables |
| Diseño y marketing | Secciones personalizadas, modo claro/oscuro, fondos, redes sociales, navegación avanzada de categorías, términos personalizados, WhatsApp flotante |

La regla para futuras funciones es registrar primero el permiso en `PlanFeatureService` y proteger tanto el acceso visual como la operación del backend.

## Aplicación efectiva de permisos

- El menú del vendedor oculta secciones no incluidas.
- Vue Router rechaza navegación directa a secciones fuera del plan.
- La API utiliza `requireFeature`/`requireAnyFeature` y devuelve `403 PLAN_FEATURE_REQUIRED` ante operaciones no habilitadas.
- Productos avanzados, formas de pago, entregas, secciones del diseñador, términos, WhatsApp, dominios, PWA y contacto público respetan los permisos efectivos.
- Dominios/subdominios dejan de resolver para la tienda cuando el plan ya no incluye esa capacidad.
- El manifest PWA no se publica si el plan no incluye PWA.
- La herencia se valida nuevamente en backend y el formulario evita ofrecer padres que formarían un ciclo.

## Detalles visuales de interacción

- Los botones secundarios sin relleno pasan a outlined para que se reconozcan como acciones.
- Links, botones, selects, checkboxes, radios, archivos, tabs, opciones y superficies realmente clickeables usan cursor `pointer`; controles deshabilitados usan `not-allowed`/estado correspondiente.

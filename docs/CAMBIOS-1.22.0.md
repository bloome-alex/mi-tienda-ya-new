# MiTiendaYa 1.22.0

## Publicidad y anuncios por nivel de plan

El catálogo comercial de planes incorpora tres funcionalidades acumulativas:

- `ads.limited` — **Publicidad y Anuncios Limitado**: Facebook Ads e Instagram Ads.
- `ads.premium` — **Publicidad y Anuncios Premium**: incluye Limitado y suma Google Ads.
- `ads.enterprise` — **Publicidad y Anuncios Empresarial**: incluye Premium y suma YouTube Ads y TikTok Ads.

Los niveles se resuelven en `PlanFeatureService`, siguiendo la misma estrategia acumulativa usada por los niveles de Diseño. El catálogo pasa a `featureSchemaVersion = 3`.

## Seguridad y permisos

La limitación no es solamente visual:

- `/app/social` requiere como mínimo `ads.limited` para vendedores.
- Facebook e Instagram exigen `ads.limited`.
- Google Ads exige `ads.premium`.
- YouTube Ads y TikTok Ads exigen `ads.enterprise`.
- Los callbacks OAuth vuelven a comprobar el permiso antes de completar una conexión.
- `GET /api/stores/:storeId/social` devuelve únicamente las redes habilitadas para el plan efectivo del vendedor.
- Administración conserva acceso completo para soporte y configuración.

Las conexiones existentes de una red que deje de estar incluida no se eliminan de MongoDB. Quedan preservadas para que puedan recuperarse al volver a un plan compatible.

## Migración de planes existentes

Al iniciar la versión 1.22.0, los planes con esquema anterior se migran automáticamente:

- nombres que contienen **Emprendedor** → `ads.limited`;
- nombres que contienen **Profesional** → `ads.premium`;
- nombres que contienen **Empresarial** o **Creador** → `ads.enterprise`;
- otros planes existentes → `ads.enterprise`, conservando el acceso publicitario que tenían antes de que el módulo quedara limitado por plan.

Luego se aplica la compactación normal de herencia, por lo que un plan hijo no guarda funcionalidades que ya recibe de su plan base.

## Home y comparación de planes

Las tres funcionalidades forman parte del catálogo normal de Planes, por lo que:

- pueden habilitarse/deshabilitarse desde Administración → Planes;
- permiten personalizar título y descripción comercial en las cards;
- aparecen en la comparación pública `/planes`;
- respetan la herencia de planes.

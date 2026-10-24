# Cambios 1.16.1

## ABM de tiendas para vendedores con múltiples tiendas

- Cuando el plan del vendedor admite más de una tienda (`maxStores > 1`), el menú ahora muestra **Tiendas**.
- `/app/stores` reutiliza el mismo ABM visual: Administración continúa viendo todas las tiendas y el vendedor sólo ve las propias.
- El vendedor puede crear, editar y archivar sus tiendas sin poder reasignar propietarios. La API nueva `/api/me/stores` vuelve a validar propietario y cuota en el backend.
- Las transferencias salientes de vendedores multi-tienda se gestionan desde el ABM: botón **Transferir**, estado **Pendiente de aceptación** y **Cancelar transferencia** mientras la solicitud siga pendiente.
- Una tienda con transferencia pendiente no puede archivarse hasta cancelar esa transferencia.
- Las transferencias entrantes continúan en el acceso de notificaciones del navbar, porque deben poder aceptarse incluso antes de que el destinatario tenga un ABM multi-tienda disponible.

La lógica se mantiene encapsulada mediante servicios orientados a objetos (`StoreManagementService`, `QuotaService` y `StoreTransferService`) y persiste sobre MongoDB sin migraciones destructivas.

## Reconexión automática de WhatsApp de administración

- Una vez que la API queda escuchando, `WhatsAppService` comprueba si `WHATSAPP_DATA_PATH` conserva una sesión `LocalAuth`.
- Si existe, intenta reconectar automáticamente después del arranque sin exigir volver a pulsar **Conectar**.
- Si el administrador pulsó **Desconectar**, se guarda una marca de desconexión manual y los reinicios posteriores no reconectan por sí solos.
- Pulsar **Conectar** nuevamente elimina esa marca y permite volver a vincular o reutilizar la sesión disponible.
- El cierre normal de PM2 destruye el cliente Chromium sin cerrar sesión, de modo que un reinicio conserva el emparejamiento.

## Actualización

Conservá `.env`, MongoDB y `WHATSAPP_DATA_PATH`, reemplazá el código por esta versión y ejecutá:

```bash
npm ci
npm run build
pm2 restart mi-tienda-ya --update-env
```

No se requiere migración de MongoDB.

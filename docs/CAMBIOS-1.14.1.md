# Cambios 1.14.1

## Hotfix WhatsApp / Puppeteer en servidores root

- Chromium ahora recibe los argumentos de servidor `--disable-dev-shm-usage`, `--disable-gpu`, `--no-first-run` y `--no-default-browser-check`.
- Si Node/PM2 corre con UID 0, la API detecta root automáticamente y agrega `--no-sandbox` y `--disable-setuid-sandbox`.
- `WHATSAPP_NO_SANDBOX=true` sigue disponible para contenedores u otros entornos que necesiten forzar ese comportamiento aun sin UID 0.
- No se agregó `--single-process`, porque puede volver inestable Chromium/WhatsApp Web y no es necesario para resolver el error de sandbox.

## Despliegue

No hace falta cambiar el `.env` si PM2 ya corre como root. Después de actualizar:

```bash
npm ci
npm run build
pm2 restart mi-tienda-ya-2 --update-env
```

Si el proceso no corre como root pero el entorno requiere Chromium sin sandbox, configurar explícitamente:

```dotenv
WHATSAPP_NO_SANDBOX=true
```

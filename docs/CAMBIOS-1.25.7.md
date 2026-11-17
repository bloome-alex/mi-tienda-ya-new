# MiTiendaYa 1.25.7

- **Subdominios de la plataforma con certificado propio.** Al elegir “Subdominio propio de la plataforma” (por ejemplo `cafe-aurora.mitiendaya.com.ar`) la tienda se marcaba “Activo” sin crear sitio en Nginx ni certificado: el servidor no tiene certificado comodín y el comprador veía un error de seguridad; además los mails y la vuelta de Mercado Pago usaban esa dirección. Ahora, con `DOMAIN_PROVISIONING_ENABLED=true`, el subdominio se aprovisiona con el mismo helper que los dominios propios y sólo queda activo cuando el certificado está listo. Si falla, queda “Error al activar” y la tienda sigue usando su enlace `/t/`. Al volver al enlace `/t/` se elimina el sitio aprovisionado. Sin aprovisionamiento automático (entornos con certificado comodín) se conserva el comportamiento anterior.
- **Validación del subdominio en el navegador.** El `pattern` del campo era inválido para Chrome (guion sin escapar con el flag `v`) y no se validaba del lado del cliente.

Pruebas: `api/test/subdomain-provisioning.test.js`.

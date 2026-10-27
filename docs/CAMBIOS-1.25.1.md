# MiTiendaYa 1.25.1

## Política de privacidad preparada para verificación OAuth de Google

La política pública se amplía con divulgaciones específicas sobre Google Ads y YouTube Ads: alcance OAuth solicitado, categorías de datos consultadas, finalidades, almacenamiento de tokens, metadatos y recursos publicitarios, transferencias, Limited Use, conservación, revocación y eliminación.

Se aclara expresamente que MiTiendaYa no solicita Gmail, Drive, Contactos ni Calendario; no vende datos obtenidos de Google; no los utiliza para retargeting o publicidad personalizada propia; no los utiliza para solvencia/crédito; y no los utiliza para entrenar modelos generalistas de IA/ML.

## HTML legal renderizado en servidor

`/politica-de-privacidad` y `/condiciones-del-servicio` ahora responden directamente con HTML completo generado en el servidor a partir del documento vigente en MongoDB. De esta forma los verificadores y crawlers reciben el texto legal dentro del cuerpo HTML inicial sin depender de ejecutar Vue ni de realizar una segunda llamada a la API.

Los alias `/privacidad` y `/terminos` redirigen permanentemente a sus URLs canónicas.

La salida HTML escapa todo contenido editable para impedir que un texto configurado por administración inyecte HTML o scripts.

## Migración

Se incorpora la revisión 2 del esquema de documentos legales. Al iniciar una instalación v1.25.0 existente, MiTiendaYa conserva los textos que el administrador ya haya modificado y agrega una sola vez las secciones de cumplimiento Google que falten. La migración queda persistida en MongoDB.

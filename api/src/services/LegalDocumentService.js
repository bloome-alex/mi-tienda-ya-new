const clone = value => structuredClone(value);

export const LEGAL_DOCUMENT_SCHEMA_VERSION = 2;

const privacySections = [
  {
    title: '1. Alcance de esta Política de Privacidad',
    content: `Esta Política de Privacidad explica de forma específica cómo MiTiendaYa accede, recopila, utiliza, almacena, protege, comparte y elimina información relacionada con administradores, vendedores, tiendas, clientes finales que compran en las tiendas publicadas y personas que interactúan con las funciones de la plataforma. Se aplica al sitio principal de MiTiendaYa, al panel de administración, al panel de vendedores, a las tiendas alojadas por la plataforma, a sus aplicaciones PWA y a las integraciones externas habilitadas voluntariamente por cada usuario.\n\nCuando un vendedor administra su propia tienda, es responsable de utilizar los datos de sus clientes de acuerdo con la normativa aplicable y con las finalidades informadas en su comercio. MiTiendaYa actúa como proveedor tecnológico respecto de muchos de esos tratamientos y como responsable directo respecto de los datos necesarios para prestar, asegurar, facturar y mejorar la plataforma.`
  },
  {
    title: '2. Información que podemos tratar',
    content: `Podemos tratar datos de cuenta y perfil, como nombre, correo electrónico, rol, estado de la cuenta, plan contratado y fechas vinculadas a la suscripción. Para administradores pueden existir credenciales de acceso protegidas mediante hash; para vendedores se pueden utilizar enlaces de acceso de un solo uso.\n\nTambién se procesan los datos necesarios para operar las tiendas: nombre, slug, dominio o subdominio, diseño, textos, productos, categorías, precios, variantes, stock, medios de pago, formas de entrega, datos de contacto, configuración PWA y demás preferencias comerciales.\n\nCuando un cliente final realiza un pedido, la tienda puede recopilar nombre, correo electrónico, teléfono, dirección, datos de entrega, artículos adquiridos, importes, estado del pedido y las evidencias necesarias para completarlo. MiTiendaYa no necesita almacenar números completos de tarjetas para ofrecer Checkout Pro de Mercado Pago.`
  },
  {
    title: '3. Autenticación, sesiones y acceso',
    content: `MiTiendaYa utiliza mecanismos de sesión para mantener el acceso autenticado. Los enlaces mágicos de vendedores son temporales y de un solo uso. La contraseña del administrador se almacena utilizando bcrypt y no como texto legible. Las sesiones y tokens sensibles deben transmitirse sobre HTTPS en producción.\n\nPodemos registrar información técnica necesaria para detectar accesos anómalos, aplicar límites de solicitudes, investigar fallos y mantener la trazabilidad de acciones administrativas. El usuario es responsable de proteger el acceso a su correo, dispositivos y cuentas de terceros vinculadas.`
  },
  {
    title: '4. Pedidos, clientes y operaciones comerciales',
    content: `Los datos de compradores se utilizan para permitir la creación, seguimiento, preparación, cobro y entrega de pedidos; informar estados; gestionar comprobantes y resolver incidencias. Las tiendas son responsables de definir sus propias condiciones comerciales, políticas de cambios, devoluciones, entrega y cualquier información legal que corresponda a su actividad.\n\nMiTiendaYa conserva información de pedidos y auditoría mientras resulte necesaria para la operación, seguridad, soporte, cumplimiento de obligaciones y resolución de controversias, sujeto a las políticas de conservación vigentes.`
  },
  {
    title: '5. Mercado Pago, cobros y suscripciones',
    content: `MiTiendaYa puede integrarse con Mercado Pago para el cobro de pedidos de las tiendas y para las suscripciones de la propia plataforma. Las credenciales que deban recuperarse para operar se almacenan cifradas. Los webhooks se validan utilizando los mecanismos disponibles para reducir el riesgo de aceptar eventos falsificados.\n\nCada vendedor puede vincular una o más cuentas de Mercado Pago cuando la funcionalidad esté disponible en su plan. Los datos de tarjetas y otros medios sensibles utilizados por el comprador son procesados por Mercado Pago conforme a sus propias políticas y estándares. MiTiendaYa puede conservar identificadores de transacciones, estados, importes y referencias necesarias para conciliar pagos sin almacenar los datos completos de una tarjeta.`
  },
  {
    title: '6. Publicidad e integraciones con redes sociales',
    content: `Cuando un vendedor decide conectar Facebook Ads, Instagram Ads, Google Ads, YouTube Ads, TikTok Ads u otra integración publicitaria compatible, MiTiendaYa utiliza procesos de autorización OAuth o mecanismos equivalentes para acceder únicamente a los recursos y permisos aprobados por ese usuario. La conexión es voluntaria y se inicia desde la sección de publicidad de una tienda.\n\nPodemos almacenar de forma cifrada tokens de acceso o actualización, identificadores de cuentas publicitarias, páginas, perfiles, campañas, grupos de anuncios, anuncios y activos relacionados. Estos datos se utilizan para listar recursos autorizados, crear o administrar campañas solicitadas por el vendedor, consultar su estado y mantener la integración. MiTiendaYa no necesita ni solicita la contraseña de la red social o cuenta publicitaria del vendedor.\n\nLos costos publicitarios, métodos de pago, políticas de anuncios y revisiones de contenido dependen de cada proveedor externo. El vendedor puede revocar permisos desde MiTiendaYa o desde la configuración de la plataforma externa, según las capacidades disponibles.`
  },
  {
    title: '7. Google Ads y datos de usuario de Google a los que accede MiTiendaYa',
    content: `La integración con Google Ads y YouTube Ads utiliza OAuth 2.0 y solicita el alcance https://www.googleapis.com/auth/adwords. Ese permiso permite a MiTiendaYa actuar sobre las cuentas de Google Ads que el propio vendedor autoriza. MiTiendaYa no solicita acceso a Gmail, Google Drive, Contactos, Calendario, contraseñas de Google ni a otros contenidos de la cuenta de Google que no sean necesarios para la funcionalidad de Google Ads.\n\nA través de Google Ads API, MiTiendaYa puede consultar los identificadores de clientes de Google Ads accesibles por la autorización, el nombre descriptivo de la cuenta, moneda, estado, si una cuenta es administradora o de prueba y, cuando corresponde, relaciones de acceso entre una cuenta administradora y sus cuentas cliente. También puede recibir o consultar identificadores y estados de los recursos publicitarios que el usuario crea o administra mediante MiTiendaYa.\n\nLa autorización puede incluir un access token temporal y un refresh token para acceso sin conexión. Estos tokens permiten que las funciones visibles de MiTiendaYa continúen operando sobre la cuenta seleccionada sin pedir un nuevo inicio de sesión en cada acción.`
  },
  {
    title: '8. Cómo utiliza MiTiendaYa los datos obtenidos de Google',
    content: `MiTiendaYa utiliza la información recibida de Google exclusivamente para proporcionar y mantener funciones visibles solicitadas por el vendedor dentro de la sección Publicidad y Anuncios. En concreto, se utiliza para: descubrir las cuentas de Google Ads a las que el usuario concedió acceso; mostrar esas cuentas para que el vendedor elija cuál vincular a su tienda; comprobar que la cuenta seleccionada está activa; mantener la autorización; y ejecutar las operaciones publicitarias que el vendedor inicia desde la interfaz.\n\nCuando el vendedor crea una publicidad, MiTiendaYa puede enviar a Google Ads la configuración elegida para esa campaña, por ejemplo presupuesto, país o ubicación, palabras clave, textos, URL de destino, recursos del producto y otros datos necesarios para crear presupuestos, campañas, grupos de anuncios, criterios y anuncios. Para YouTube Ads también puede utilizar un video y recursos gráficos indicados por el vendedor para crear una campaña compatible de Google Ads.\n\nMiTiendaYa no utiliza datos obtenidos de Google para finalidades ocultas o incompatibles con la función que el usuario autorizó.`
  },
  {
    title: '9. Qué datos de Google se almacenan y dónde',
    content: `Para conservar una conexión activa, MiTiendaYa almacena en MongoDB el proveedor conectado, la tienda asociada, los permisos concedidos, la fecha de expiración del token, los identificadores y metadatos básicos de las cuentas de Google Ads accesibles, la cuenta publicitaria seleccionada y, cuando aplica, el identificador de la cuenta administradora. Los access tokens y refresh tokens se almacenan cifrados mediante la clave de cifrado de la instalación y no se entregan al navegador ni se muestran en la interfaz.\n\nCuando una campaña se crea desde MiTiendaYa, podemos conservar un registro operativo con el proveedor, producto relacionado, nombre, presupuesto, moneda, destino, país, estado y los identificadores externos de recursos como presupuesto, campaña, grupo de anuncios, criterio o anuncio. Estos identificadores se conservan para mostrar el resultado al vendedor, mantener trazabilidad y relacionar la operación local con los recursos existentes en Google Ads.\n\nLas credenciales OAuth se utilizan desde el servidor. El Client Secret de Google y las claves de cifrado son secretos de la instalación y no forman parte de la información pública ni se envían al cliente web.`
  },
  {
    title: '10. Compartición y transferencia de datos obtenidos de Google',
    content: `MiTiendaYa no vende, alquila ni entrega datos de usuario obtenidos de Google a corredores de datos, revendedores de información ni terceros para sus propios fines. Tampoco utiliza ni transfiere esos datos para evaluar solvencia, otorgar créditos, crear perfiles de vigilancia, retargeting, publicidad personalizada o basada en intereses, ni para entrenar, desarrollar o mejorar modelos generalistas de inteligencia artificial o aprendizaje automático.\n\nLos datos pueden ser procesados por proveedores de infraestructura que resulten estrictamente necesarios para operar MiTiendaYa, sujetos a medidas de seguridad y confidencialidad apropiadas, o cuando sea necesario para seguridad, prevención de abuso o cumplimiento de una obligación legal. Google recibe las solicitudes que el vendedor ordena porque es el proveedor de Google Ads API y el destino de las operaciones publicitarias autorizadas.\n\nEl uso de MiTiendaYa de la información recibida desde las APIs de Google cumplirá con Google API Services User Data Policy, incluidos los requisitos de Limited Use. Los empleados, agentes o contratistas que deban intervenir en soporte o seguridad están sujetos a restricciones de acceso y solo deben acceder a la información cuando exista una necesidad legítima y autorizada.`
  },
  {
    title: '11. Conservación, revocación y eliminación de datos de Google',
    content: `Las credenciales y metadatos de la integración de Google se conservan mientras la conexión permanezca activa y sean necesarios para ofrecer la funcionalidad solicitada. Si el vendedor desconecta Google Ads o YouTube Ads desde MiTiendaYa, la integración local correspondiente se elimina, incluyendo los tokens OAuth y la información actual de cuentas accesibles almacenada dentro de esa conexión.\n\nEl usuario también puede revocar el acceso de MiTiendaYa desde los controles de seguridad y conexiones de su Cuenta de Google. Cuando Google revoca o invalida un token, MiTiendaYa deja de poder utilizarlo y puede solicitar que el vendedor vuelva a conectar la integración.\n\nLos registros históricos de campañas creadas, auditoría o incidencias pueden conservar identificadores técnicos e información no credencial durante el período necesario para soporte, seguridad, trazabilidad, cumplimiento o resolución de disputas. El usuario puede solicitar la eliminación de datos personales conforme a la sección de derechos de esta política, sujeto a las excepciones legales, contables y de seguridad aplicables.`
  },
  {
    title: '12. Control del usuario y consentimiento para las integraciones',
    content: `MiTiendaYa solicita autorización de Google en el contexto de la función que la necesita. El vendedor decide si conecta la integración y qué cuenta publicitaria utiliza. El permiso de Google Ads no es necesario para usar las funciones generales de creación y administración de tiendas que no dependan de Google Ads.\n\nAntes de ejecutar acciones publicitarias, MiTiendaYa exige que exista una conexión válida y una cuenta de Google Ads seleccionada. Las campañas se crean como resultado de una acción del vendedor desde la interfaz; MiTiendaYa no debe iniciar campañas publicitarias nuevas de manera autónoma sin una solicitud del usuario. El vendedor puede desconectar la integración cuando ya no desee utilizarla.`
  },
  {
    title: '13. WhatsApp, correo electrónico y comunicaciones',
    content: `La plataforma puede utilizar SMTP para enviar enlaces de acceso, avisos operativos, confirmaciones de pedidos, comunicaciones de suscripción y campañas informativas dirigidas a vendedores. La integración con WhatsApp puede mantener una sesión vinculada para las funciones habilitadas por la aplicación.\n\nLos vendedores deben utilizar estas herramientas únicamente para comunicaciones legítimas, respetando las preferencias de sus clientes y las políticas de los proveedores correspondientes. MiTiendaYa puede registrar estados técnicos y errores de envío para diagnóstico.`
  },
  {
    title: '14. Archivos, imágenes, comprobantes y Cloudflare R2',
    content: `MiTiendaYa puede almacenar imágenes de productos, logos, fondos, archivos de configuración visual y otros recursos en Cloudflare R2 u otro almacenamiento compatible. Los comprobantes de pago y otros documentos sensibles deben mantenerse en almacenamiento privado y servirse únicamente mediante rutas autenticadas o URLs temporales cuando corresponda.\n\nLa plataforma intenta eliminar los objetos asociados cuando un recurso se reemplaza o elimina y dispone de mecanismos de limpieza para reducir archivos huérfanos. Sin embargo, pueden existir copias temporales, respaldos o registros técnicos durante un período limitado por razones operativas y de seguridad.`
  },
  {
    title: '15. Dominios, subdominios y aplicaciones PWA',
    content: `Una tienda puede publicarse bajo rutas de MiTiendaYa, subdominios administrados o dominios propios cuando la funcionalidad esté habilitada. Para validar un dominio propio pueden procesarse nombres de host, tokens de verificación, resultados DNS, estados de aprovisionamiento y datos técnicos necesarios para configurar HTTPS.\n\nLas aplicaciones PWA pueden almacenar en el dispositivo del visitante ciertos recursos para mejorar la experiencia y permitir capacidades propias de una aplicación web instalable. El navegador y el sistema operativo controlan parte de ese almacenamiento local.`
  },
  {
    title: '16. Reportes de errores y soporte',
    content: `Los vendedores pueden enviar reportes de errores con comentarios, imágenes o GIFs. Estos reportes pueden incluir información de la tienda y del usuario que los envía, fecha, estado, notas administrativas y archivos adjuntos. Se utilizan para reproducir problemas, brindar soporte y planificar correcciones en versiones futuras.\n\nAntes de adjuntar una captura, el vendedor debe evitar incluir contraseñas, datos completos de tarjetas u otra información sensible que no sea necesaria para diagnosticar el problema.`
  },
  {
    title: '17. Auditoría y trazabilidad',
    content: `MiTiendaYa registra eventos relevantes de administración y operación para mantener trazabilidad, investigar incidentes y facilitar soporte. Los registros pueden incluir quién realizó una acción, sobre qué tienda o entidad, cuándo ocurrió y determinados cambios antes/después cuando el sistema los registra.\n\nLa auditoría no se utiliza para almacenar deliberadamente secretos en texto legible. Determinados campos sensibles se excluyen o protegen de acuerdo con su naturaleza.`
  },
  {
    title: '18. Medidas de seguridad',
    content: `La seguridad se implementa mediante varias capas. Entre las medidas contempladas por MiTiendaYa se encuentran: uso de HTTPS en producción; cookies de sesión con atributos de seguridad; protección CSRF para operaciones autenticadas; CORS restringido a orígenes autorizados; encabezados de seguridad mediante Helmet; políticas de seguridad de contenido; límites de solicitudes; validación de entradas; control de roles y permisos; comprobación de acceso a tiendas; cuotas por plan; hash de contraseñas con bcrypt; cifrado de secretos recuperables; validación de webhooks; almacenamiento privado de comprobantes; restricciones de tipos y tamaños de archivos; y auditoría de operaciones relevantes.\n\nLos tokens OAuth de integraciones como Google Ads se almacenan cifrados y se seleccionan explícitamente fuera de las respuestas normales de MongoDB para reducir exposiciones accidentales. El acceso desde el navegador se limita a metadatos no secretos necesarios para mostrar el estado de la conexión.\n\nNingún sistema puede garantizar seguridad absoluta. MiTiendaYa mantiene una estrategia de reducción de riesgo y puede actualizar estas medidas a medida que evoluciona la plataforma.`
  },
  {
    title: '19. Proveedores y servicios de terceros',
    content: `Para prestar determinadas funciones pueden intervenir proveedores como servicios de infraestructura y DNS, Cloudflare R2, proveedores SMTP, Mercado Pago, Meta, Google y TikTok. Cada tercero trata información conforme a sus propios términos, políticas de privacidad y ubicaciones de procesamiento.\n\nMiTiendaYa procura compartir con cada proveedor solamente la información necesaria para la funcionalidad solicitada y utiliza credenciales con el alcance más reducido razonablemente posible.`
  },
  {
    title: '20. Conservación y eliminación',
    content: `Los datos se conservan durante el tiempo necesario para mantener la cuenta, operar las tiendas, cumplir obligaciones, procesar suscripciones, resolver disputas, prevenir fraude y mantener la seguridad. Algunos registros pueden conservarse durante un período adicional cuando exista una obligación legal o una necesidad legítima de auditoría.\n\nLa eliminación de una cuenta o integración puede implicar la revocación o eliminación de credenciales y la programación de limpieza de archivos. Determinados datos transaccionales o de auditoría pueden no eliminarse inmediatamente cuando deban conservarse por razones legales, contables o de seguridad.`
  },
  {
    title: '21. Derechos y consultas sobre datos personales',
    content: `Las personas pueden solicitar información, actualización, rectificación o eliminación de sus datos cuando corresponda conforme a la normativa aplicable. Si la solicitud se relaciona con datos de un comprador dentro de una tienda, puede ser necesario coordinarla con el vendedor responsable de esa tienda.\n\nLas solicitudes deben enviarse utilizando los datos de contacto publicados por MiTiendaYa. Podemos solicitar información razonable para verificar identidad y evitar entregar o modificar datos de una persona a un tercero no autorizado.`
  },
  {
    title: '22. Menores de edad',
    content: `MiTiendaYa está orientado a personas y organizaciones con capacidad para administrar una actividad comercial. Los vendedores son responsables de cumplir las reglas aplicables cuando sus productos, servicios o clientes involucren menores de edad. No se debe utilizar la plataforma para recopilar de forma indebida información de menores.`
  },
  {
    title: '23. Cambios a esta política',
    content: `Esta Política puede actualizarse cuando cambien las funcionalidades, proveedores, medidas de seguridad, alcance de permisos de Google u otros requisitos legales o de plataforma. La fecha visible en esta página indica la última actualización publicada. Cuando un cambio sea material, MiTiendaYa puede comunicarlo mediante el panel, correo electrónico, novedades de versión u otro canal razonable y, cuando una nueva finalidad requiera consentimiento adicional, solicitarlo antes de utilizar los datos para esa finalidad.`
  },
  {
    title: '24. Contacto',
    content: `Para consultas relacionadas con privacidad, seguridad, tratamiento de datos o el uso de datos obtenidos mediante APIs de Google, utilizá los canales de contacto publicados en MiTiendaYa. El administrador de la plataforma puede actualizar esos datos desde la configuración general.`
  }
];

const termsSections = [
  {
    title: '1. Aceptación y alcance de las condiciones',
    content: `Estas Condiciones del Servicio regulan el acceso y uso de MiTiendaYa, incluyendo el sitio principal, panel de administración, panel de vendedores, tiendas publicadas, PWA, herramientas de diseño, gestión comercial, suscripciones e integraciones externas. Al crear una cuenta, utilizar un acceso habilitado o continuar usando la plataforma, el usuario declara comprender y aceptar estas condiciones.\n\nLas condiciones particulares publicadas por cada tienda para sus compradores son responsabilidad de su vendedor y pueden complementar, pero no reemplazar, estas condiciones de la plataforma.`
  },
  {
    title: '2. Roles dentro de MiTiendaYa',
    content: `La plataforma contempla un rol administrador y roles vendedores. El administrador configura la plataforma, planes, funcionalidades, comunicaciones, integraciones globales y otros parámetros operativos. Los vendedores administran las tiendas que tienen asignadas conforme a su plan y permisos.\n\nCada usuario debe utilizar únicamente las funciones para las que tiene autorización. Los accesos no deben compartirse de forma que permita eludir controles de seguridad, límites de plan o responsabilidades asignadas.`
  },
  {
    title: '3. Registro, acceso y seguridad de la cuenta',
    content: `El usuario debe proporcionar información válida y mantenerla actualizada. Los vendedores pueden autenticarse mediante enlaces temporales enviados a su correo; el administrador utiliza credenciales protegidas. El usuario es responsable de conservar la seguridad de su correo electrónico, dispositivos y cuentas externas vinculadas.\n\nMiTiendaYa puede invalidar sesiones, bloquear accesos o solicitar medidas adicionales cuando detecte actividad sospechosa, abuso, incumplimientos o riesgos para la plataforma y sus usuarios.`
  },
  {
    title: '4. Pruebas, planes, límites y funcionalidades',
    content: `MiTiendaYa puede ofrecer un período de prueba y distintos planes comerciales. Cada plan puede definir cantidad de tiendas, productos, formas de pago, formas de entrega y funcionalidades habilitadas. Cuando un límite configurable tenga valor 0 y la interfaz lo identifique como ilimitado, no se aplica un tope por esa característica, sin perjuicio de límites razonables de infraestructura, seguridad y uso justo.\n\nLos planes pueden ser visibles u ocultos, heredar funcionalidades de otros planes y cambiar con el tiempo. Las condiciones aplicables a una suscripción son las informadas al momento de su contratación o renovación, salvo cambios acordados o exigidos por ley.`
  },
  {
    title: '5. Suscripciones y facturación de MiTiendaYa',
    content: `Las suscripciones pueden cobrarse mediante Mercado Pago u otros proveedores habilitados. El precio, periodicidad, período de gracia y estado de la vinculación se muestran en la plataforma. Si un cobro falla, MiTiendaYa puede aplicar reintentos, períodos de cortesía y restricciones al finalizar dicho período.\n\nEl vendedor puede cancelar una vinculación cuando la funcionalidad lo permita. La cancelación no implica necesariamente devolución de importes ya devengados ni elimina automáticamente el período ya abonado. Los estados definitivos dependen también de la confirmación del proveedor de pagos.`
  },
  {
    title: '6. Creación y administración de tiendas',
    content: `El vendedor puede crear y administrar tiendas dentro de los límites de su plan. Es responsable del nombre, identidad visual, textos, productos, precios, stock, imágenes, categorías, medios de contacto, políticas comerciales y cualquier contenido publicado. Debe contar con los derechos necesarios sobre marcas, imágenes, textos, diseños y materiales que cargue.\n\nMiTiendaYa puede ofrecer herramientas de diseño, fondos, secciones, textos centralizados, navegación, productos destacados y otras opciones de presentación. Estas herramientas no garantizan por sí mismas el cumplimiento legal del comercio del vendedor.`
  },
  {
    title: '7. Productos, stock y pedidos',
    content: `MiTiendaYa permite administrar productos físicos y digitales, variantes, stock, fabricación a pedido y productos relacionados. El vendedor es responsable de la exactitud de precios, disponibilidad, descripciones y condiciones de venta.\n\nLos pedidos creados por clientes o manualmente deben gestionarse de buena fe. La plataforma facilita estados, seguimiento, entrega y registro operativo, pero la relación comercial por el producto o servicio se celebra entre el vendedor y su cliente salvo que se informe expresamente algo diferente.`
  },
  {
    title: '8. Pagos de clientes y Mercado Pago',
    content: `Las tiendas pueden configurar medios como efectivo, transferencia y Mercado Pago. Cuando se utiliza Checkout Pro u otra solución externa, la transacción es procesada por el proveedor correspondiente. El vendedor es responsable de configurar correctamente sus cuentas, datos bancarios, webhooks, credenciales y reglas de cobro.\n\nMiTiendaYa no garantiza la aprobación de pagos, disponibilidad de fondos, devoluciones o resolución de disputas administradas por el proveedor. Los vendedores deben cumplir las políticas de Mercado Pago y cualquier obligación fiscal o comercial aplicable.`
  },
  {
    title: '9. Formas de entrega y productos digitales',
    content: `El vendedor configura las formas de entrega disponibles, costos, retiro y condiciones especiales. Debe informar plazos y restricciones con claridad. En productos digitales puede configurarse un enlace de entrega que se comunica al comprador cuando corresponde; el vendedor es responsable de que dicho contenido sea legítimo, seguro, accesible y coincida con lo ofrecido.`
  },
  {
    title: '10. Dominios, subdominios y certificados',
    content: `MiTiendaYa puede permitir subdominios administrados y dominios propios. El vendedor es responsable de mantener bajo su control el dominio propio, renovar su registro y configurar los DNS solicitados. La plataforma puede validar propiedad mediante registros DNS y automatizar configuraciones de Nginx o certificados cuando la infraestructura lo permita.\n\nLa propagación DNS, disponibilidad de registradores, autoridades certificadoras y otros servicios externos puede producir demoras ajenas a MiTiendaYa.`
  },
  {
    title: '11. Aplicaciones PWA',
    content: `Cuando el plan lo habilita, una tienda puede ofrecer una experiencia PWA instalable. El comportamiento final depende del navegador y sistema operativo del visitante. MiTiendaYa puede actualizar manifest, iconos y service worker para mantener compatibilidad, seguridad y funcionamiento.`
  },
  {
    title: '12. Publicidad y anuncios',
    content: `Los planes pueden habilitar integraciones con Facebook, Instagram, Google Ads, YouTube y TikTok. El vendedor debe conectar cuentas sobre las que tenga autorización y aceptar los permisos solicitados por cada proveedor. MiTiendaYa puede crear campañas y anuncios siguiendo las instrucciones del vendedor y, cuando sea posible, dejarlos pausados para revisión inicial.\n\nEl vendedor es responsable del presupuesto, facturación, segmentación, contenido, derechos sobre los materiales, cumplimiento de políticas publicitarias y resultados de las campañas. Meta, Google, TikTok y otros proveedores pueden rechazar, limitar, suspender o cobrar campañas conforme a sus propias políticas. MiTiendaYa no garantiza aprobación, alcance, conversiones ni rentabilidad.`
  },
  {
    title: '13. Redes sociales, WhatsApp y correo electrónico',
    content: `Las integraciones de redes, WhatsApp y correo dependen de servicios de terceros y de sus reglas. El vendedor solo debe contactar personas cuando cuente con una base legítima para hacerlo y debe respetar solicitudes de baja, privacidad y políticas anti-spam.\n\nMiTiendaYa puede suspender funcionalidades de comunicación cuando detecte abuso, envío malicioso o riesgo de bloqueo de infraestructura compartida.`
  },
  {
    title: '14. Transferencia de tiendas',
    content: `Cuando el plan incluya transferencia de tiendas, el titular puede iniciar una transferencia a otro vendedor mediante el correo de destino. Hasta que el destinatario acepte y cumpla los requisitos del plan, la transferencia permanece pendiente y la titularidad operativa continúa según lo informado por la plataforma.\n\nUna vez aceptada la transferencia, el usuario anterior puede perder acceso a la tienda. Las partes son responsables de verificar que la transferencia refleje su acuerdo comercial y de conservar la información que necesiten antes de completarla.`
  },
  {
    title: '15. Reportes de errores, soporte y versiones',
    content: `Los vendedores pueden reportar errores con comentarios y material visual. MiTiendaYa puede clasificar, investigar y resolver esos reportes en versiones posteriores sin que el envío implique un plazo garantizado de resolución. Las novedades pueden comunicarse mediante el panel, emails o notas de versión.\n\nEl usuario debe describir los problemas de buena fe y evitar adjuntar secretos o información personal innecesaria.`
  },
  {
    title: '16. Uso aceptable y actividades prohibidas',
    content: `No se puede utilizar MiTiendaYa para actividades ilegales, fraude, phishing, malware, explotación de vulnerabilidades, acceso no autorizado, evasión de límites, suplantación, infracción de propiedad intelectual, spam, comercio de bienes prohibidos ni contenido que viole derechos de terceros. Tampoco se permite afectar deliberadamente la estabilidad, seguridad o reputación de la infraestructura compartida.\n\nMiTiendaYa puede bloquear contenidos, integraciones o cuentas cuando sea razonablemente necesario para proteger a usuarios, terceros o la plataforma.`
  },
  {
    title: '17. Propiedad intelectual',
    content: `El vendedor conserva los derechos que le correspondan sobre sus marcas, textos, imágenes y contenidos. Otorga a MiTiendaYa una autorización limitada para almacenar, reproducir, transformar técnicamente y mostrar esos materiales únicamente en la medida necesaria para prestar el servicio.\n\nEl software, identidad, componentes, documentación y materiales propios de MiTiendaYa permanecen protegidos por los derechos que correspondan y no se transfieren al usuario por el uso de la plataforma.`
  },
  {
    title: '18. Disponibilidad, mantenimiento y cambios técnicos',
    content: `MiTiendaYa procura mantener el servicio disponible, pero puede realizar mantenimiento, actualizaciones, migraciones, cambios de API, correcciones de seguridad o suspensiones temporales. Algunas funciones dependen de MongoDB, proveedores de infraestructura, DNS, Cloudflare, SMTP, Mercado Pago, Meta, Google, TikTok, WhatsApp u otros terceros.\n\nNo se garantiza disponibilidad ininterrumpida ni compatibilidad indefinida con servicios externos que modifiquen sus APIs, permisos, precios o políticas.`
  },
  {
    title: '19. Seguridad, copias y responsabilidad del usuario',
    content: `MiTiendaYa implementa controles técnicos razonables como cifrado de secretos recuperables, hash de contraseñas, protección de sesiones, validaciones, límites de solicitudes, controles de autorización, almacenamiento privado de comprobantes y auditoría. Aun así, ningún sistema es invulnerable.\n\nEl usuario debe mantener copias de la información que resulte crítica para su negocio cuando corresponda, proteger sus credenciales y notificar rápidamente cualquier acceso no autorizado o incidente relevante.`
  },
  {
    title: '20. Suspensión y finalización',
    content: `MiTiendaYa puede suspender o limitar el acceso por falta de pago, vencimiento de plan, incumplimiento de estas condiciones, riesgo de seguridad, requerimiento legal o abuso. Cuando sea razonable se intentará informar al usuario y permitir la regularización.\n\nLa finalización del servicio puede implicar despublicar tiendas, revocar integraciones y eliminar datos conforme a la política de conservación. Determinados registros pueden mantenerse cuando exista una obligación legal, contable o de seguridad.`
  },
  {
    title: '21. Limitación razonable de responsabilidad',
    content: `MiTiendaYa es una herramienta tecnológica para facilitar la gestión de tiendas. En la medida permitida por la legislación aplicable, no responde por pérdidas derivadas de decisiones comerciales del vendedor, contenido publicado por usuarios, incumplimientos entre vendedor y comprador, rechazo de anuncios, bloqueos de terceros, fallas de proveedores externos, interrupciones fuera de su control o lucro cesante indirecto.\n\nNada de estas condiciones limita derechos inderogables que correspondan a consumidores u otras personas conforme a la normativa aplicable.`
  },
  {
    title: '22. Privacidad y protección de datos',
    content: `El tratamiento de datos personales se describe en la Política de Privacidad de MiTiendaYa. Los vendedores también son responsables de informar adecuadamente a sus compradores sobre el uso de datos dentro de su propia actividad comercial.`
  },
  {
    title: '23. Modificaciones de estas condiciones',
    content: `MiTiendaYa puede actualizar estas condiciones cuando cambien funcionalidades, planes, proveedores, medidas de seguridad o requisitos legales. La fecha publicada indica la última actualización. Los cambios materiales pueden comunicarse mediante la plataforma o los canales de contacto disponibles.`
  },
  {
    title: '24. Legislación y contacto',
    content: `Estas condiciones se interpretan de acuerdo con la legislación aplicable en la República Argentina, sin limitar derechos inderogables que pudieran corresponder según el domicilio o la condición del usuario. Para consultas sobre estas condiciones, utilizá los datos de contacto publicados por MiTiendaYa.`
  }
];

export const defaultLegalDocuments = Object.freeze({
  schemaVersion: LEGAL_DOCUMENT_SCHEMA_VERSION,
  privacy: {
    enabled: true,
    title: 'Política de Privacidad de MiTiendaYa',
    intro: 'En MiTiendaYa tratamos la privacidad y la seguridad como parte del diseño de la plataforma. Esta política describe qué información puede procesarse, para qué se utiliza, cómo se protege y qué sucede cuando conectás servicios externos.',
    updatedAt: '2026-10-27',
    sections: privacySections
  },
  terms: {
    enabled: true,
    title: 'Condiciones del Servicio de MiTiendaYa',
    intro: 'Estas condiciones explican las reglas de uso de MiTiendaYa y las responsabilidades asociadas a la administración de tiendas, suscripciones, pagos, dominios, publicidad e integraciones con servicios de terceros.',
    updatedAt: '2026-10-27',
    sections: termsSections
  }
});

export class LegalDocumentService {
  normalize(input = {}) {
    const output = { schemaVersion: LEGAL_DOCUMENT_SCHEMA_VERSION };
    for (const key of ['privacy', 'terms']) {
      const fallback = defaultLegalDocuments[key];
      const supplied = input?.[key] && typeof input[key] === 'object' ? input[key] : {};
      const sections = Array.isArray(supplied.sections) && supplied.sections.length
        ? supplied.sections.map(section => ({ title: String(section?.title || '').trim(), content: String(section?.content || '').trim() })).filter(section => section.title && section.content)
        : clone(fallback.sections);
      output[key] = {
        enabled: supplied.enabled !== false,
        title: String(supplied.title || fallback.title).trim(),
        intro: String(supplied.intro || fallback.intro).trim(),
        updatedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(supplied.updatedAt || '')) ? String(supplied.updatedAt) : fallback.updatedAt,
        sections
      };
    }
    const sourceVersion = Number(input?.schemaVersion || 1);
    if (sourceVersion < 2) {
      const normalizeTitle = title => String(title || '').replace(/^\d+\.\s*/, '').trim();
      const existingTitles = new Set(output.privacy.sections.map(section => normalizeTitle(section.title).toLowerCase()));
      const complianceTitles = new Set(['google ads y datos de usuario de google a los que accede mitiendaya','cómo utiliza mitiendaya los datos obtenidos de google','qué datos de google se almacenan y dónde','compartición y transferencia de datos obtenidos de google','conservación, revocación y eliminación de datos de google','control del usuario y consentimiento para las integraciones']);
      const missingCompliance = defaultLegalDocuments.privacy.sections.filter(section => {
        const normalizedTitle = normalizeTitle(section.title).toLowerCase();
        return complianceTitles.has(normalizedTitle) && !existingTitles.has(normalizedTitle);
      }).map(clone);
      const sequentialNumbering = output.privacy.sections.length >= 6 && output.privacy.sections.every((section, index) => new RegExp(`^${index + 1}\\.\\s*`).test(section.title));
      if (missingCompliance.length && sequentialNumbering) {
        output.privacy.sections = [...output.privacy.sections.slice(0, 6), ...missingCompliance, ...output.privacy.sections.slice(6)]
          .map((section, index) => ({ ...section, title: `${index + 1}. ${normalizeTitle(section.title)}` }));
      } else output.privacy.sections.push(...missingCompliance);
    }
    return output;
  }

  merge(current, patch, { touch = true } = {}) {
    const base = this.normalize(current);
    const today = new Date().toISOString().slice(0, 10);
    for (const key of ['privacy', 'terms']) {
      if (!patch || !Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const next = patch[key] || {};
      const candidate = this.normalize({ [key]: { ...base[key], ...next, updatedAt: base[key].updatedAt } })[key];
      const comparable = value => JSON.stringify({ enabled: value.enabled, title: value.title, intro: value.intro, sections: value.sections });
      if (touch && comparable(candidate) !== comparable(base[key])) candidate.updatedAt = today;
      base[key] = candidate;
    }
    return base;
  }

  get(input, kind) {
    if (!['privacy', 'terms'].includes(kind)) return null;
    return this.normalize(input)[kind];
  }
}

export const legalDocumentService = new LegalDocumentService();

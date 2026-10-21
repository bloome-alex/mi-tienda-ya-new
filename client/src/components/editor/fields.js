// This registry is only editor UI metadata. The persisted shape lives in services/design.js.
const toggle = (key, label, help, needs) => ({ key, label, type: 'toggle', help, needs });
const text = (key, label, max = 240, extra = {}) => ({ key, label, type: 'text', max, ...extra });
const area = (key, label, max = 4000, extra = {}) => text(key, label, max, { type: 'textarea', ...extra });
const range = (key, label, min, max, unit = 'px', needs) => ({ key, label, type: 'range', min, max, unit, needs });
const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });
const variants = (key, label, options, extra = {}) => select(key, label, options, { type: 'variants', ...extra });
const image = (key, label, extra = {}) => ({ key, label, type: 'image', help: 'JPG, PNG o WebP, hasta 5 MiB.', ...extra });
const enable = (path, message) => design => path.split('.').reduce((value, key) => value?.[key], design) ? '' : message;
const hero = enable('shop.showHero', 'Activá la portada para editar esta opción.');
const heroText = d => hero(d) || (d.shop.heroVariant === 'image' ? 'La variante Solo imagen no muestra textos ni botones.' : '');
const heroCopy = d => heroText(d) || (!d.shop.heroShowText ? 'Activá los textos de la portada para personalizarlos.' : '');
const heroButton = d => heroText(d) || (!d.shop.heroShowButton ? 'Activá el botón de la portada para personalizarlo.' : '');
const heroOverlay = d => hero(d) || (!['cover', 'carousel'].includes(d.shop.heroVariant) ? 'La superposición se usa en portada Sobre imagen o Carrusel. Las otras variantes usan la paleta de la tienda.' : '');
const featured = enable('shop.showFeatured', 'Activá los productos destacados para editar esta opción.');
const rail = d => featured(d) || (d.shop.featuredLayout !== 'rail' ? 'Elegí Carrusel horizontal para habilitar esta opción.' : '');
const autoplay = d => rail(d) || (!d.shop.featuredAutoplay ? 'Activá el avance automático para configurar esta opción.' : '');
const catalog = enable('shop.showCatalog', 'Activá el catálogo para editar esta opción.');
export const targetOptions = [['catalog', 'Catálogo'], ['contact', 'Contacto de la tienda'], ['terms', 'Términos y condiciones']];
export const alignmentOptions = [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']];
export const directionOptions = [['inherit','Usar la de la tienda'],['ltr','Izquierda a derecha'],['rtl','Derecha a izquierda'],['auto','Detectar según el texto']];
const flowFields = (alignKey = 'textAlign', directionKey = 'textDirection', needs) => [
  select(alignKey,'Alineación del texto',alignmentOptions,{needs}),
  select(directionKey,'Dirección de lectura',directionOptions,{needs,help:'La alineación ubica el texto; la dirección define cómo se lee. Podés heredar la dirección de Identidad.'})
];
export function spacingFields(prefix = '', needs, fullWidth = true) {
  const key = suffix => prefix ? prefix + suffix[0].toUpperCase() + suffix.slice(1) : suffix;
  return [range(key('paddingX'), 'Espacio lateral', 0, 160, 'px', needs), range(key('paddingY'), 'Espacio arriba y abajo', 0, 160, 'px', needs), ...(fullWidth ? [toggle(key('fullWidth'), 'Usar todo el ancho disponible', 'Sin activar, el contenido ocupa hasta 1280 px. En celular, el espaciado lateral se adapta; cero conserva el borde a borde.', needs)] : [])];
}
const group = (key, title, description, items, special) => ({ key, title, description, items, special });
export const editorGroups = {
  brand: [
    group('general', 'Datos de la tienda', 'Nombre, dirección y descripción.', [], 'general'),
    group('presets', 'Un estilo para empezar', 'Tres combinaciones listas para ajustar.', [], 'presets'),
    group('theme', 'Tema y marca', 'El modo inicial y la identidad de tu tienda.', [
      select('colorMode', 'Modo inicial', [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Según el dispositivo']], { help: 'Es el modo que ve una persona en su primera visita.' }),
      toggle('allowThemeToggle', 'Permitir elegir claro u oscuro', 'Tus clientes pueden cambiar de modo, aunque el modo inicial sea Claro u Oscuro. Su elección se recuerda para esta tienda.'),
      image('logo', 'Logo de la tienda', { help: 'Aparece en la cabecera. JPG, PNG o WebP, hasta 5 MiB.' }),
      image('favicon', 'Ícono de la pestaña', { help: 'Usá una imagen cuadrada y simple. JPG, PNG o WebP, hasta 5 MiB.' }),
      select('font', 'Tipografía', [['modern','Moderna y clara'],['classic','Clásica editorial'],['friendly','Cercana y redondeada']]),
      select('textDirection','Dirección general de lectura',directionOptions.filter(option=>option[0]!=='inherit'),{help:'Se hereda en todas las páginas y secciones. Podés cambiarla por zona sin modificar la alineación del texto.'}),
      range('radius','Redondeado de las esquinas',0,40)
    ]),
    group('light-colors', 'Paleta clara', 'Colores que se usan en modo claro.', Object.entries({primary:'Principal',accent:'Acento',background:'Fondo',text:'Texto'}).map(([key,label]) => ({key,label,type:'color'}))),
    group('dark-colors', 'Paleta oscura', 'Una paleta propia para el modo oscuro.', Object.entries({darkPrimary:'Principal oscuro',darkAccent:'Acento oscuro',darkBackground:'Fondo oscuro',darkText:'Texto oscuro'}).map(([key,label]) => ({key,label,type:'color'}))),
    group('wallpaper', 'Fondo de la tienda', 'Imágenes por dispositivo o un fondo compartido.', [], 'wallpaper')
  ],
  navbar: [
    group('title','Nombre en la cabecera','Elegí cómo se presenta tu marca.',[
      toggle('showTitle','Mostrar título junto al logo','Desactivalo para usar sólo el logo. El nombre general de la tienda se conserva.'),
      toggle('useStoreName','Usar el nombre de la tienda','Se actualiza con el nombre que configurás en Identidad.',enable('navbar.showTitle','Activá el título de la cabecera para configurar su texto.')),
      text('title','Título personalizado',240,{optional:true,needs:d=>!d.navbar.showTitle?'Activá el título de la cabecera.':d.navbar.useStoreName?'Desactivá “Usar el nombre de la tienda” para escribir un título diferente.':'',help:'Puede quedar vacío para que no se muestre texto. No se agrega ningún punto ni otro carácter.'})
    ]),
    group('size','Tamaño y posición','Altura propia para escritorio y celular.',[
      range('height','Altura en escritorio',48,220),range('mobileHeight','Altura en celular',48,160),range('paddingX','Espacio lateral',0,120),
      toggle('sticky','Mantener la cabecera visible','La cabecera acompaña el recorrido dentro de tu tienda.')
    ]),
    group('logo','Logo flexible','Forma, ajuste y tamaño por dispositivo.',[
      variants('logoShape','Forma del logo',[['natural','Natural','Respeta el marco elegido'],['square','Cuadrada','Lados iguales'],['rounded','Redondeada','Esquinas ajustables'],['circle','Circular','Recorte redondo']]),
      select('logoFit','Ajuste dentro del marco',[['contain','Completo · conservar proporción'],['cover','Rellenar · recortar bordes']],{help:'Completo muestra toda la imagen sin deformarla. Rellenar conserva la proporción y recorta lo que sobresale.'}),
      range('logoWidth','Ancho en escritorio',24,480),range('logoHeight','Alto en escritorio',24,200),
      range('mobileLogoWidth','Ancho en celular',24,280),range('mobileLogoHeight','Alto en celular',24,144),
      range('logoRadius','Redondeado del logo',0,100,'px',d=>d.navbar.logoShape==='rounded'?'':'Elegí la forma Redondeada para ajustar las esquinas.')
    ],'logo'),
    group('links','Navegación de la tienda','Enlaces visibles, textos y orden.',[
      select('linksAlign','Alineación de los enlaces',alignmentOptions,{help:'En celulares, los enlaces se organizan en el menú de navegación.'})
    ],'navigation')
  ],
  shop: [
    group('structure', 'Estructura y anuncio', 'La primera impresión de tu tienda.', [
      variants('layout','Estilo general',[['editorial','Editorial'],['minimal','Minimalista'],['bold','Impacto']],{help:'Define el estilo general; la portada y las tarjetas se ajustan por separado.'}),
      toggle('showAnnouncement','Mostrar barra de anuncio'), text('announcement','Texto del anuncio',240,{needs:enable('shop.showAnnouncement','Activá la barra de anuncio para editar su texto.')}),
      ...flowFields('announcementAlign','announcementDirection',enable('shop.showAnnouncement','Activá la barra de anuncio para editar esta opción.'))
    ]),
    group('hero', 'Portada principal', 'Composición, imagen y mensaje de bienvenida.', [
      toggle('showHero','Mostrar portada'),
      variants('heroVariant','Composición',[['split','Dividida','Imagen junto al texto'],['cover','Sobre imagen','Texto sobre la foto'],['image','Solo imagen','Sin texto ni botón'],['centered','Centrada','Mensaje al centro'],['carousel','Carrusel','Hasta 8 diapositivas']],{needs:hero}),
      image('heroImage','Imagen de portada',{needs:d=>hero(d)||(d.shop.heroVariant==='carousel'?'Las imágenes del carrusel se cargan en Diapositivas.':''),help:'Imagen principal para las variantes sin carrusel. JPG, PNG o WebP, hasta 5 MiB.'}),
      toggle('heroShowText','Mostrar textos de portada',undefined,heroText), text('heroTitle','Título principal',240,{needs:heroCopy}), area('heroSubtitle','Texto de bienvenida',240,{needs:heroCopy}),
      toggle('heroShowButton','Mostrar botón de portada',undefined,heroText),text('heroButton','Texto del botón',240,{needs:heroButton}),
      select('heroAlign','Alineación del contenido',alignmentOptions,{needs:heroText}),
      select('heroDirection','Dirección de lectura',directionOptions,{needs:heroText}),
      {key:'heroTextColor',label:'Texto sobre la imagen',type:'color',needs:heroOverlay},range('heroOverlay','Oscurecer la imagen',0,90,'%',heroOverlay)
    ]),
    group('slides', 'Diapositivas', 'Ordená el contenido del carrusel de portada.', [
      toggle('heroAutoplay','Avanzar automáticamente','Las flechas siguen disponibles. El avance se pausa al interactuar o si el dispositivo prefiere menos movimiento.',d=>hero(d)||(d.shop.heroVariant!=='carousel'?'Elegí la composición Carrusel para habilitar esta opción.':'')),
      range('heroInterval','Tiempo entre diapositivas',3,20,'s',d=>hero(d)||(d.shop.heroVariant!=='carousel'?'Elegí la composición Carrusel.':!d.shop.heroAutoplay?'Activá el avance automático.':''))
    ],'slides'),
    group('hero-spacing','Tamaño de portada','Alto independiente para escritorio y celular.', [range('heroHeight','Alto en escritorio',240,900,'px',hero),range('heroMobileHeight','Alto en celular',200,800,'px',hero),...spacingFields('hero',hero)]),
    group('featured','Productos destacados','Una selección elegida por vos.', [
      toggle('showFeatured','Mostrar productos destacados','Se eligen desde el listado o formulario de Productos. Se muestran hasta 12 productos.'),text('featuredTitle','Título de destacados',240,{needs:featured}),
      ...flowFields('featuredAlign','featuredDirection',featured),
      variants('featuredLayout','Presentación',[['grid','Grilla','Todos a la vista'],['rail','Carrusel horizontal','Navegación con flechas']],{needs:featured}),
      range('featuredColumns','Columnas en escritorio',1,5,'',featured),range('featuredMobileColumns','Columnas en celular',1,4,'',featured),
      toggle('featuredAutoplay','Avanzar automáticamente',undefined,rail),range('featuredInterval','Tiempo entre avances',2,20,'s',autoplay),range('featuredSpeed','Duración del movimiento',150,1500,'ms',rail),
      toggle('featuredLoop','Volver al inicio al terminar',undefined,rail),toggle('featuredPauseOnHover','Pausar al pasar el mouse','El foco de teclado y la preferencia de menos movimiento siempre pausan el avance. La persona también puede pausarlo manualmente.',autoplay),
      ...spacingFields('featured',featured)
    ]),
    group('catalog','Catálogo','Búsqueda, categorías y distribución.', [
      toggle('showCatalog','Mostrar catálogo'),text('catalogTitle','Título del catálogo',240,{needs:catalog}),toggle('showSearch','Mostrar buscador',undefined,catalog),toggle('showCategories','Mostrar categorías',undefined,catalog),
      variants('categoryNavigation','Cómo elegir categorías',[['chips','Chips','Botones en el catálogo'],['navbar','En la cabecera','Menús con subcategorías'],['drawer','Panel desplegable','Se abre con un botón'],['select','Selector','Lista compacta'],['sidebar','Panel lateral','Filtros junto al catálogo']],{needs:d=>catalog(d)||(!d.shop.showCategories?'Activá las categorías para mostrar este filtro.':''),help:'Las subcategorías admiten varios niveles. En celular, los filtros se adaptan al espacio disponible.'}),
      variants('categoryPanelAnimation','Animación del panel',[['slide','Deslizar','Entra desde arriba'],['fade','Aparecer','Transición suave'],['scale','Expandir','Escala levemente al abrir']],{needs:d=>catalog(d)||(!d.shop.showCategories?'Activá las categorías para mostrar este filtro.':d.shop.categoryNavigation!=='drawer'?'Elegí Panel desplegable para configurar su animación.':'')}),
      range('categoryPanelDuration','Duración de la animación',120,700,'ms',d=>catalog(d)||(!d.shop.showCategories?'Activá las categorías para mostrar este filtro.':d.shop.categoryNavigation!=='drawer'?'Elegí Panel desplegable para configurar su animación.':'')),
      ...flowFields('catalogAlign','catalogDirection',catalog),
      variants('catalogVariant','Distribución del catálogo',[['grid','Grilla'],['compact','Compacta'],['editorial','Editorial']],{needs:catalog}),range('catalogColumns','Columnas en escritorio',1,5,'',catalog),range('catalogMobileColumns','Columnas en celular',1,4,'',catalog),...spacingFields('catalog',catalog)
    ]),
    group('cards','Tarjetas de producto','Estilo, información y comportamiento.', [
      variants('cardVariant','Diseño de tarjeta',[['minimal','Minimalista'],['bordered','Con borde'],['elevated','Elevada'],['overlay','Superpuesta']]),
      select('imageRatio','Formato de imágenes',[['square','Cuadradas · 1:1'],['portrait','Verticales · 4:5'],['landscape','Horizontales · 4:3']]),
      ...flowFields('cardAlign','cardDirection'),
      toggle('cardShowButton','Mostrar botón de producto'),toggle('showPreviousPrice','Mostrar precio anterior'),toggle('showStock','Mostrar stock en el catálogo'),toggle('showDescription','Mostrar descripción breve'),
      toggle('productHoverSwap','Mostrar la segunda foto al pasar el mouse','Necesita al menos dos fotos en el producto. En dispositivos táctiles se conserva la primera imagen.'),
      select('productHoverEffect','Efecto al pasar el mouse',[['none','Sin movimiento'],['lift','Elevar tarjeta'],['zoom','Acercar imagen']],{help:'Se respeta la preferencia de menos movimiento del dispositivo.'})
    ]),
    group('contact','Contacto de la tienda','Datos de contacto y su presentación.',[toggle('showContact','Mostrar sección de contacto','Los datos y el botón de WhatsApp se configuran en Contacto. Sus títulos y mensajes están en Textos.'),...flowFields('contactAlign','contactDirection',enable('shop.showContact','Activá la sección de contacto para ver estos ajustes.'))]),
    group('footer','Pie de la tienda','Mensaje de cierre y presentación.', [area('footerText','Mensaje al pie',4000),...flowFields('footerAlign','footerDirection'),...spacingFields('footer',undefined,false)])
  ],
  product: [
    group('layout','Presentación del producto','Composición y galería de imágenes.', [variants('layout','Composición',[['classic','Clásica'],['focus','En foco'],['wide','Amplia']]),variants('galleryLayout','Galería',[['thumbnails','Miniaturas'],['grid','Grilla de fotos']]),range('galleryColumns','Columnas de la grilla en escritorio',1,4,'',d=>d.product.galleryLayout==='grid'?'':'Elegí Grilla de fotos.'),range('galleryMobileColumns','Columnas de la grilla en celular',1,4,'',d=>d.product.galleryLayout==='grid'?'':'Elegí Grilla de fotos.'),...flowFields(),...spacingFields()]),
    group('info','Información y navegación','Elegí qué datos se muestran.', [toggle('showBreadcrumbs','Mostrar ruta de navegación'),toggle('showCategory','Mostrar categoría'),toggle('showStock','Mostrar stock disponible'),toggle('showSku','Mostrar código de variante'),toggle('showShare','Mostrar botón para compartir')]),
    group('purchase','Compra y mensajes','Textos que acompañan la decisión.', [text('addButton','Texto para agregar al carrito'),area('madeToOrderText','Aviso para productos a pedido')]),
    group('related','Más posibilidades de compra','Relacionados y recomendaciones.', [toggle('showRelated','Mostrar productos relacionados','Se eligen desde cada producto.'),text('relatedTitle','Título de relacionados',240,{needs:enable('product.showRelated','Activá los productos relacionados.')}),toggle('showRecommendations','Mostrar recomendaciones','Se aprenden de las compras conjuntas y se complementan con categorías y relaciones.'),text('recommendationTitle','Título de recomendaciones',240,{needs:enable('product.showRecommendations','Activá las recomendaciones.')})])
  ],
  cart: [
    group('layout','Presentación del carrito','Productos y resumen de compra.', [variants('layout','Distribución',[['split','Dos columnas'],['stacked','Apilada']]),variants('summaryStyle','Estilo del resumen',[['card','Tarjeta'],['minimal','Minimalista']]),...flowFields(),...spacingFields()]),
    group('experience','Experiencia de compra','Navegación y mensajes del carrito.', [text('title','Título de la página'),toggle('showImages','Mostrar imágenes de productos'),toggle('showNotes','Permitir notas del comprador'),toggle('showContinueShopping','Mostrar “Seguir eligiendo”'),text('buttonText','Texto para continuar al pago'),area('emptyText','Mensaje de carrito vacío'),text('trustMessage','Mensaje de confianza')]),
    group('recommendations','Sugerencias en el carrito','Productos que acompañan la selección.',[toggle('showRecommendations','Mostrar productos sugeridos'),text('recommendationTitle','Título de sugerencias',240,{needs:enable('cart.showRecommendations','Activá los productos sugeridos.')})])
  ],
  checkout: [
    group('layout','Diseño del checkout','Pasos, tarjetas y espacio de la página.', [variants('layout','Organización',[['steps','Paso a paso','Datos, entrega y pago'],['single','Una página','Todos los pasos juntos']]),variants('style','Estilo visual',[['cards','Tarjetas'],['minimal','Minimalista']]),...flowFields(),...spacingFields()]),
    group('data','Datos para comprar','Elegí la información de cada pedido.', [text('title','Título de la página'),toggle('showOrderSummary','Mostrar resumen de compra','El importe total siempre aparece antes de confirmar.'),toggle('showPhone','Mostrar teléfono','Las compras físicas o la opción “Teléfono obligatorio” siempre lo muestran.'),toggle('requirePhone','Teléfono obligatorio','Al activarlo, se pide incluso en compras digitales.'),toggle('showNotes','Permitir notas del comprador')]),
    group('trust','Confianza y condiciones','Mensajes y aceptación de términos.',[toggle('showTrust','Mostrar mensaje de confianza'),text('trustMessage','Mensaje de confianza',240,{needs:enable('checkout.showTrust','Activá el mensaje de confianza.')}),text('termsUrl','Enlace externo a términos',2048,{type:'url',optional:true,needs:d=>d.terms.enabled?'Se usan los términos internos. Editalos en la pestaña Términos.':'',help:'Se usa cuando la página interna de Términos está desactivada. Al completarlo se solicita la aceptación al comprar.'}),text('termsLabel','Texto de aceptación',240,{needs:d=>!d.terms.enabled&&!d.checkout.termsUrl?'Activá los términos internos o configurá un enlace externo.':''})]),
    group('thanks','Después de la compra','El mensaje luego de confirmar el pago.',[text('thankYouTitle','Título de agradecimiento'),area('thankYouMessage','Mensaje de agradecimiento')])
  ],
  terms: [
    group('content','Página de términos','Texto propio, sin HTML ni código.',[toggle('enabled','Publicar términos y condiciones','Al activar esta página, se enlaza desde la tienda y se solicita su aceptación al comprar.'),text('title','Título de la página'),area('intro','Introducción',4000,{optional:true}),area('content','Contenido de los términos',20000,{rows:12,counter:true,help:'Escribí párrafos de texto. No se interpreta HTML. El título y el contenido son obligatorios para publicar esta página.'})]),
    group('appearance','Presentación y fecha','Ancho del texto y última actualización.',[select('contentWidth','Ancho del contenido',[['narrow','Lectura cómoda'],['normal','Normal'],['wide','Amplio']]),...flowFields(),range('paddingX','Espacio lateral',0,160),range('paddingY','Espacio arriba y abajo',0,160),toggle('showUpdatedAt','Mostrar fecha de actualización'),text('updatedAt','Fecha de actualización',10,{type:'date',needs:enable('terms.showUpdatedAt','Activá la fecha de actualización para mostrarla.'),optional:true})])
  ]
};
export const wallpaperFields = [
  toggle('enabled','Usar imagen de fondo','El fondo se aplica a las páginas de tu tienda.'),
  variants('mode','Imágenes por dispositivo',[['shared','Una imagen','Para ambas pantallas'],['responsive','Dos imágenes','Escritorio y celular']],{help:'Las resoluciones sugeridas son orientativas. Podés cargar las imágenes antes de activar el fondo.'}),
  select('fit','Ajuste de la imagen',[['cover','Cubrir el área'],['contain','Mostrar la imagen completa']],{help:'Cubrir puede recortar los bordes según la pantalla. Mantené lo importante en el área central; no incluyas texto esencial en los extremos.'}),
  select('position','Posición',[['center','Centro'],['top','Arriba'],['bottom','Abajo']]),select('attachment','Movimiento',[['scroll','Acompañar el desplazamiento'],['fixed','Fondo fijo']]),
  range('overlay','Velo en modo claro',0,90,'%'),range('darkOverlay','Velo en modo oscuro',0,90,'%')
];

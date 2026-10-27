const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const paragraphs = value => String(value || '').split(/\n{2,}/).map(block => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`).join('');
const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export class LegalPageRenderer {
  render({ kind, document, contact = {}, appUrl = '' }) {
    const isPrivacy = kind === 'privacy';
    const canonicalPath = isPrivacy ? '/politica-de-privacidad' : '/condiciones-del-servicio';
    const alternatePath = isPrivacy ? '/condiciones-del-servicio' : '/politica-de-privacidad';
    const alternateLabel = isPrivacy ? 'Condiciones del servicio' : 'Política de privacidad';
    const canonical = `${String(appUrl).replace(/\/$/, '')}${canonicalPath}`;
    const sections = Array.isArray(document?.sections) ? document.sections : [];
    const date = escapeHtml(document?.updatedAt || '');
    const title = escapeHtml(document?.title || (isPrivacy ? 'Política de Privacidad de MiTiendaYa' : 'Condiciones del Servicio de MiTiendaYa'));
    const intro = escapeHtml(document?.intro || '');
    const contactEmail = String(contact?.email || '').trim();
    const toc = sections.map((section, index) => `<li><a href="#${index + 1}-${slug(section.title)}">${escapeHtml(section.title)}</a></li>`).join('');
    const body = sections.map((section, index) => `<section id="${index + 1}-${slug(section.title)}"><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.content)}</section>`).join('');
    const contactMarkup = contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : `<a href="${escapeHtml(String(appUrl).replace(/\/$/, ''))}/#contacto">canales oficiales de contacto de MiTiendaYa</a>`;
    return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${isPrivacy ? 'Información detallada sobre los datos que MiTiendaYa recopila, usa, almacena y comparte, incluido el uso de Google Ads API y OAuth.' : 'Condiciones aplicables al uso de MiTiendaYa, sus tiendas, suscripciones, pagos, publicidad e integraciones.'}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--bg:#fafafa;--card:#fff;--text:#171717;--muted:#626262;--line:#dedede;--accent:#171717}@media(prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#121214;--text:#f5f5f5;--muted:#aaa;--line:#2a2a2d;--accent:#f5f5f5}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);line-height:1.7}a{color:inherit}header,main,footer{max-width:1180px;margin:auto;padding-left:28px;padding-right:28px}header{padding-top:70px;padding-bottom:45px;border-bottom:1px solid var(--line)}.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}h1{font-size:clamp(2.5rem,6vw,5rem);line-height:1.02;letter-spacing:-.055em;margin:18px 0 22px;max-width:960px}header>p{max-width:900px;font-size:1.05rem;color:var(--muted)}.meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:22px;font-size:.82rem;color:var(--muted)}main{display:grid;grid-template-columns:280px minmax(0,1fr);gap:58px;padding-top:48px;padding-bottom:80px}.toc{position:sticky;top:20px;align-self:start;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:22px;max-height:calc(100vh - 40px);overflow:auto}.toc strong{font-size:.72rem;letter-spacing:.08em}.toc ol{padding-left:18px;margin:14px 0 0}.toc li{margin:7px 0}.toc a{font-size:.78rem;color:var(--muted);text-decoration:none}.toc a:hover{text-decoration:underline;color:var(--text)}article{min-width:0}section{scroll-margin-top:28px;padding:0 0 36px;margin:0 0 36px;border-bottom:1px solid var(--line)}h2{font-size:1.38rem;line-height:1.3;margin:0 0 17px}p{margin:0 0 16px;color:var(--muted)}.contact{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:24px}.contact h2{margin-top:0}.nav{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px}.nav a{font-weight:700}footer{border-top:1px solid var(--line);padding-top:26px;padding-bottom:36px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:.82rem;color:var(--muted)}@media(max-width:820px){header{padding-top:45px}main{grid-template-columns:1fr;gap:28px}.toc{position:static;max-height:none}h1{font-size:2.8rem}}
</style>
</head>
<body>
<header><span class="eyebrow">Documento oficial de MiTiendaYa</span><h1>${title}</h1><p>${intro}</p><div class="meta"><span>Última actualización: ${date || 'sin fecha publicada'}</span><span>Disponible públicamente sin iniciar sesión</span></div></header>
<main><nav class="toc" aria-label="Índice"><strong>EN ESTA PÁGINA</strong><ol>${toc}</ol></nav><article>${body}<div class="contact"><h2>Contacto sobre privacidad y datos</h2><p>Para consultas, solicitudes de acceso, rectificación, eliminación, seguridad o uso de datos de Google, comunicate mediante ${contactMarkup}.</p><div class="nav"><a href="${alternatePath}">${alternateLabel}</a><a href="/">Volver a MiTiendaYa</a></div></div></article></main>
<footer><strong>MiTiendaYa</strong><span>Documento público generado desde la configuración administrativa vigente.</span></footer>
</body></html>`;
  }
}

export const legalPageRenderer = new LegalPageRenderer();

import { User } from '../models/index.js';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { escapeHtml } from '../utils/http.js';
import { mailService } from './core.js';

const templates = Object.freeze({
  release: { key: 'release', name: 'Novedades de versión', description: 'Presentá una nueva versión con una lista clara de mejoras y un llamado a la acción.' },
  announcement: { key: 'announcement', name: 'Comunicado', description: 'Compartí una novedad general con todos los vendedores.' },
  maintenance: { key: 'maintenance', name: 'Aviso de servicio', description: 'Informá tareas programadas, cambios operativos o ventanas de mantenimiento.' },
});

const paragraph = value => escapeHtml(value).replace(/\n/g, '<br>');
const listItems = values => values.map(value => `<li style="margin:0 0 10px;padding:0 0 0 2px;color:#4d463d;line-height:1.6">${escapeHtml(value)}</li>`).join('');
const button = (label, href) => label && href ? `<p style="margin:30px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1d1a16;color:#fff8ec;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700">${escapeHtml(label)}</a></p>` : '';
const shell = ({ eyebrow, title, content, accent = '#1d1a16' }) => `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#27231e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:34px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf1;border:1px solid #e4dacb;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 30px;background:${accent};color:#fff8ec"><div style="font-size:22px;font-weight:800;letter-spacing:-.7px">MiTiendaYa</div></td></tr><tr><td style="padding:36px 34px"><div style="font-size:11px;letter-spacing:1.8px;text-transform:uppercase;font-weight:800;color:#8b7d6a;margin-bottom:12px">${escapeHtml(eyebrow)}</div><h1 style="font-size:30px;line-height:1.15;letter-spacing:-1px;margin:0 0 18px;color:#27231e">${escapeHtml(title)}</h1>${content}</td></tr><tr><td style="padding:20px 34px;border-top:1px solid #e9dfd1;color:#897d6d;font-size:12px;line-height:1.6">MiTiendaYa · Herramientas para hacer crecer tu tienda.</td></tr></table></td></tr></table></body></html>`;

export class SellerMailService {
  listTemplates() { return Object.values(templates); }

  async recipientCount() { return User.countDocuments({ role: 'vendedor', email: { $type: 'string', $ne: '' } }); }

  render(input) {
    const template = templates[input.template];
    if (!template) throw new AppError('La plantilla seleccionada no existe.', 422, 'EMAIL_TEMPLATE_INVALID');
    const ctaUrl = input.ctaUrl || config.appUrl;
    if (input.template === 'release') {
      const changes = (input.changes || []).filter(Boolean);
      const content = `${input.version ? `<div style="display:inline-block;background:#eee4d6;color:#574d41;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;margin-bottom:20px">Versión ${escapeHtml(input.version)}</div>` : ''}<p style="font-size:16px;line-height:1.75;color:#51493f;margin:0 0 24px">${paragraph(input.message)}</p>${changes.length ? `<div style="background:#f7f0e5;border:1px solid #eadfce;border-radius:14px;padding:22px 24px"><strong style="display:block;margin-bottom:14px;color:#2d2822">Qué cambió</strong><ul style="margin:0;padding-left:20px">${listItems(changes)}</ul></div>` : ''}${button(input.ctaText, ctaUrl)}`;
      return { html: shell({ eyebrow: 'Novedades de producto', title: input.title, content }), text: `MiTiendaYa\n${input.version ? `Versión ${input.version}\n` : ''}${input.title}\n\n${input.message}${changes.length ? `\n\nQué cambió:\n- ${changes.join('\n- ')}` : ''}${input.ctaText ? `\n\n${input.ctaText}: ${ctaUrl}` : ''}` };
    }
    if (input.template === 'maintenance') {
      const content = `<p style="font-size:16px;line-height:1.75;color:#51493f;margin:0">${paragraph(input.message)}</p>${button(input.ctaText, ctaUrl)}`;
      return { html: shell({ eyebrow: 'Información importante', title: input.title, content, accent: '#51483c' }), text: `MiTiendaYa\n${input.title}\n\n${input.message}${input.ctaText ? `\n\n${input.ctaText}: ${ctaUrl}` : ''}` };
    }
    const content = `<p style="font-size:16px;line-height:1.75;color:#51493f;margin:0">${paragraph(input.message)}</p>${button(input.ctaText, ctaUrl)}`;
    return { html: shell({ eyebrow: 'Comunicado', title: input.title, content, accent: '#332e28' }), text: `MiTiendaYa\n${input.title}\n\n${input.message}${input.ctaText ? `\n\n${input.ctaText}: ${ctaUrl}` : ''}` };
  }

  async sendToAll(input) {
    const recipients = await User.find({ role: 'vendedor', email: { $type: 'string', $ne: '' } }).select('email').lean();
    if (!recipients.length) throw new AppError('No hay vendedores con email para enviar.', 422, 'NO_EMAIL_RECIPIENTS');
    const rendered = this.render(input);
    let sent = 0, failed = 0;
    for (let index = 0; index < recipients.length; index += 5) {
      const batch = recipients.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(recipient => mailService.send({ to: recipient.email, subject: input.subject, ...rendered })));
      for (const result of results) result.status === 'fulfilled' ? sent++ : failed++;
    }
    return { total: recipients.length, sent, failed };
  }
}

export const sellerMailService = new SellerMailService();

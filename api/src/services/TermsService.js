import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { normalizeDesign } from '../../../client/src/services/design.js';

/** The document and its timestamp are server-owned. A manual order is never
 * recorded as an acceptance on behalf of its customer. */
export class TermsService {
  acceptance(store, input, { manual = false } = {}) {
    const design = normalizeDesign(store.design || {});
    const internal = design.terms.enabled === true;
    const external = !internal && Boolean(design.checkout.termsUrl);
    const required = internal || external;
    if (manual) return { required, accepted: false, source: 'manual' };
    if (input.termsAccepted !== undefined && typeof input.termsAccepted !== 'boolean') throw new AppError('La aceptación de términos debe ser un valor verdadero o falso.', 422, 'INVALID_TERMS_ACCEPTANCE');
    if (required && input.termsAccepted !== true) throw new AppError('Aceptá los términos y condiciones para completar tu pedido.', 422, 'TERMS_ACCEPTANCE_REQUIRED');
    if (!required) return { required: false, accepted: false, source: 'none' };
    if (internal && (!design.terms.title.trim() || !design.terms.content.trim())) throw new AppError('La tienda debe completar sus términos y condiciones antes de recibir pedidos.', 409, 'TERMS_NOT_CONFIGURED');
    const source = internal ? 'internal' : 'external';
    // For an external URL we only know that URL and the configured label. We do
    // not fetch it, pretend to know its contents, or hash a document not stored.
    const snapshot = {
      title: internal ? design.terms.title : design.checkout.termsLabel,
      intro: internal ? design.terms.intro : '',
      content: internal ? design.terms.content : '',
      url: internal ? config.appUrl + '/t/' + store.slug + '/terminos' : design.checkout.termsUrl,
      updatedAt: internal ? design.terms.updatedAt : '',
    };
    return { required: true, accepted: true, source, acceptedAt: new Date(), snapshot, contentHash: createHash('sha256').update(JSON.stringify({ source, snapshot })).digest('hex') };
  }
}
export const termsService = new TermsService();

import sharp from 'sharp';
import { config } from '../config.js';
import { Product, SocialAd } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { domainService } from './DomainService.js';
import { GoogleAdsService } from './GoogleAdsService.js';

const textSlice = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const resourceId = value => {
  const tail = String(value || '').split('/').at(-1) || '';
  return tail.includes('~') ? tail.split('~').at(-1) : tail;
};
const youtubeId = value => {
  const raw = String(value || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') { const id = url.pathname.split('/').filter(Boolean)[0]; if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id; }
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const watch = url.searchParams.get('v'); if (/^[A-Za-z0-9_-]{11}$/.test(watch || '')) return watch;
      const parts = url.pathname.split('/').filter(Boolean); const marker = parts.findIndex(item => ['shorts','embed','live'].includes(item)); const id = marker >= 0 ? parts[marker + 1] : '';
      if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
    }
  } catch { /* se informa abajo */ }
  throw new AppError('Ingresá un ID o URL válida de un video de YouTube.', 422, 'YOUTUBE_VIDEO_INVALID');
};

/**
 * YouTube Ads se implementa sobre Google Ads API mediante Demand Gen.
 * Reutiliza OAuth, descubrimiento de cuentas, cifrado y transporte de GoogleAdsService,
 * pero crea una campaña separada limitada a inventario de YouTube.
 */
export class YouTubeAdsService extends GoogleAdsService {
  constructor(options = {}) { super({ ...options, provider: 'youtube' }); }
  async createTrafficAd(store, user, { productId, name, primaryText, headline, dailyBudget, countryCode = 'AR', youtubeVideo, logoUrl = '' }) {
    const integration = await this.integration(store._id, { withToken: true });
    if (!integration || integration.status !== 'connected') throw new AppError('Conectá YouTube Ads antes de crear un anuncio.', 422, 'YOUTUBE_ADS_NOT_CONNECTED');
    if (!integration.selectedAdAccountId) throw new AppError('Elegí una cuenta publicitaria de Google Ads para YouTube antes de crear anuncios.', 422, 'YOUTUBE_ADS_ACCOUNT_REQUIRED');
    const product = await Product.findOne({ _id: productId, storeId: store._id, archived: { $ne: true }, active: true }).lean();
    if (!product) throw new AppError('El producto seleccionado no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const videoId = youtubeId(youtubeVideo);
    const domain = domainService.publicDomain(store); const base = String(domain.publicUrl || `${config.appUrl}/t/${store.slug}`).replace(/\/$/, '');
    const destinationUrl = await this.publicDestination(`${base}/producto/${product._id}`);
    const candidateLogo = String(logoUrl || store.pwa?.iconUrl || store.pwa?.icon192Url || (product.images || [])[0] || '').trim();
    if (!candidateLogo) throw new AppError('Necesitamos una imagen para generar el logo del anuncio de YouTube.', 422, 'YOUTUBE_LOGO_REQUIRED');
    let absoluteLogo = candidateLogo;
    if (!/^https?:\/\//i.test(absoluteLogo)) { try { absoluteLogo = new URL(absoluteLogo, `${base}/`).toString(); } catch { throw new AppError('La imagen del logo no es válida.', 422, 'YOUTUBE_LOGO_INVALID'); } }
    const image = await this.publicImage(absoluteLogo);
    let logoBytes;
    try { logoBytes = await sharp(Buffer.from(image.bytes, 'base64')).resize(512, 512, { fit: 'cover', position: 'center' }).png().toBuffer(); }
    catch { throw new AppError('No se pudo preparar la imagen cuadrada requerida por YouTube Ads.', 422, 'YOUTUBE_LOGO_PROCESS_FAILED'); }
    const account = (integration.adAccounts || []).find(item => item.id === integration.selectedAdAccountId);
    if (!account || Number(account.accountStatus) !== 1) throw new AppError('La cuenta de Google Ads seleccionada no está activa.', 422, 'YOUTUBE_ADS_ACCOUNT_INACTIVE');
    const amountMicros = Math.round(Number(dailyBudget) * 1_000_000);
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) throw new AppError('Ingresá un presupuesto diario válido.', 422, 'YOUTUBE_ADS_BUDGET_INVALID');
    const accessToken = await this.tokenFor(integration); const api = this.api(accessToken); const customerId = String(account.id); const managerId = account.managerCustomerId || integration.selectedManagerCustomerId || '';
    const geo = await this.geoTarget(api, countryCode);
    const budgetRn = `customers/${customerId}/campaignBudgets/-1`; const campaignRn = `customers/${customerId}/campaigns/-2`; const adGroupRn = `customers/${customerId}/adGroups/-3`; const videoRn = `customers/${customerId}/assets/-4`; const logoRn = `customers/${customerId}/assets/-5`;
    const shortHeadline = textSlice(headline || product.name, 40) || 'Conocé este producto';
    const longHeadline = textSlice(`${headline || product.name} en ${store.name}`, 90) || 'Conocé nuestros productos';
    const description = textSlice(primaryText || product.description || `Conocé ${product.name} en nuestra tienda.`, 90) || 'Conocé este producto en nuestra tienda online.';
    const businessName = textSlice(store.name, 25) || 'Mi tienda';
    const operations = [
      { campaignBudgetOperation: { create: { resourceName: budgetRn, name: `${name} · Presupuesto`, amountMicros: String(amountMicros), explicitlyShared: false } } },
      { campaignOperation: { create: { resourceName: campaignRn, name, status: 'PAUSED', advertisingChannelType: 'DEMAND_GEN', campaignBudget: budgetRn, targetSpend: {}, containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' } } },
      { adGroupOperation: { create: { resourceName: adGroupRn, name: `${name} · YouTube`, campaign: campaignRn, status: 'PAUSED', demandGenAdGroupSettings: { channelControls: { selectedChannels: { youtubeInFeed: true, youtubeInStream: true, youtubeShorts: true, discover: false, gmail: false, display: false, maps: false } } } } } },
      { adGroupCriterionOperation: { create: { adGroup: adGroupRn, location: { geoTargetConstant: geo } } } },
      { assetOperation: { create: { resourceName: videoRn, name: `${name} · Video`, youtubeVideoAsset: { youtubeVideoId: videoId } } } },
      { assetOperation: { create: { resourceName: logoRn, name: `${name} · Logo`, imageAsset: { data: logoBytes.toString('base64') } } } },
      { adGroupAdOperation: { create: { adGroup: adGroupRn, status: 'PAUSED', ad: { name: `${name} · Anuncio`, finalUrls: [destinationUrl], demandGenVideoResponsiveAd: { businessName: { text: businessName }, videos: [{ asset: videoRn }], logoImages: [{ asset: logoRn }], headlines: [{ text: shortHeadline }], longHeadlines: [{ text: longHeadline }], descriptions: [{ text: description }] } } } } },
    ];
    const response = await api.mutate(customerId, operations, managerId);
    const campaignResource = this.resultResource(response, 'campaignResult'); const adGroupResource = this.resultResource(response, 'adGroupResult'); const adResource = this.resultResource(response, 'adGroupAdResult'); const budgetResource = this.resultResource(response, 'campaignBudgetResult');
    const assets = (response?.mutateOperationResponses || []).map(item => item?.assetResult?.resourceName).filter(Boolean);
    const criterionResource = this.resultResource(response, 'adGroupCriterionResult');
    if (!campaignResource || !adResource || assets.length < 2) throw new AppError('Google Ads creó una respuesta incompleta para el anuncio de YouTube.', 502, 'YOUTUBE_ADS_MUTATE_INCOMPLETE');
    return SocialAd.create({ storeId: store._id, provider: 'youtube', createdBy: user._id, productId: product._id, name, primaryText, headline, destinationUrl, imageUrl: image.url, dailyBudget: Number(dailyBudget), currency: account.currency || '', countryCode: String(countryCode).toUpperCase(), status: 'paused', external: { customerId, managerCustomerId: managerId, budgetId: resourceId(budgetResource), campaignId: resourceId(campaignResource), adGroupId: resourceId(adGroupResource), criterionId: resourceId(criterionResource), assetId: resourceId(assets[0]), logoAssetId: resourceId(assets[1]), youtubeVideoId: videoId, adId: resourceId(adResource) } });
  }
}

export const youtubeAdsService = new YouTubeAdsService();

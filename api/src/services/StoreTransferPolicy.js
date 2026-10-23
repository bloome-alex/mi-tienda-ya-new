export class StoreTransferPolicy {
  eligibility({ user, entitlement, ownedCount = 0 } = {}) {
    if (!user || user.role !== 'vendedor' || !user.active) return { allowed: false, code: 'TRANSFER_RECIPIENT_INVALID', reason: 'La cuenta destinataria no está habilitada.' };
    if (!user.planId || !entitlement?.allowed || entitlement?.trial) return { allowed: false, code: 'TRANSFER_SUBSCRIPTION_REQUIRED', reason: 'Necesitás una suscripción vigente para aceptar una tienda.' };
    const maximum = Math.max(0, Number(entitlement.maxStores || 0));
    if (ownedCount >= maximum) return { allowed: false, code: 'TRANSFER_STORE_LIMIT', reason: 'Tu plan no tiene cupo disponible para recibir otra tienda.', maxStores: maximum, ownedStores: ownedCount, availableStores: 0 };
    return { allowed: true, code: '', reason: '', maxStores: maximum, ownedStores: ownedCount, availableStores: Math.max(0, maximum - ownedCount) };
  }
}

export const storeTransferPolicy = new StoreTransferPolicy();

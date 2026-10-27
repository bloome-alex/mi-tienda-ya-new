import { Plan, Subscription } from '../models/index.js';
import { AppError } from '../middleware/core.js';

const numericLimit = value => Math.max(0, Math.trunc(Number(value ?? 0) || 0));

/** Cupos comerciales de cobros/entregas. 0 representa ilimitado y no existe un tope técnico artificial. */
export class CommercePlanLimitService {
  async initializeLegacyPlanLimits() {
    await Plan.updateMany({ maxPaymentMethods: { $exists: false } }, { $set: { maxPaymentMethods: 0 } });
    await Plan.updateMany({ maxDeliveryMethods: { $exists: false } }, { $set: { maxDeliveryMethods: 0 } });
    await Subscription.updateMany({ 'planSnapshot.maxPaymentMethods': { $exists: false } }, { $set: { 'planSnapshot.maxPaymentMethods': 0 } });
    await Subscription.updateMany({ 'planSnapshot.maxDeliveryMethods': { $exists: false } }, { $set: { 'planSnapshot.maxDeliveryMethods': 0 } });
  }

  assertUpdate({ currentPayments = [], currentDeliveries = [], nextPayments = [], nextDeliveries = [], entitlement }) {
    this.assertCount('formas de pago', 'PAYMENT_METHOD_LIMIT', currentPayments.length, nextPayments.length, entitlement?.maxPaymentMethods);
    this.assertCount('formas de entrega', 'DELIVERY_METHOD_LIMIT', currentDeliveries.length, nextDeliveries.length, entitlement?.maxDeliveryMethods);
  }

  assertCount(label, code, current, next, rawLimit) {
    const limit = numericLimit(rawLimit);
    if (limit === 0 || next <= limit || next <= current) return;
    throw new AppError(`Tu plan permite hasta ${limit} ${label} por tienda.`, 403, code, { limit, current, next });
  }
}

export const commercePlanLimitService = new CommercePlanLimitService();

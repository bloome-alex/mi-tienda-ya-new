const DAY = 86400000;
const asDate = value => value ? new Date(value) : null;
const money = value => Math.round(Number(value || 0) * 100) / 100;

export class SubscriptionBillingPolicy {
  state({ user, subscription, settings, now = new Date() }) {
    const plan = subscription?.planSnapshot;
    const paidThrough = asDate(subscription?.currentPeriodEnd || user?.planExpiresAt);
    const graceDays = Number(settings?.subscriptionGraceDays ?? 7);
    const intentionallyStopped = Boolean(subscription?.cancelAtPeriodEnd || ['cancelled', 'detached'].includes(subscription?.status));
    const automatic = Boolean(subscription && subscription.current && !intentionallyStopped && ['authorized', 'payment_failed', 'paused'].includes(subscription.status));
    let periodsDue = 0;
    let debtAmount = 0;
    let graceUntil = null;
    let inGrace = false;
    let graceExpired = false;

    if (automatic && paidThrough && now >= paidThrough && plan?.durationDays > 0) {
      const elapsed = Math.max(0, now.getTime() - paidThrough.getTime());
      periodsDue = Math.floor(elapsed / (Number(plan.durationDays) * DAY)) + 1;
      debtAmount = money(periodsDue * Number(plan.price || 0));
      graceUntil = new Date(paidThrough.getTime() + graceDays * DAY);
      inGrace = now < graceUntil;
      graceExpired = now >= graceUntil;
    }

    return {
      automatic,
      paidThrough,
      graceDays,
      graceUntil,
      inGrace,
      graceExpired,
      periodsDue,
      debtAmount,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      providerStatus: subscription?.providerStatus || '',
      status: subscription?.status || 'none',
      nextPaymentAt: subscription?.nextPaymentAt || null,
      lastPaymentAt: subscription?.lastPaymentAt || null,
      lastPaymentStatus: subscription?.lastPaymentStatus || '',
      lastFailureAt: subscription?.lastFailureAt || null,
    };
  }
}

export const subscriptionBillingPolicy = new SubscriptionBillingPolicy();

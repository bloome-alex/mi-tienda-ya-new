import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionBillingPolicy } from '../src/services/SubscriptionBillingPolicy.js';

const policy = new SubscriptionBillingPolicy();
const base = new Date('2026-01-01T00:00:00.000Z');
const subscription = {
  current: true,
  status: 'payment_failed',
  currentPeriodEnd: base,
  planSnapshot: { name: 'Plan', price: 5500, durationDays: 30 },
};

test('mantiene el servicio durante la cortesía y acumula períodos adeudados', () => {
  const state = policy.state({ user: {}, subscription, settings: { subscriptionGraceDays: 65 }, now: new Date('2026-03-02T00:00:00.000Z') });
  assert.equal(state.inGrace, true);
  assert.equal(state.graceExpired, false);
  assert.equal(state.periodsDue, 3);
  assert.equal(state.debtAmount, 16500);
  assert.equal(state.graceUntil.toISOString(), '2026-03-07T00:00:00.000Z');
});

test('al cumplirse exactamente el límite de cortesía el servicio queda fuera de gracia', () => {
  const state = policy.state({ user: {}, subscription, settings: { subscriptionGraceDays: 65 }, now: new Date('2026-03-07T00:00:00.000Z') });
  assert.equal(state.inGrace, false);
  assert.equal(state.graceExpired, true);
});

test('cancelar renovación no genera deuda nueva luego del período ya pagado', () => {
  const state = policy.state({ user: {}, subscription: { ...subscription, status: 'cancelled', cancelAtPeriodEnd: true }, settings: { subscriptionGraceDays: 65 }, now: new Date('2026-04-01T00:00:00.000Z') });
  assert.equal(state.automatic, false);
  assert.equal(state.periodsDue, 0);
  assert.equal(state.debtAmount, 0);
});

test('la duración de cada plan gobierna el número de períodos adeudados', () => {
  const state = policy.state({ user: {}, subscription: { ...subscription, planSnapshot: { price: 1000, durationDays: 10 } }, settings: { subscriptionGraceDays: 40 }, now: new Date('2026-01-26T00:00:00.000Z') });
  assert.equal(state.periodsDue, 3);
  assert.equal(state.debtAmount, 3000);
});

test('una cancelación involuntaria del proveedor no perdona deuda ni cortesía', () => {
  const paidThrough = new Date('2026-01-01T00:00:00.000Z');
  const state = policy.state({
    user: { planExpiresAt: paidThrough },
    subscription: {
      current: true,
      status: 'payment_failed',
      providerStatus: 'cancelled',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: paidThrough,
      planSnapshot: { durationDays: 30, price: 5500 },
    },
    settings: { subscriptionGraceDays: 65 },
    now: new Date('2026-03-05T00:00:00.000Z'),
  });
  assert.equal(state.automatic, true);
  assert.equal(state.periodsDue, 3);
  assert.equal(state.debtAmount, 16500);
  assert.equal(state.inGrace, true);
  assert.equal(state.graceExpired, false);
});

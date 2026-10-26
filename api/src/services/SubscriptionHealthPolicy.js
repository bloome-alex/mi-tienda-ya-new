const stopped = value => ['canceled', 'cancelled'].includes(String(value || '').toLowerCase());

/**
 * Convierte estados técnicos de Mercado Pago en acciones de recuperación de UI.
 * La política no ejecuta efectos externos: sólo describe el estado y las acciones seguras.
 */
export class SubscriptionHealthPolicy {
  issue({ subscription }) {
    if (!subscription?.current) return null;
    if (subscription.status === 'pending' && subscription.checkoutRequestStartedAt && !subscription.providerSubscriptionId && !subscription.checkoutUrl) {
      return {
        code: 'checkout_uncertain',
        title: 'Algo pasó al crear la vinculación con Mercado Pago.',
        message: 'No pudimos confirmar si Mercado Pago llegó a crear el intento. Para evitar una suscripción duplicada no vamos a generar otro automáticamente. Cancelá este intento y luego iniciá una nueva vinculación.',
        canRecover: false,
        canResume: false,
        canCut: true,
        cutLabel: 'Cancelar intento',
      };
    }
    if (!subscription.providerSubscriptionId) return null;
    if (subscription.cancelAtPeriodEnd || ['cancelled', 'detached'].includes(subscription.status)) return null;

    // Un fallo de sincronización vuelve incierto cualquier estado local conocido. No ofrecemos
    // acciones destructivas/recuperación hasta consultar nuevamente al proveedor.
    if (subscription.lastSyncErrorAt && subscription.lastSyncError) {
      return {
        code: 'sync_error',
        title: 'No pudimos verificar el estado de tu suscripción.',
        message: 'La última sincronización con Mercado Pago falló. Volvé a actualizar el estado antes de tomar una decisión sobre la suscripción.',
        canRecover: false,
        canResume: false,
        canCut: false,
      };
    }

    const providerStatus = String(subscription.providerStatus || '').toLowerCase();
    if (stopped(providerStatus)) {
      return {
        code: 'provider_cancelled',
        title: 'Algo pasó con tu suscripción de Mercado Pago.',
        message: 'Mercado Pago canceló la autorización fuera de MiTiendaYa y ya no podrá generar nuevos cobros. Podés generar una nueva vinculación o cortar esta suscripción. El tiempo ya pagado se conserva.',
        canRecover: true,
        canResume: false,
        canCut: true,
      };
    }

    if (providerStatus === 'paused' || subscription.status === 'paused') {
      return {
        code: 'provider_paused',
        title: 'Tu suscripción está pausada en Mercado Pago.',
        message: 'Mientras permanezca pausada no se generarán nuevos cobros. Podés reanudarla desde MiTiendaYa o cortar la vinculación.',
        canRecover: false,
        canResume: true,
        canCut: true,
      };
    }

    if (subscription.status === 'payment_failed') {
      return {
        code: 'payment_failed',
        title: 'No se pudo acreditar un cobro de tu suscripción.',
        message: 'La autorización sigue activa y Mercado Pago puede reintentar el cobro automáticamente. No generamos una segunda suscripción mientras esos reintentos sigan vigentes.',
        canRecover: false,
        canResume: false,
        canCut: true,
      };
    }

    return null;
  }
}

export const subscriptionHealthPolicy = new SubscriptionHealthPolicy();

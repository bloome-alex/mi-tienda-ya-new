<script setup>
import { computed, ref, reactive, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { useStorefront } from '../../services/storefront.js';
import { storefrontSlug } from '../../services/storeHost.js';
import { StoreCopy } from '../../services/storeCopy.js';
import { StoreTextLayout } from '../../services/storeNavigation.js';
import { money } from '../../services/format.js';
import { notify } from '../../services/notifications.js';
import { checkoutTerms, validateCheckout } from '../../services/checkoutValidation.js';
import { sectionSpacing } from '../../services/design.js';
import ProductImage from '../../components/ProductImage.vue';
import Icon from '../../components/Icon.vue';

const sf = useStorefront(), route = useRoute(), router = useRouter();
const currentSlug = computed(() => storefrontSlug(route));
const copy=new StoreCopy(()=>sf.design.value);
const step = ref(1), formElement = ref(null), busy = ref(false), loading = ref(false), error = ref(''), refreshError = ref(''), accepted = ref(false), issues = ref([]);
const customer = reactive({ name: '', email: '', phone: '', address: '', city: '', postalCode: '', notes: sf.cart.value.state.notes });
const deliveryId = ref(''), paymentId = ref('');
const cart = computed(() => sf.cart.value), design = computed(() => sf.design.value.checkout), single = computed(() => design.value.layout === 'single');
const terms = computed(() => checkoutTerms(sf.design.value));
const hasPhysical = computed(() => cart.value.state.items.some(item => item.type === 'physical'));
const requiresPhone = computed(() => design.value.requirePhone || hasPhysical.value);
const deliveries = computed(() => (sf.store.value.deliveries || []).filter(delivery => delivery.active && (!hasPhysical.value || delivery.type !== 'digital')));
const delivery = computed(() => deliveries.value.find(item => item.id === deliveryId.value));
const payments = computed(() => (sf.store.value.payments || []).filter(payment => payment.active && delivery.value && (!payment.deliveryIds?.length || payment.deliveryIds.includes(deliveryId.value))));
const payment = computed(() => payments.value.find(item => item.id === paymentId.value));
const requiresAddress = computed(() => ['shipping', 'custom'].includes(delivery.value?.type));
const total = computed(() => cart.value.subtotal + Number(delivery.value?.price || 0));
const invalid = computed(() => cart.value.state.items.some(item => item.unavailable || item.type !== 'digital' && !item.madeToOrder && item.quantity > item.stock));
const fieldError = field => issues.value.find(issue => issue.field === field)?.message || '';
function validation(scope = 'all') {
  return validateCheckout({ customer, requiresPhone: requiresPhone.value, requiresAddress: requiresAddress.value, delivery: delivery.value, payment: payment.value, termsRequired: terms.value.required, termsAccepted: accepted.value, scope });
}
watch(deliveryId, () => { if (!payments.value.some(item => item.id === paymentId.value)) paymentId.value = payments.value.length === 1 ? payments.value[0].id : ''; });
watch(() => JSON.stringify([sf.design.value.terms, design.value.termsUrl, design.value.termsLabel]), () => { accepted.value = false; });
watch([customer, deliveryId, paymentId, accepted], () => {
  if (!issues.value.length) return;
  const shown = new Set(issues.value.map(issue => issue.field));
  issues.value = validation().filter(issue => shown.has(issue.field));
}, { deep: true });
async function focusIssue(issue) {
  if (!issue) return;
  if (!single.value) step.value = issue.step;
  await nextTick();
  const target = document.getElementById(issue.id);
  const focusTarget = target?.matches('input,textarea,select,button') ? target : target?.querySelector('input,button') || target;
  focusTarget?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
async function check(scope = 'all') {
  issues.value = validation(scope);
  if (!issues.value.length) return true;
  const first = issues.value[0];
  notify.error(issues.value.length > 1 ? `${first.message} Hay ${issues.value.length} datos por revisar.` : first.message);
  await focusIssue(first);
  return false;
}
function showError(message) { error.value = message; notify.error(message); }
async function next() {
  error.value = '';
  if (busy.value || loading.value) return;
  if (!(await check(step.value === 1 ? 'customer' : 'delivery'))) return;
  step.value = Math.min(3, step.value + 1);
  await nextTick();
  formElement.value?.querySelector('input,button')?.focus({ preventScroll: true });
}
async function placeOrder() {
  error.value = '';
  if (busy.value || loading.value) return;
  if (!(await check())) return;
  if (refreshError.value) return showError('No pudimos actualizar precios y stock. Reintentá la actualización antes de confirmar.');
  if (invalid.value) return showError('Actualizá los productos de tu carrito antes de continuar.');
  if (sf.isPreview.value) { notify.info('Los datos están completos. La vista previa no crea pedidos: la compra se confirma desde la tienda publicada.'); return; }
  busy.value = true;
  try {
    const body = { customer: Object.fromEntries(Object.entries(customer).map(([key, value]) => [key, value.trim()])), deliveryId: deliveryId.value, paymentId: paymentId.value, termsAccepted: accepted.value, items: cart.value.state.items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) };
    body.idempotencyKey = cart.value.checkoutKey(JSON.stringify(body));
    const result = await api.post(`/public/stores/${currentSlug.value}/orders`, body);
    const tracking = { path: '/pedido/' + result.order._id, query: { token: result.accessToken } };
    try { sessionStorage.setItem('mty-last-order', JSON.stringify({ id: result.order._id, token: result.accessToken })); } catch {}
    cart.value.clear();
    await router.replace(tracking);
    if (result.checkoutUrl) location.assign(result.checkoutUrl);
  } catch (failure) {
    showError(failure.message);
    if (['ORDER_ALREADY_CANCELLED', 'ORDER_CANCELLED'].includes(failure.code)) cart.value.changed();
  } finally { busy.value = false; }
}
async function refreshCart() {
  loading.value = true; refreshError.value = '';
  try { await cart.value.refresh(sf.getProduct); if (deliveries.value.length === 1) deliveryId.value = deliveries.value[0].id; }
  catch (failure) { refreshError.value = failure.message; }
  finally { loading.value = false; }
}
onMounted(refreshCart);
</script>

<template>
  <div class="store-checkout-page" :class="'checkout-style-' + design.style" :style="{...sectionSpacing(design),...StoreTextLayout.style(design.textAlign)}" :dir="StoreTextLayout.direction(design.textDirection)">
    <div class="store-page-heading"><RouterLink :to="sf.link('/carrito')" class="store-back"><Icon name="arrow-left" :size="16"/> {{copy.text('checkoutBack')}}</RouterLink><h1>{{design.title}}</h1><p class="store-muted">{{copy.text('checkoutSubtitle')}}</p></div>
    <div v-if="!cart.state.items.length" class="store-empty"><h2>{{copy.text('checkoutEmptyTitle')}}</h2><RouterLink :to="sf.link()" class="store-button">{{copy.text('cartEmptyButton')}}</RouterLink></div>
    <div v-else class="checkout-layout" :class="{'no-summary':!design.showOrderSummary}">
      <div>
        <nav v-if="!single" class="checkout-steps" aria-label="Pasos para comprar"><button v-for="(label,index) in [copy.text('checkoutStepCustomer'),copy.text('checkoutStepDelivery'),copy.text('checkoutStepPayment')]" :key="index" :class="{current:step===index+1,complete:step>index+1}" :disabled="step<index+1||busy" :aria-current="step===index+1?'step':undefined" @click="step=index+1"><span><Icon v-if="step>index+1" name="check" :size="15"/><template v-else>{{index+1}}</template></span>{{label}}</button></nav>
        <div v-if="error" class="notice error" role="alert">{{error}}</div>
        <div v-if="issues.length" class="checkout-validation notice error" role="alert"><strong>Revisá estos datos para continuar</strong><ul><li v-for="issue in issues" :key="issue.field"><button type="button" @click="focusIssue(issue)">{{issue.message}}</button></li></ul></div>
        <div v-if="refreshError" class="notice error" role="alert">{{refreshError}} <button type="button" class="link" :disabled="loading" @click="refreshCart">Reintentar actualización</button></div>
        <div v-if="invalid" class="notice warning">Hay productos que requieren una actualización. <RouterLink :to="sf.link('/carrito')" class="link">Revisar carrito</RouterLink></div>
        <form ref="formElement" class="checkout-form" novalidate @submit.prevent="!single&&step<3?next():placeOrder()">
          <section v-if="single||step===1" class="checkout-card">
            <div class="checkout-section-title"><span>01</span><div><h2>{{copy.text('checkoutCustomerTitle')}}</h2><p>{{copy.text('checkoutCustomerDescription')}}</p></div></div>
            <div class="form-grid">
              <div class="field span-2"><label for="buyer-name">{{copy.text('checkoutName')}} <span aria-hidden="true">*</span></label><input id="buyer-name" :aria-label="copy.text('checkoutName')||'Nombre y apellido'" v-model="customer.name" required maxlength="150" autocomplete="name" :placeholder="copy.text('checkoutNamePlaceholder')" :aria-invalid="!!fieldError('name')" :aria-describedby="fieldError('name')?'buyer-name-error':undefined"/><small v-if="fieldError('name')" id="buyer-name-error" class="checkout-field-error">{{fieldError('name')}}</small></div>
              <div class="field span-2"><label for="buyer-email">{{copy.text('checkoutEmail')}} <span aria-hidden="true">*</span></label><input id="buyer-email" :aria-label="copy.text('checkoutEmail')||'Correo electrónico'" v-model="customer.email" type="email" dir="ltr" required maxlength="254" autocomplete="email" :placeholder="copy.text('checkoutEmailPlaceholder')" :aria-invalid="!!fieldError('email')" :aria-describedby="fieldError('email')?'buyer-email-error':'buyer-email-help'"/><small v-if="fieldError('email')" id="buyer-email-error" class="checkout-field-error">{{fieldError('email')}}</small><small id="buyer-email-help">{{copy.text('checkoutEmailHelp')}}</small></div>
              <div v-if="design.showPhone||requiresPhone" class="field span-2"><label for="buyer-phone">{{copy.text('checkoutPhone')}} {{requiresPhone?'*':'(opcional)'}}</label><input id="buyer-phone" :aria-label="copy.text('checkoutPhone')||'Teléfono'" v-model="customer.phone" type="tel" dir="ltr" :required="requiresPhone" maxlength="50" autocomplete="tel" :placeholder="copy.text('checkoutPhonePlaceholder')" :aria-invalid="!!fieldError('phone')" :aria-describedby="fieldError('phone')?'buyer-phone-error':undefined"/><small v-if="fieldError('phone')" id="buyer-phone-error" class="checkout-field-error">{{fieldError('phone')}}</small></div>
            </div>
            <p class="checkout-required-help">{{copy.text('checkoutRequiredHelp')}}</p>
          </section>
          <section v-if="single||step===2" class="checkout-card">
            <div class="checkout-section-title"><span>02</span><div><h2>{{copy.text('checkoutDeliveryTitle')}}</h2><p>{{copy.text('checkoutDeliveryDescription')}}</p></div></div>
            <div v-if="!deliveries.length" class="notice warning">La tienda todavía no tiene formas de entrega disponibles. Contactá al vendedor para coordinar.</div>
            <div id="delivery-options" role="group" aria-label="Forma de entrega" tabindex="-1" :aria-describedby="fieldError('delivery')?'delivery-error':undefined">
              <label v-for="option in deliveries" :key="option.id" class="checkout-option" :class="{selected:deliveryId===option.id}"><input v-model="deliveryId" type="radio" name="delivery" :value="option.id" required :aria-invalid="!!fieldError('delivery')"/><Icon :name="option.type==='pickup'?'store':option.type==='digital'?'mail':'truck'" :size="22"/><span><strong>{{option.name}}</strong><small>{{option.description}}</small></span><b>{{option.price?money(option.price):copy.text('freeDelivery')}}</b></label>
            </div>
            <small v-if="fieldError('delivery')" id="delivery-error" class="checkout-field-error">{{fieldError('delivery')}}</small>
            <div v-if="requiresAddress" class="form-grid checkout-address">
              <div class="field span-2"><label for="buyer-address">{{copy.text('checkoutAddress')}} *</label><input id="buyer-address" :aria-label="copy.text('checkoutAddress')||'Dirección de entrega'" v-model="customer.address" required maxlength="300" autocomplete="street-address" :placeholder="copy.text('checkoutAddressPlaceholder')" :aria-invalid="!!fieldError('address')" :aria-describedby="fieldError('address')?'buyer-address-error':undefined"/><small v-if="fieldError('address')" id="buyer-address-error" class="checkout-field-error">{{fieldError('address')}}</small></div>
              <div class="field"><label for="buyer-city">{{copy.text('checkoutCity')}} *</label><input id="buyer-city" :aria-label="copy.text('checkoutCity')||'Localidad'" v-model="customer.city" required maxlength="120" autocomplete="address-level2" :aria-invalid="!!fieldError('city')" :aria-describedby="fieldError('city')?'buyer-city-error':undefined"/><small v-if="fieldError('city')" id="buyer-city-error" class="checkout-field-error">{{fieldError('city')}}</small></div>
              <div class="field"><label for="buyer-postal">{{copy.text('checkoutPostal')}} *</label><input id="buyer-postal" :aria-label="copy.text('checkoutPostal')||'Código postal'" v-model="customer.postalCode" required maxlength="30" autocomplete="postal-code" :aria-invalid="!!fieldError('postalCode')" :aria-describedby="fieldError('postalCode')?'buyer-postal-error':undefined"/><small v-if="fieldError('postalCode')" id="buyer-postal-error" class="checkout-field-error">{{fieldError('postalCode')}}</small></div>
            </div>
          </section>
          <section v-if="single||step===3" class="checkout-card">
            <div class="checkout-section-title"><span>03</span><div><h2>{{copy.text('checkoutPaymentTitle')}}</h2><p>{{copy.text('checkoutPaymentDescription')}}</p></div></div>
            <div v-if="!delivery" class="notice">Elegí primero una forma de entrega.</div>
            <div v-else-if="!payments.length" class="notice warning">No hay medios de pago para esta entrega. Elegí otra opción o contactá al vendedor.</div>
            <div id="payment-options" role="group" aria-label="Medio de pago" tabindex="-1" :aria-describedby="fieldError('payment')?'payment-error':undefined">
              <label v-for="option in payments" :key="option.id" class="checkout-option" :class="{selected:paymentId===option.id}"><input v-model="paymentId" type="radio" name="payment" :value="option.id" required :aria-invalid="!!fieldError('payment')"/><Icon name="credit-card" :size="22"/><span><strong>{{option.name}}</strong><small>{{option.type==='mercadopago'?'Continuás en Mercado Pago para completar el pago.':option.type==='transfer'?'Al confirmar, verás los datos bancarios y podrás adjuntar el comprobante.':option.instructions||'El vendedor confirmará el pago manualmente.'}}</small></span></label>
            </div>
            <small v-if="fieldError('payment')" id="payment-error" class="checkout-field-error">{{fieldError('payment')}}</small>
            <div v-if="design.showNotes" class="field checkout-notes"><label for="buyer-notes">{{copy.text('checkoutNotes')}}</label><textarea id="buyer-notes" :aria-label="copy.text('checkoutNotes')||'Notas para el vendedor'" v-model="customer.notes" maxlength="1500" :placeholder="copy.text('checkoutNotesPlaceholder')" :aria-invalid="!!fieldError('notes')"></textarea><small v-if="fieldError('notes')" class="checkout-field-error">{{fieldError('notes')}}</small></div>
            <label v-if="terms.required" class="checkout-terms" :class="{'has-error':fieldError('terms')}"><input id="buyer-terms" v-model="accepted" type="checkbox" required :aria-invalid="!!fieldError('terms')" :aria-describedby="fieldError('terms')?'buyer-terms-error':undefined"/><span><RouterLink v-if="terms.internal" :to="sf.link('/terminos')" :target="sf.isPreview.value?undefined:'_blank'" rel="noopener">{{design.termsLabel || 'Acepto los términos y condiciones'}}</RouterLink><a v-else :href="terms.url" target="_blank" rel="noopener">{{design.termsLabel || 'Acepto los términos y condiciones'}}</a><small v-if="!sf.isPreview.value">{{copy.text('checkoutTermsHelp')}}</small></span></label>
            <small v-if="fieldError('terms')" id="buyer-terms-error" class="checkout-field-error">{{fieldError('terms')}}</small>
            <div class="checkout-final-total"><span>{{copy.text('checkoutTotal')}}</span><strong>{{money(total)}}</strong></div>
            <p v-if="sf.isPreview.value" class="notice">Vista previa del checkout. Podés probar las validaciones; los pedidos se realizan desde la tienda publicada.</p>
          </section>
          <div class="checkout-buttons"><button v-if="!single&&step>1" type="button" class="store-button secondary" :disabled="busy" :aria-label="copy.text('checkoutPrevious')||'Volver'" @click="step--">{{copy.text('checkoutPrevious')}}</button><button v-if="!single&&step<3" class="store-button" :disabled="loading||busy" :aria-label="copy.text('checkoutContinue')||'Continuar'">{{copy.text('checkoutContinue')}} <Icon name="arrow-right" :size="17"/></button><button v-else class="store-button" :disabled="busy||loading" :aria-label="copy.text('checkoutConfirm')||'Confirmar pedido'">{{copy.text(busy?'checkoutProcessing':'checkoutConfirm')}}<Icon v-if="!busy" name="arrow-right" :size="17"/></button></div>
          <p v-if="design.showTrust" class="checkout-trust"><Icon name="shield" :size="16"/>{{design.trustMessage}}</p>
        </form>
      </div>
      <aside v-if="design.showOrderSummary" class="checkout-summary"><span class="store-eyebrow">{{copy.text('checkoutSummaryEyebrow')}}</span><h3>{{copy.text('checkoutSummaryTitle')}}</h3><div v-for="item in cart.state.items" :key="item.key" class="checkout-summary-line"><div><ProductImage :src="item.image" :name="item.name" :type="item.type"/><b>{{item.quantity}}</b></div><span><strong>{{item.name}}</strong><small>{{item.variantName}}</small></span><strong>{{money(item.quantity*item.price)}}</strong></div><div class="checkout-summary-totals"><p><span>{{copy.text('subtotal')}}</span><strong>{{money(cart.subtotal)}}</strong></p><p><span>{{copy.text('delivery')}}</span><strong>{{delivery?delivery.price?money(delivery.price):copy.text('freeDelivery'):copy.text('checkoutDeliveryPending')}}</strong></p><p class="grand-total"><span>{{copy.text('total')}}</span><strong>{{money(total)}}</strong></p></div></aside>
    </div>
  </div>
</template>

<style scoped>
.store-checkout-page{width:100%;max-width:var(--section-max,1280px);margin-inline:auto;padding:var(--section-py,48px) var(--section-px,32px)}
.checkout-summary{top:calc(var(--store-header-offset,82px) + 24px)}.checkout-section-title>div{flex:1;min-width:0}.checkout-section-title :is(h2,p){overflow-wrap:anywhere}.checkout-summary-line>span{min-width:0}.checkout-validation{display:block;margin-bottom:20px}.checkout-validation strong{display:block;margin-bottom:8px}.checkout-validation ul{padding-left:18px;margin:0}.checkout-validation li+li{margin-top:7px}.checkout-validation button{padding:0;background:none;border:0;color:inherit;text-align:start;text-decoration:underline;text-underline-offset:3px;cursor:pointer;font:inherit}
.checkout-field-error{display:block;color:var(--error,#c62828);font-size:.78rem;margin-top:7px;line-height:1.5}.checkout-form [aria-invalid=true]{border-color:var(--error,#c62828);outline-color:var(--error,#c62828)}.checkout-terms.has-error{border:1px solid var(--error,#c62828);border-radius:8px;padding:12px}.checkout-terms small{display:block;margin-top:5px;color:var(--store-muted);font-size:.72rem}.checkout-required-help{font-size:.73rem;color:var(--store-muted);margin:18px 0 0}.checkout-style-minimal .checkout-card{background:transparent;border:0;border-bottom:1px solid var(--store-line);border-radius:0;box-shadow:none;padding-inline:0}.checkout-style-minimal .checkout-summary{background:transparent;border:1px solid var(--store-line);border-radius:0}.checkout-style-minimal .checkout-option{background:transparent;border-radius:0}.checkout-style-minimal .checkout-section-title>span{border-radius:50%}
@media(max-width:650px){.store-checkout-page{padding-inline:min(var(--section-px,32px),24px)}.checkout-summary{top:calc(var(--store-header-offset,82px) + 24px)}.checkout-section-title>div{flex:1;min-width:0}.checkout-section-title :is(h2,p){overflow-wrap:anywhere}.checkout-summary-line>span{min-width:0}.checkout-validation{font-size:.8rem}}
</style>

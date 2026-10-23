<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { workspace } from '../../services/workspace.js';
import { money, shortDate } from '../../services/panel.js';
import { notify, confirmDialog } from '../../services/notifications.js';
import Icon from '../../components/Icon.vue';

const route=useRoute(),router=useRouter();
const data=ref(null),loading=ref(true),busy=ref(''),error=ref(''),payerEmail=ref('');
const entitlement=computed(()=>data.value?.entitlement||{});
const subscription=computed(()=>data.value?.subscription||{});
const currentPlan=computed(()=>data.value?.plan||null);
const days=computed(()=>entitlement.value.expiresAt?Math.max(0,Math.ceil((new Date(entitlement.value.expiresAt).getTime()-Date.now())/86400000)):0);
const isLinked=computed(()=>Boolean(subscription.value.current&&subscription.value.providerSubscriptionId));
const canCancel=computed(()=>isLinked.value&&!subscription.value.cancelAtPeriodEnd&&!['cancelled','detached'].includes(subscription.value.status));
const subscriptionStatus=computed(()=>{
  if(subscription.value.graceExpired)return {label:'Fuera de cortesía',class:'red'};
  if(subscription.value.inGrace)return {label:'Pago pendiente',class:'orange'};
  if(subscription.value.cancelAtPeriodEnd)return {label:'Renovación cancelada',class:'orange'};
  if(subscription.value.status==='authorized')return {label:'Suscripción activa',class:'green'};
  if(subscription.value.status==='pending')return {label:'Pendiente de vinculación',class:'orange'};
  if(subscription.value.status==='payment_failed')return {label:'No se pudo cobrar',class:'red'};
  return {label:entitlement.value.trial?'Prueba gratuita':entitlement.value.allowed?'Plan vigente':'Sin suscripción',class:entitlement.value.allowed?'green':'orange'};
});

async function load({sync=false}={}){
  loading.value=true;error.value='';
  try{data.value=sync?await api.post('/me/subscription/sync',{}):await api.get('/me/subscription');if(!payerEmail.value)payerEmail.value=data.value?.subscription?.payerEmail||data.value?.user?.email||''}
  catch(e){error.value=e.message}
  finally{loading.value=false}
}
async function subscribe(plan){
  if(!data.value?.subscriptionsEnabled){notify.info('La contratación automática todavía no está habilitada por la administración.');return;}
  busy.value=`plan:${plan._id}`;
  try{const result=await api.post('/me/subscription/checkout',{planId:plan._id,payerEmail:payerEmail.value||data.value?.user?.email});if(!result.checkoutUrl)throw new Error('Mercado Pago no devolvió un enlace válido.');window.location.assign(result.checkoutUrl)}
  catch(e){notify.error(e.message)}finally{busy.value=''}
}
async function sync(){busy.value='sync';try{data.value=await api.post('/me/subscription/sync',{});notify.success('Suscripción actualizada.')}catch(e){notify.error(e.message)}finally{busy.value=''}}
function continuePending(){ if(subscription.value.checkoutUrl) window.location.assign(subscription.value.checkoutUrl); }
async function cancel(){
  if(!await confirmDialog({title:'Cancelar renovación automática',message:`Mercado Pago no volverá a cobrar esta suscripción. Tu acceso ya pagado se conserva hasta ${shortDate(subscription.value.paidThrough||entitlement.value.expiresAt)}.`,confirmText:'Cancelar renovación'}))return;
  busy.value='cancel';try{data.value=await api.post('/me/subscription/cancel',{});notify.success('La renovación automática fue cancelada.')}catch(e){notify.error(e.message)}finally{busy.value=''}
}
async function detach(){
  if(!await confirmDialog({title:'Desvincular Mercado Pago',message:'Se cancelará cualquier renovación futura y esta vinculación dejará de ser la activa. El tiempo ya pagado se conserva y luego podrás vincular otra cuenta de Mercado Pago.',confirmText:'Desvincular'}))return;
  busy.value='detach';try{data.value=await api.post('/me/subscription/detach',{});notify.success('Mercado Pago fue desvinculado. Ya podés vincular otra cuenta.')}catch(e){notify.error(e.message)}finally{busy.value=''}
}
onMounted(async()=>{
  const returned=route.query.mercadopago==='return';
  await load({sync:returned});
  if(returned){await router.replace({path:'/app/subscription'});if(!error.value)notify.success('Actualizamos el estado de tu suscripción con Mercado Pago.');}
});
</script>

<template><div><header class="p-page-header"><div><p class="p-eyebrow">TU CUENTA</p><h1>Mi suscripción</h1><p>Administrá tu plan, la renovación automática y la cuenta de Mercado Pago vinculada.</p></div><button v-if="data" class="btn btn-secondary" :disabled="busy==='sync'" @click="sync"><Icon name="refresh" :size="15"/>{{busy==='sync'?'Actualizando…':'Actualizar estado'}}</button></header><div v-if="error" class="p-error">{{error}}</div><div v-if="loading" class="p-loading-page"><span class="p-spinner"/></div><template v-else-if="data">
<section v-if="subscription.periodsDue>0" class="p-info p-warning subscription-debt"><strong>No se pudo acreditar el último pago de tu suscripción.</strong><span>Adeudás {{money(subscription.debtAmount)}} por {{subscription.periodsDue}} {{subscription.periodsDue===1?'período':'períodos'}}.</span><span v-if="subscription.inGrace">Tu servicio continúa activo durante la cortesía hasta {{shortDate(subscription.graceUntil)}}.</span><span v-else-if="subscription.graceExpired">El período de cortesía terminó el {{shortDate(subscription.graceUntil)}}. Tus tiendas dejan de estar publicadas hasta regularizar los cobros pendientes.</span></section>
<section class="p-plan-hero"><div><span class="p-badge" :class="subscriptionStatus.class">{{subscriptionStatus.label}}</span><h2>{{currentPlan?.name||subscription.planSnapshot?.name||'Elegí el plan para tu negocio'}}</h2><p v-if="subscription.paidThrough">Pagado hasta el {{shortDate(subscription.paidThrough)}}.</p><p v-else-if="entitlement.allowed">Disponible hasta el {{shortDate(entitlement.expiresAt)}}.</p><p v-else>Elegí un plan para activar la suscripción automática de tu cuenta.</p></div><Icon name="crown" :size="64"/></section>
<div class="p-plan-details"><article class="p-plan-detail"><span>Estado del servicio</span><strong>{{entitlement.allowed?'Disponible':'Sin publicación'}}</strong><small v-if="entitlement.allowed&&days">{{days}} {{days===1?'día':'días'}} disponibles</small></article><article class="p-plan-detail"><span>Tiendas incluidas</span><strong>{{workspace.stores.length}} / {{entitlement.maxStores||currentPlan?.maxStores||1}}</strong></article><article class="p-plan-detail"><span>Productos por tienda</span><strong>{{entitlement.maxProducts===0?'Ilimitados':entitlement.maxProducts??currentPlan?.maxProducts??'—'}}</strong></article></div>
<section v-if="isLinked" class="p-section-card"><div class="p-section-title"><div><h2>Mercado Pago vinculado</h2><p>La renovación se administra desde esta suscripción de MiTiendaYa.</p></div><span class="p-badge" :class="subscriptionStatus.class">{{subscriptionStatus.label}}</span></div><div class="p-form-grid"><div class="p-field"><label>Cuenta utilizada</label><input :value="subscription.payerEmail||data.user?.email||'Cuenta de Mercado Pago vinculada'" readonly/></div><div class="p-field"><label>Próximo intento / cobro</label><input :value="subscription.nextPaymentAt?shortDate(subscription.nextPaymentAt):subscription.cancelAtPeriodEnd?'Sin renovación programada':'Según calendario de Mercado Pago'" readonly/></div></div><div class="p-inline" style="margin-top:18px"><button v-if="subscription.checkoutUrl&&subscription.status==='pending'" class="btn btn-primary" @click="continuePending">Continuar en Mercado Pago</button><button v-if="canCancel" class="btn btn-secondary" :disabled="!!busy" @click="cancel">Cancelar renovación</button><button class="btn btn-secondary" :disabled="!!busy" @click="detach">Desvincular Mercado Pago</button></div><p v-if="subscription.cancelAtPeriodEnd" class="p-help" style="margin-top:14px">No habrá un nuevo cobro automático. El servicio ya pagado se conserva hasta {{shortDate(subscription.paidThrough)}}.</p></section>
<section class="p-section-card"><div class="p-section-title"><div><h2>Planes disponibles</h2><p>Cada cobro renueva exactamente por los días configurados en el plan.</p></div></div><div v-if="!isLinked" class="p-field" style="max-width:520px;margin-bottom:18px"><label for="subscription-payer-email">Email de la cuenta que vas a usar en Mercado Pago</label><input id="subscription-payer-email" v-model.trim="payerEmail" type="email" autocomplete="email" placeholder="tu-email@ejemplo.com"/><small>Podés usar una cuenta distinta a tu correo de acceso. Si más adelante querés cambiarla, desvinculá la suscripción y volvé a contratar con el nuevo email.</small></div><div class="subscription-plans"><article v-for="plan in data.plans" :key="plan._id" class="subscription-plan" :class="{featured:plan.featured,current:String(plan._id)===String(subscription.planId)}"><div><span v-if="plan.featured" class="p-badge green">Recomendado</span><h3>{{plan.name}}</h3><strong>{{money(plan.price)}}</strong><small>cada {{plan.durationDays}} días</small></div><ul class="p-mini-list"><li v-for="(feature,i) in plan.features" :key="i"><Icon name="check" :size="15"/>{{feature}}</li></ul><button class="btn" :class="plan.featured?'btn-primary':'btn-secondary'" :disabled="!!busy||isLinked" @click="subscribe(plan)">{{busy===`plan:${plan._id}`?'Abriendo Mercado Pago…':String(plan._id)===String(subscription.planId)&&isLinked?'Plan vinculado':'Suscribirme con Mercado Pago'}}</button></article></div><p v-if="!data.subscriptionsEnabled" class="p-info">La contratación automática con Mercado Pago todavía no está habilitada por la administración.</p></section>
</template></div></template>

<style scoped>
.subscription-debt{display:flex;flex-direction:column;gap:4px}.subscription-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.subscription-plan{border:1px solid var(--line);border-radius:11px;padding:20px;background:var(--surface);display:flex;flex-direction:column;gap:17px}.subscription-plan.featured{border-color:var(--line-strong)}.subscription-plan.current{box-shadow:inset 0 0 0 1px var(--line-strong)}.subscription-plan h3{font-size:17px;margin:10px 0 4px}.subscription-plan>div>strong{font-size:25px;display:block}.subscription-plan>div>small{color:var(--muted)}.subscription-plan .p-mini-list{flex:1}.subscription-plan .btn{width:100%}@media(max-width:1050px){.subscription-plans{grid-template-columns:1fr 1fr}}@media(max-width:700px){.subscription-plans{grid-template-columns:1fr}}
</style>

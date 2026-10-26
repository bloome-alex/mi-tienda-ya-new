<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../../services/api.js';
import { money } from '../../services/format.js';
import PlatformLayout from '../../layouts/PlatformLayout.vue';
import Icon from '../../components/Icon.vue';

const config = ref(null);
const loading = ref(true);
const error = ref('');
const sending = ref(false);
const formError = ref('');
const sent = ref(false);
const form = reactive({ email: '', whatsapp: '', description: '' });

const plans = computed(() => config.value?.plans || []);
const featureRows = computed(() => (config.value?.planFeatures || []).flatMap(group => group.features || []));
const comparisonRows = computed(() => [
  { key: '__stores', label: 'Cantidad de tiendas', description: 'Cantidad máxima de tiendas que puede tener el plan.', type: 'capacity' },
  { key: '__products', label: 'Productos por tienda', description: 'Cantidad máxima de productos disponibles en cada tienda.', type: 'capacity' },
  ...featureRows.value.map(feature => ({ ...feature, type: 'feature' })),
]);

async function load() {
  loading.value = true;
  error.value = '';
  try { config.value = await api.get('/public/config'); }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

function capacity(plan, key) {
  if (key === '__stores') return Number(plan.maxStores || 1).toLocaleString('es-AR');
  if (key === '__products') return Number(plan.maxProducts || 0) === 0 ? 'Ilimitados' : Number(plan.maxProducts).toLocaleString('es-AR');
  return '';
}
function included(plan, key) { return Array.isArray(plan.resolvedFeatureKeys) && plan.resolvedFeatureKeys.includes(key); }

async function submit() {
  formError.value = '';
  sent.value = false;
  sending.value = true;
  try {
    await api.post('/public/custom-plan-requests', form);
    sent.value = true;
    form.email = '';
    form.whatsapp = '';
    form.description = '';
  } catch (e) { formError.value = e.message; }
  finally { sending.value = false; }
}

onMounted(load);
</script>

<template>
<PlatformLayout>
  <section class="plans-hero">
    <span class="eyebrow">PLANES MI TIENDA YA</span>
    <h1>Compará cada plan, punto por punto.</h1>
    <p>Encontrá la combinación de capacidad y herramientas que mejor acompaña tu negocio. Los planes que heredan otro nivel ya incluyen automáticamente sus funcionalidades.</p>
  </section>

  <main class="plans-page">
    <div v-if="error" class="notice error">{{error}} <button class="link" type="button" @click="load">Reintentar</button></div>
    <div v-else-if="loading" class="loading"><span class="spinner"></span>Cargando planes</div>
    <section v-else-if="!plans.length" class="plans-empty">
      <Icon name="package" :size="36"/>
      <h2>Estamos preparando nuestros planes.</h2>
      <p>Dejanos tus datos más abajo y armamos una propuesta para vos.</p>
    </section>
    <section v-else class="comparison-card" aria-labelledby="comparison-title">
      <div class="comparison-heading">
        <div><span class="eyebrow">COMPARACIÓN COMPLETA</span><h2 id="comparison-title">Todo lo que incluye cada plan</h2></div>
        <p>Las funcionalidades heredadas y los niveles superiores de diseño aparecen ya incluidos.</p>
      </div>
      <div class="comparison-scroll">
        <table class="comparison-table">
          <thead>
            <tr>
              <th scope="col" class="feature-head">Capacidad y funcionalidades</th>
              <th v-for="plan in plans" :key="plan._id" scope="col" class="plan-head" :class="{featured:plan.featured}">
                <span v-if="plan.featured" class="recommended">RECOMENDADO</span>
                <strong>{{plan.name}}</strong>
                <span class="plan-price">{{money(plan.price)}}</span>
                <small>cada {{plan.durationDays || 30}} días</small>
                <RouterLink to="/login" class="btn btn-small" :class="plan.featured?'btn-primary':'btn-secondary'">Elegir</RouterLink>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparisonRows" :key="row.key" :class="{'capacity-row':row.type==='capacity'}">
              <th scope="row">
                <strong>{{row.label}}</strong>
                <small>{{row.description}}</small>
              </th>
              <td v-for="plan in plans" :key="plan._id + ':' + row.key">
                <strong v-if="row.type==='capacity'" class="capacity-value">{{capacity(plan,row.key)}}</strong>
                <span v-else-if="included(plan,row.key)" class="feature-check" :aria-label="`${row.label} incluido en ${plan.name}`"><Icon name="check" :size="16"/></span>
                <span v-else class="feature-missing" aria-hidden="true">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="custom-plan" aria-labelledby="custom-plan-title">
      <div class="custom-copy">
        <span class="eyebrow">¿NECESITÁS ALGO DISTINTO?</span>
        <h2 id="custom-plan-title">Armemos un plan a tu medida.</h2>
        <p>Contanos qué necesitás para tu negocio. Dejanos un email y un WhatsApp donde podamos contactarte y describí la combinación de capacidad o funcionalidades que estás buscando.</p>
        <div class="custom-note"><Icon name="heart" :size="19"/><span>Revisamos cada solicitud desde Administración para poder contactarte con una propuesta específica.</span></div>
      </div>
      <form class="custom-form" @submit.prevent="submit">
        <div class="form-grid">
          <div class="field"><label for="custom-email">Email *</label><input id="custom-email" v-model.trim="form.email" type="email" maxlength="254" autocomplete="email" placeholder="nombre@ejemplo.com" required/></div>
          <div class="field"><label for="custom-whatsapp">WhatsApp *</label><input id="custom-whatsapp" v-model.trim="form.whatsapp" type="tel" maxlength="60" autocomplete="tel" placeholder="Ej. +54 9 11 1234 5678" required/></div>
        </div>
        <div class="field"><label for="custom-description">¿Qué necesitás? *</label><textarea id="custom-description" v-model.trim="form.description" rows="7" minlength="10" maxlength="5000" placeholder="Contanos cuántas tiendas, productos y qué funcionalidades necesitás..." required></textarea><small>Incluí todo lo que sea importante para armar tu propuesta.</small></div>
        <div v-if="formError" class="notice error" role="alert">{{formError}}</div>
        <div v-if="sent" class="notice success" role="status"><Icon name="check" :size="16"/> Recibimos tu solicitud. Vamos a contactarte con los datos que nos dejaste.</div>
        <button class="btn btn-primary btn-lg" :disabled="sending">{{sending?'Enviando…':'Enviar solicitud'}} <Icon v-if="!sending" name="arrow-right" :size="17"/></button>
      </form>
    </section>
  </main>

  <footer class="plans-footer"><strong>MiTiendaYa</strong><span>Hecho para emprender. Diseñado para crecer.</span><RouterLink to="/">Volver al inicio</RouterLink></footer>
</PlatformLayout>
</template>

<style scoped>
.plans-hero{padding:76px clamp(22px,6vw,90px) 54px;max-width:1320px;margin:auto;text-align:center}.plans-hero h1{font-size:clamp(2.4rem,5vw,4.5rem);letter-spacing:-.065em;line-height:1.02;margin:16px auto 18px;max-width:850px}.plans-hero>p{max-width:700px;margin:auto;color:var(--muted);line-height:1.75;font-size:.96rem}.plans-page{max-width:1320px;margin:auto;padding:0 clamp(18px,4vw,56px) 90px}.comparison-card{border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.04)}.comparison-heading{padding:28px 30px;display:flex;align-items:end;justify-content:space-between;gap:30px;border-bottom:1px solid var(--line)}.comparison-heading h2{margin:7px 0 0;font-size:clamp(1.6rem,2.5vw,2.4rem);letter-spacing:-.045em}.comparison-heading>p{max-width:430px;color:var(--muted);font-size:.82rem;line-height:1.6;margin:0}.comparison-scroll{overflow-x:auto}.comparison-table{border-collapse:collapse;width:100%;min-width:900px;table-layout:fixed}.comparison-table th,.comparison-table td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:17px 18px;vertical-align:middle}.comparison-table tr:last-child th,.comparison-table tr:last-child td{border-bottom:0}.comparison-table th:last-child,.comparison-table td:last-child{border-right:0}.feature-head,.comparison-table tbody th{width:32%;text-align:left}.plan-head{text-align:center;position:relative;padding-top:24px!important;background:var(--surface-alt)}.plan-head.featured{background:color-mix(in srgb,var(--primary) 6%,var(--surface))}.plan-head strong{display:block;font-size:1.04rem}.plan-head .plan-price{display:block;font-weight:800;font-size:1.32rem;margin-top:9px}.plan-head small{display:block;color:var(--muted);font-weight:400;font-size:.67rem;margin:3px 0 12px}.plan-head .btn{display:inline-flex}.recommended{display:inline-block;font-size:.48rem;letter-spacing:.1em;font-weight:800;color:var(--primary);margin-bottom:8px}.comparison-table tbody th strong{display:block;font-size:.8rem}.comparison-table tbody th small{display:block;color:var(--muted);font-weight:400;font-size:.68rem;line-height:1.5;margin-top:4px}.comparison-table td{text-align:center}.capacity-row{background:color-mix(in srgb,var(--surface-alt) 60%,transparent)}.capacity-value{font-size:.86rem}.feature-check{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;margin:auto;background:var(--primary);color:var(--on-primary)}.feature-missing{color:var(--muted);opacity:.55}.plans-empty{text-align:center;padding:70px 20px;border:1px solid var(--line);border-radius:16px}.plans-empty h2{margin:15px 0 8px}.plans-empty p{color:var(--muted)}.custom-plan{margin-top:54px;border-radius:20px;background:var(--text);color:var(--surface);padding:clamp(26px,4vw,52px);display:grid;grid-template-columns:.85fr 1.15fr;gap:clamp(32px,6vw,80px);align-items:start}.custom-plan .eyebrow{color:color-mix(in srgb,var(--surface) 62%,transparent)}.custom-copy h2{font-size:clamp(2rem,3.4vw,3.2rem);line-height:1.05;letter-spacing:-.055em;margin:13px 0 18px}.custom-copy>p{color:color-mix(in srgb,var(--surface) 72%,transparent);line-height:1.75;font-size:.88rem}.custom-note{display:flex;gap:10px;align-items:flex-start;margin-top:28px;padding-top:22px;border-top:1px solid color-mix(in srgb,var(--surface) 18%,transparent);font-size:.72rem;line-height:1.55;color:color-mix(in srgb,var(--surface) 68%,transparent)}.custom-form{background:var(--surface);color:var(--text);border-radius:14px;padding:24px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:grid;gap:7px;margin-bottom:16px}.field label{font-size:.72rem;font-weight:700}.field input,.field textarea{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);padding:12px 13px;font:inherit;font-size:.82rem;outline:none}.field input:focus,.field textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 10%,transparent)}.field textarea{resize:vertical;min-height:145px}.field small{color:var(--muted);font-size:.63rem}.custom-form>.btn{margin-top:2px}.notice.success{display:flex;align-items:center;gap:8px}.plans-footer{max-width:1320px;margin:auto;padding:28px clamp(22px,5vw,60px) 45px;border-top:1px solid var(--line);display:flex;gap:18px;align-items:center;color:var(--muted);font-size:.7rem}.plans-footer strong{color:var(--text);font-size:.95rem}.plans-footer a{margin-left:auto;color:var(--text);font-weight:700}@media(max-width:820px){.comparison-heading{align-items:flex-start;flex-direction:column}.custom-plan{grid-template-columns:1fr}.plans-hero{text-align:left}.plans-hero>p{margin-left:0}.form-grid{grid-template-columns:1fr}.plans-footer{flex-wrap:wrap}.plans-footer a{margin-left:auto}}@media(max-width:520px){.plans-hero{padding-top:48px}.plans-page{padding-inline:12px}.comparison-heading{padding:22px 18px}.custom-plan{border-radius:14px;margin-top:30px;padding:22px 16px}.custom-form{padding:18px 14px}.plans-footer{align-items:flex-start;flex-direction:column}.plans-footer a{margin-left:0}}
</style>

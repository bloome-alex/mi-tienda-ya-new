<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { notify } from '../../services/notifications.js';
import { money } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';

const route=useRoute(),router=useRouter();
const editing=computed(()=>!!route.params.id),loading=ref(true),saving=ref(false),error=ref('');
const featureMeta=ref({groups:[],plans:[]});
const form=reactive({name:'',icon:'store',previousPrice:0,price:0,durationDays:30,featureKeys:[],inheritsPlanId:null,maxStores:1,maxProducts:100,active:true,featured:false,sortOrder:0});
const availableParents=computed(()=>{const current=String(route.params.id||'');return featureMeta.value.plans.filter(plan=>String(plan._id)!==current&&!(plan.inheritanceChain||[]).some(parent=>String(parent._id)===current));});
const parentPlan=computed(()=>availableParents.value.find(plan=>String(plan._id)===String(form.inheritsPlanId||''))||null);
const inheritedKeys=computed(()=>new Set(parentPlan.value?.resolvedFeatureKeys||[]));
const featureByKey=computed(()=>new Map(featureMeta.value.groups.flatMap(group=>group.features).map(feature=>[feature.key,feature])));
const availableKeySet=computed(()=>new Set([...(parentPlan.value?.resolvedFeatureKeys||[]),...form.featureKeys]));
function missingRequirements(feature){return (feature.requires||[]).filter(key=>!availableKeySet.value.has(key))}
function requirementText(feature){return missingRequirements(feature).map(key=>featureByKey.value.get(key)?.label||key).join(', ')}
const effectiveKeys=computed(()=>[...new Set([...(parentPlan.value?.resolvedFeatureKeys||[]),...form.featureKeys])]);
const directPreview=computed(()=>form.featureKeys.filter(key=>!inheritedKeys.value.has(key)).map(key=>featureByKey.value.get(key)?.label||key));

watch(()=>form.inheritsPlanId,()=>{
  let direct=form.featureKeys.filter(key=>!inheritedKeys.value.has(key));
  let changed=true;
  while(changed){changed=false;const available=new Set([...(parentPlan.value?.resolvedFeatureKeys||[]),...direct]);const next=direct.filter(key=>(featureByKey.value.get(key)?.requires||[]).every(required=>available.has(required)));if(next.length!==direct.length){direct=next;changed=true}}
  form.featureKeys=direct;
});

onMounted(async()=>{
  try{
    const [meta,item]=await Promise.all([api.get('/admin/plan-features'),editing.value?api.get(`/admin/plans/${route.params.id}`):Promise.resolve(null)]);
    featureMeta.value=meta;
    if(item) Object.assign(form,{name:item.name,icon:item.icon,previousPrice:item.previousPrice,price:item.price,durationDays:item.durationDays,featureKeys:[...(item.featureKeys||[])],inheritsPlanId:item.inheritsPlanId||null,maxStores:item.maxStores,maxProducts:item.maxProducts,active:item.active,featured:item.featured,sortOrder:item.sortOrder});
  }catch(e){error.value=e.message}finally{loading.value=false}
});

function toggleFeature(key,checked){
  if(inheritedKeys.value.has(key))return;
  const set=new Set(form.featureKeys);
  if(checked)set.add(key);else{set.delete(key);for(const feature of featureByKey.value.values())if((feature.requires||[]).includes(key)&&!inheritedKeys.value.has(feature.key))set.delete(feature.key)}
  form.featureKeys=[...set];
}
function featureChecked(key){return inheritedKeys.value.has(key)||form.featureKeys.includes(key)}
async function save(){
  saving.value=true;error.value='';
  try{
    const payload={name:form.name,icon:form.icon,previousPrice:form.previousPrice,price:form.price,durationDays:form.durationDays,featureKeys:form.featureKeys,inheritsPlanId:form.inheritsPlanId||null,maxStores:form.maxStores,maxProducts:form.maxProducts,active:form.active,featured:form.featured,sortOrder:form.sortOrder};
    if(editing.value)await api.put(`/admin/plans/${route.params.id}`,payload);else await api.post('/admin/plans',payload);
    notify.success('Plan guardado.');router.push('/app/settings?tab=planes');
  }catch(e){error.value=e.message;notify.error(e.message)}finally{saving.value=false}
}
</script>

<template>
<div>
  <RouterLink to="/app/settings?tab=planes" class="p-back-link"><Icon name="back" :size="14"/>Volver a planes</RouterLink>
  <header class="p-page-header"><div><h1>{{editing?'Editar plan':'Creá un plan para crecer'}}</h1><p>Los beneficios del plan son permisos reales de la aplicación. Podés partir de otro plan y sumar funcionalidades.</p></div></header>
  <div v-if="error" class="p-error">{{error}}</div>
  <div v-if="loading" class="p-loading-page"><span class="p-spinner"/></div>
  <form v-else class="p-form" @submit.prevent="save">
    <div class="p-two-column">
      <div>
        <section class="p-section-card">
          <div class="p-section-title"><h2>Identidad y precio</h2></div>
          <div class="p-form-grid">
            <div class="p-field"><label for="plan-name">Nombre *</label><input id="plan-name" v-model.trim="form.name" required maxlength="100"/></div>
            <div class="p-field"><label for="plan-icon">Ícono</label><select id="plan-icon" v-model="form.icon"><option v-for="i in ['store','sparkles','crown','package','chart','star','shield','globe']" :key="i" :value="i">{{i}}</option></select></div>
            <div class="p-field"><label for="plan-price">Precio actual (ARS) *</label><input id="plan-price" v-model.number="form.price" type="number" min="0" step="0.01" required/></div>
            <div class="p-field"><label for="plan-previous">Precio anterior (ARS)</label><input id="plan-previous" v-model.number="form.previousPrice" type="number" min="0" step="0.01"/><small>0 para no mostrar un precio tachado.</small></div>
            <div class="p-field"><label for="plan-duration">Duración del plan (días) *</label><input id="plan-duration" v-model.number="form.durationDays" type="number" min="1" max="3650" step="1" required/></div>
            <div class="p-field"><label for="plan-order">Orden en la página</label><input id="plan-order" v-model.number="form.sortOrder" type="number" min="-1000" max="1000" step="1"/></div>
          </div>
        </section>

        <section class="p-section-card">
          <div class="p-section-title"><div><h2>Capacidad</h2><p>Los cupos siguen siendo propios del plan, aunque herede funcionalidades.</p></div></div>
          <div class="p-form-grid">
            <div class="p-field"><label for="plan-stores">Cantidad de tiendas *</label><input id="plan-stores" v-model.number="form.maxStores" type="number" min="1" max="1000" step="1" required/></div>
            <div class="p-field"><label for="plan-products">Productos por tienda *</label><input id="plan-products" v-model.number="form.maxProducts" type="number" min="0" step="1" required/><small>0 significa productos ilimitados.</small></div>
          </div>
        </section>

        <section class="p-section-card">
          <div class="p-section-title"><div><h2>Funcionalidades y permisos</h2><p>Cada selección habilita la función en el frontend y es validada nuevamente por la API.</p></div><span class="p-badge">{{effectiveKeys.length}} activas</span></div>
          <div class="p-field plan-inheritance">
            <label for="plan-parent">Heredar funcionalidades de otro plan</label>
            <select id="plan-parent" v-model="form.inheritsPlanId"><option :value="null">No heredar</option><option v-for="plan in availableParents" :key="plan._id" :value="plan._id">{{plan.name}}</option></select>
            <small v-if="parentPlan">Este plan incluye todo lo de {{parentPlan.name}} y además las funciones que marques debajo.</small>
            <small v-else>La herencia evita repetir permisos cuando armás niveles Básico → Pro → Premium.</small>
          </div>
          <div class="plan-feature-groups">
            <section v-for="group in featureMeta.groups" :key="group.name" class="plan-feature-group">
              <h3>{{group.name}}</h3>
              <label v-for="feature in group.features" :key="feature.key" class="plan-feature-option" :class="{inherited:inheritedKeys.has(feature.key)}">
                <input type="checkbox" :checked="featureChecked(feature.key)" :disabled="inheritedKeys.has(feature.key)||missingRequirements(feature).length>0" @change="toggleFeature(feature.key,$event.target.checked)"/>
                <span><strong>{{feature.label}}</strong><small>{{feature.description}}</small><small v-if="missingRequirements(feature).length" class="feature-requirement">Requiere: {{requirementText(feature)}}</small></span>
                <span v-if="inheritedKeys.has(feature.key)" class="p-badge">Heredada</span>
              </label>
            </section>
          </div>
          <div class="plan-state-options"><label class="p-check"><input v-model="form.active" type="checkbox"/>Plan disponible</label><label class="p-check"><input v-model="form.featured" type="checkbox"/>Destacar como recomendado</label></div>
        </section>
      </div>

      <aside class="p-order-summary plan-preview">
        <span class="p-badge green" v-if="form.featured">Recomendado</span>
        <div class="plan-preview-icon"><Icon :name="form.icon" :size="35"/></div>
        <h3>{{form.name||'Nombre del plan'}}</h3>
        <del v-if="form.previousPrice>form.price" class="p-muted">{{money(form.previousPrice)}}</del>
        <div class="plan-preview-price">{{money(form.price)}}</div>
        <p class="p-help">cada {{form.durationDays}} días</p><hr class="p-separator"/>
        <ul class="p-mini-list">
          <li v-if="parentPlan"><Icon name="check" :size="14"/><strong>Todo lo de {{parentPlan.name}}</strong></li>
          <li v-for="feature in directPreview" :key="feature"><Icon name="check" :size="14"/>{{feature}}</li>
          <li v-if="!parentPlan&&!directPreview.length" class="p-muted">Todavía no seleccionaste funcionalidades.</li>
        </ul>
      </aside>
    </div>
    <footer class="p-form-footer"><small>Los permisos se aplican al guardar el plan.</small><div class="p-form-actions"><RouterLink to="/app/settings?tab=planes" class="btn btn-secondary">Cancelar</RouterLink><button class="btn btn-primary" :disabled="saving">{{saving?'Guardando...':'Guardar plan'}}</button></div></footer>
  </form>
</div>
</template>

<style scoped>
.plan-inheritance{max-width:620px;margin-bottom:22px}.plan-feature-groups{display:grid;gap:18px}.plan-feature-group{border:1px solid var(--line);border-radius:10px;overflow:hidden}.plan-feature-group h3{margin:0;padding:11px 14px;background:var(--surface-alt);font-size:12px}.plan-feature-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:start;padding:12px 14px;border-top:1px solid var(--line);cursor:pointer;font-weight:400}.plan-feature-option:first-of-type{border-top:0}.plan-feature-option:hover{background:var(--surface-alt)}.plan-feature-option.inherited{cursor:default;background:color-mix(in srgb,var(--surface-alt) 65%,transparent)}.plan-feature-option input{margin-top:2px}.plan-feature-option strong{display:block;font-size:12px}.plan-feature-option small{display:block;color:var(--muted);font-size:10px;margin-top:3px;line-height:1.5}.plan-feature-option .feature-requirement{color:var(--danger);font-weight:600}.plan-state-options{display:flex;gap:22px;flex-wrap:wrap;margin-top:20px}.plan-preview-icon{margin:18px 0;color:var(--primary)}.plan-preview-price{font-size:28px;font-weight:700;color:var(--text)}@media(max-width:700px){.plan-feature-option{grid-template-columns:auto minmax(0,1fr)}.plan-feature-option>.p-badge{grid-column:2;justify-self:start}}
</style>

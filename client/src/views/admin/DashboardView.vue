<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../services/api.js';
import { auditAction,auditActor } from '../../services/audit.js';
import { money,date,statuses } from '../../services/panel.js';
import Icon from '../../components/Icon.vue';
import DataTable from '../../components/DataTable.vue';
import DashboardCharts from '../../components/DashboardCharts.vue';

const data=ref(null),error=ref(''),loading=ref(true);
onMounted(async()=>{try{data.value=await api.get('/admin/dashboard')}catch(e){error.value=e.message}finally{loading.value=false}});
const columns=[{key:'number',label:'Pedido'},{key:'customer.name',label:'Cliente'},{key:'total',label:'Total'},{key:'status',label:'Estado'}];
</script>

<template>
<div>
  <header class="p-page-header">
    <div><p class="p-eyebrow">EL PULSO DE TU PLATAFORMA</p><h1>Todo tu negocio, en un lugar.</h1><p>Un vistazo a tus vendedores, tiendas, suscripciones y actividad reciente.</p></div>
    <RouterLink to="/app/stores/new" class="btn btn-primary"><Icon name="plus" :size="16"/>Crear tienda</RouterLink>
  </header>
  <div v-if="error" class="p-error">{{error}}</div>
  <div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Cargando resumen...</div>
  <template v-else-if="data">
    <div class="p-stats">
      <article v-for="s in [{label:'Vendedores',value:data.users,icon:'users',note:'Usuarios activos de la plataforma'},{label:'Tiendas creadas',value:data.stores,icon:'store',note:`${data.activeStores||0} tiendas publicadas`},{label:'Ventas completadas',value:data.paidOrders,icon:'receipt',note:`${data.productsSold||0} unidades vendidas`},{label:'Volumen vendido',value:money(data.revenue),icon:'chart',note:'Total de todas las tiendas'}]" :key="s.label" class="p-stat">
        <span class="p-stat-icon"><Icon :name="s.icon" :size="17"/></span><span class="p-stat-label">{{s.label}}</span><strong class="p-stat-value">{{s.value??0}}</strong><small class="p-stat-note">{{s.note}}</small>
      </article>
    </div>

    <section class="p-section-card subscription-summary">
      <div class="p-section-title">
        <div><h2>Suscripciones por plan</h2><p>Estimación mensual bruta según los planes asignados a vendedores activos. No descuenta comisiones de Mercado Pago.</p></div>
        <div class="subscription-total"><span>Estimado mensual</span><strong>{{money(data.subscriptions?.estimatedMonthlyRevenue||0)}}</strong></div>
      </div>
      <div v-if="data.subscriptions?.plans?.length" class="subscription-plan-grid">
        <article v-for="plan in data.subscriptions.plans" :key="plan.planId" class="subscription-plan-card">
          <div class="subscription-plan-head"><span class="subscription-plan-icon"><Icon name="crown" :size="16"/></span><span><strong>{{plan.name}}</strong><small v-if="plan.visible===false">Plan oculto</small><small v-else>{{plan.active===false?'Plan desactivado':'Plan disponible'}}</small></span></div>
          <div class="subscription-plan-metrics"><div><span>Usuarios</span><strong>{{plan.users}}</strong></div><div><span>Estimado / mes</span><strong>{{money(plan.estimatedMonthly)}}</strong></div></div>
          <p>{{plan.users}} × {{money(plan.price)}} cada {{plan.durationDays}} días<template v-if="plan.durationDays!==30"> · equivalente {{money(plan.monthlyUnit)}}/mes por usuario</template></p>
        </article>
      </div>
      <div v-else class="subscription-empty">Todavía no hay vendedores activos con planes asignados.</div>
      <div class="subscription-foot"><span><strong>{{data.subscriptions?.withoutPlan||0}}</strong> vendedores activos sin plan asignado</span><span>Proyección informativa; no representa cobros efectivamente acreditados.</span></div>
    </section>

    <div class="p-dashboard-grid">
      <DashboardCharts :series="data.salesSeries" :revenue="data.revenue"/>
      <section class="p-section-card"><div class="p-section-title"><div><h2>Crecer empieza por acá</h2><p>Accesos rápidos a tu plataforma</p></div><Icon name="sparkles" :size="18"/></div><div class="p-checklist"><RouterLink to="/app/users/new"><span><Icon name="users" :size="18"/></span><span><strong>Sumá un nuevo vendedor</strong><small>Asignale su plan y su tienda</small></span><Icon name="chevron" :size="14"/></RouterLink><RouterLink to="/app/settings?tab=home"><span><Icon name="home" :size="18"/></span><span><strong>Personalizá tu página de inicio</strong><small>Contá todo lo que ofrecés</small></span><Icon name="chevron" :size="14"/></RouterLink><RouterLink to="/app/settings?tab=planes"><span><Icon name="crown" :size="18"/></span><span><strong>Diseñá tus planes</strong><small>Beneficios para cada etapa</small></span><Icon name="chevron" :size="14"/></RouterLink></div><hr class="p-separator"/><div class="p-inline"><span class="p-badge green">{{data.products||0}} productos creados</span><span class="p-badge blue">{{data.activeStores||0}} tiendas activas</span></div></section>
    </div>

    <div class="p-dashboard-grid">
      <section><div class="p-section-title"><div><h2>Últimos pedidos</h2><p>La actividad comercial de tus tiendas</p></div></div><DataTable :rows="data.recentOrders||[]" :columns="columns" :searchable="false" :limit="5" empty-text="Las primeras ventas están por llegar."><template #cell-total="{value}"><strong>{{money(value)}}</strong></template><template #cell-status="{value}"><span class="p-badge" :class="value">{{statuses[value]||value}}</span></template></DataTable></section>
      <section class="p-section-card"><div class="p-section-title"><div><h2>Actividad reciente</h2><p>Operaciones de la plataforma</p></div><RouterLink to="/app/audit" class="btn btn-text">Ver todo</RouterLink></div><div v-for="item in (data.activity||[]).slice(0,6)" :key="item._id" class="p-activity-item"><span><Icon name="check" :size="14"/></span><div class="activity-copy"><RouterLink :to="'/app/audit/'+item._id"><strong>{{auditAction(item)}}</strong></RouterLink><div class="activity-meta"><small>{{auditActor(item)}}<template v-if="item.store?.name"> · {{item.store.name}}</template></small><time :datetime="item.createdAt">{{date(item.createdAt)}}</time></div></div></div><p v-if="!data.activity?.length" class="p-muted">Las operaciones aparecerán acá.</p></section>
    </div>
  </template>
</div>
</template>

<style scoped>
.subscription-summary{margin-bottom:24px}.subscription-summary>.p-section-title{align-items:flex-start}.subscription-total{text-align:right;min-width:190px}.subscription-total span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.subscription-total strong{display:block;font-size:25px;margin-top:4px}.subscription-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.subscription-plan-card{border:1px solid var(--line);border-radius:10px;padding:16px;background:var(--surface-alt)}.subscription-plan-head{display:flex;gap:10px;align-items:center}.subscription-plan-icon{width:32px;height:32px;border-radius:8px;background:var(--surface);display:grid;place-items:center;color:var(--primary);border:1px solid var(--line)}.subscription-plan-head strong,.subscription-plan-head small{display:block}.subscription-plan-head small{font-size:9px;color:var(--muted);margin-top:2px}.subscription-plan-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}.subscription-plan-metrics div{padding:10px;background:var(--surface);border:1px solid var(--line);border-radius:8px}.subscription-plan-metrics span{display:block;color:var(--muted);font-size:9px}.subscription-plan-metrics strong{display:block;margin-top:3px;font-size:15px}.subscription-plan-card p{margin:11px 0 0;color:var(--muted);font-size:9px;line-height:1.55}.subscription-foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.subscription-empty{padding:18px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:11px}.activity-copy{min-width:0;flex:1}.activity-meta{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:3px}.activity-meta small{display:block;min-width:0}.activity-meta time{display:block;flex:none;color:var(--muted);font-size:9px;white-space:nowrap}@media(max-width:1100px){.subscription-plan-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.subscription-summary>.p-section-title{display:grid}.subscription-total{text-align:left}.subscription-plan-grid{grid-template-columns:1fr}.activity-meta{display:grid;gap:2px}.activity-meta time{white-space:normal}}
</style>

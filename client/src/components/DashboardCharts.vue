<script setup>
import { computed } from 'vue';
import { money } from '../services/panel.js';
import Icon from './Icon.vue';
const props=defineProps({series:{type:Array,default:()=>[]},revenue:Number});
const data=computed(()=>{const totals=new Map(props.series.map(x=>[x.date||x._id||x.label,Number(x.revenue??x.total??x.value??0)])); const today=new Date(); const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(today); const anchor=new Date(`${localDate}T12:00:00Z`);return Array.from({length:30},(_,i)=>{const date=new Date(anchor);date.setUTCDate(date.getUTCDate()-29+i);const label=date.toISOString().slice(0,10);return {label,value:totals.get(label)||0};});});
const chartTotal=computed(()=>data.value.reduce((sum,x)=>sum+x.value,0));
const max=computed(()=>Math.max(1,...data.value.map(x=>x.value)));
const short=v=>v.length>9?v.slice(5,10):v;
</script>
<template><div class="p-section-card"><div class="p-section-title"><div><h2>Evolución de ventas</h2><p>Ingresos de pedidos pagados</p></div><span class="p-badge">Últimos 30 días</span></div><div class="p-chart-summary"><strong>{{money(chartTotal)}}</strong><span>En los últimos 30 días</span></div><div v-if="data.some(x=>x.value>0)" class="p-bars" role="img" aria-label="Ingresos por día"><div v-for="(item,i) in data" :key="i" class="p-bar-item" :title="`${item.label}: ${money(item.value)}`"><span :style="{height:`${Math.max(2,item.value/max*90)}%`}"/><small v-if="i%7===0||i===29">{{short(item.label)}}</small></div></div><div v-else class="p-chart-empty"><Icon name="chart" :size="30"/><span>Tus ventas van a darle vida a este gráfico.</span><small>Se actualiza con cada pedido pagado.</small></div><div v-if="data.some(x=>x.value>0)" style="height:25px"/></div></template>

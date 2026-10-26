<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../services/api.js';
import { date } from '../../services/panel.js';
import { whatsappUrl } from '../../services/format.js';
import Icon from '../../components/Icon.vue';

const route=useRoute();
const item=ref(null),loading=ref(true),error=ref('');
async function load(){loading.value=true;error.value='';try{item.value=await api.get(`/admin/custom-plan-requests/${route.params.id}`)}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load);
const statusLabel=value=>({new:'Nueva',contacted:'Contactada',closed:'Cerrada'}[value]||value||'Nueva');
</script>

<template>
<div>
  <header class="p-page-header">
    <div><p class="p-eyebrow">PLANES A MEDIDA</p><h1>Solicitud de plan</h1><p>Revisá el pedido completo y contactá a la persona desde sus datos declarados.</p></div>
    <RouterLink class="btn btn-secondary" to="/app/custom-plan-requests"><Icon name="back" :size="15"/>Volver al listado</RouterLink>
  </header>
  <div v-if="error" class="p-error">{{error}} <button class="btn btn-text" type="button" @click="load">Reintentar</button></div>
  <div v-else-if="loading" class="p-loading-page"><span class="p-spinner"/>Cargando solicitud...</div>
  <template v-else-if="item">
    <section class="p-section-card request-summary">
      <div class="p-section-title"><div><h2>Datos de contacto</h2><p>Solicitud recibida el {{date(item.createdAt)}}.</p></div><span class="badge">{{statusLabel(item.status)}}</span></div>
      <dl class="request-facts">
        <div><dt>Email</dt><dd><a :href="`mailto:${item.email}`">{{item.email}}</a></dd></div>
        <div><dt>WhatsApp</dt><dd><a :href="whatsappUrl(item.whatsapp,'Hola, te contacto por tu solicitud de un plan personalizado en MiTiendaYa.')" target="_blank" rel="noopener">{{item.whatsapp}}</a></dd></div>
        <div><dt>Identificador</dt><dd><code>{{item._id}}</code></dd></div>
      </dl>
      <div class="request-actions"><a class="btn btn-secondary" :href="`mailto:${item.email}`"><Icon name="mail" :size="15"/>Enviar email</a><a class="btn btn-primary" :href="whatsappUrl(item.whatsapp,'Hola, te contacto por tu solicitud de un plan personalizado en MiTiendaYa.')" target="_blank" rel="noopener"><Icon name="whatsapp" :size="15"/>Abrir WhatsApp</a></div>
    </section>
    <section class="p-section-card">
      <div class="p-section-title"><div><h2>Qué necesita</h2><p>Descripción enviada desde la página pública de planes.</p></div><Icon name="receipt"/></div>
      <p class="request-message">{{item.description}}</p>
    </section>
  </template>
</div>
</template>

<style scoped>
.request-summary{display:grid;gap:24px}.request-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:0}.request-facts>div{padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface-alt)}.request-facts dt{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.request-facts dd{margin:7px 0 0;font-size:13px;overflow-wrap:anywhere}.request-facts a{color:var(--text);font-weight:650}.request-facts a:hover{color:var(--primary)}.request-facts code{font-size:11px}.request-actions{display:flex;gap:10px;flex-wrap:wrap}.request-message{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:13px;max-width:900px}@media(max-width:760px){.request-facts{grid-template-columns:1fr}}
</style>

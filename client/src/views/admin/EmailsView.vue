<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../../services/api.js';
import { confirmDialog, notify } from '../../services/notifications.js';
import Icon from '../../components/Icon.vue';

const loading=ref(true),sending=ref(false),error=ref('');
const meta=reactive({templates:[],recipientCount:0,smtpConfigured:false});
const form=reactive({template:'release',subject:'Novedades de MiTiendaYa',title:'Una nueva versión ya está disponible',version:'',message:'Seguimos mejorando MiTiendaYa para que administrar y hacer crecer tu tienda sea cada vez más simple.',changesText:'',ctaText:'Entrar a MiTiendaYa',ctaUrl:window.location.origin+'/app/dashboard'});
const changes=computed(()=>form.changesText.split('\n').map(value=>value.replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0,30));
const selectedTemplate=computed(()=>meta.templates.find(item=>item.key===form.template));

onMounted(load);
async function load(){loading.value=true;error.value='';try{Object.assign(meta,await api.get('/admin/emails'))}catch(e){error.value=e.message}finally{loading.value=false}}
async function send(){
  if(sending.value)return;
  if(!await confirmDialog({title:'Enviar email a vendedores',message:`Se enviará este mensaje a ${meta.recipientCount} vendedores con email. El envío comienza inmediatamente.`,confirmText:'Enviar emails'}))return;
  sending.value=true;error.value='';
  try{
    const result=await api.post('/admin/emails/send',{template:form.template,subject:form.subject,title:form.title,version:form.version,message:form.message,changes:changes.value,ctaText:form.ctaText,ctaUrl:form.ctaUrl});
    if(result.failed) notify.info(`Envío finalizado: ${result.sent} enviados y ${result.failed} con error.`); else notify.success(`Email enviado a ${result.sent} vendedores.`);
  }catch(e){error.value=e.message;notify.error(e.message)}finally{sending.value=false}
}
</script>

<template><div>
<header class="p-page-header"><div><p class="p-eyebrow">COMUNICACIÓN</p><h1>Emails a vendedores</h1><p>Elegí una plantilla, prepará el contenido y enviá el mensaje a todos los vendedores con email.</p></div><span class="p-badge" :class="meta.smtpConfigured?'green':'orange'"><Icon name="mail" :size="13"/>{{meta.smtpConfigured?'SMTP configurado':'SMTP sin configurar'}}</span></header>
<div v-if="error" class="p-error">{{error}}</div><div v-if="loading" class="p-loading-page"><span class="p-spinner"/>Preparando plantillas...</div>
<div v-else class="mail-admin-grid">
<form class="p-form" @submit.prevent="send">
<section class="p-section-card"><div class="p-section-title"><div><h2>Mensaje</h2><p>{{selectedTemplate?.description}}</p></div><Icon name="mail"/></div>
<div class="p-form-grid">
<div class="p-field full"><label for="mail-template">Plantilla</label><select id="mail-template" v-model="form.template"><option v-for="item in meta.templates" :key="item.key" :value="item.key">{{item.name}}</option></select><small>La plantilla cambia la presentación del email; el contenido se completa acá.</small></div>
<div class="p-field full"><label for="mail-subject">Asunto</label><input id="mail-subject" v-model.trim="form.subject" maxlength="180" required/></div>
<div class="p-field" :class="{full:form.template!=='release'}"><label for="mail-title">Título</label><input id="mail-title" v-model.trim="form.title" maxlength="180" required/></div>
<div v-if="form.template==='release'" class="p-field"><label for="mail-version">Versión</label><input id="mail-version" v-model.trim="form.version" maxlength="60" placeholder="Ej. 1.14.0"/></div>
<div class="p-field full"><label for="mail-message">Mensaje</label><textarea id="mail-message" v-model.trim="form.message" maxlength="5000" rows="6" required/></div>
<div v-if="form.template==='release'" class="p-field full"><label for="mail-changes">Cambios de la versión</label><textarea id="mail-changes" v-model="form.changesText" maxlength="10000" rows="7" placeholder="Un cambio por línea\nMejoramos el diseño del panel\nAgregamos nuevas herramientas"/><small>Cada línea se mostrará como un punto separado dentro de la plantilla.</small></div>
<div class="p-field"><label for="mail-cta">Texto del botón</label><input id="mail-cta" v-model.trim="form.ctaText" maxlength="80" placeholder="Entrar a MiTiendaYa"/></div>
<div class="p-field"><label for="mail-url">Destino del botón</label><input id="mail-url" v-model.trim="form.ctaUrl" type="url" maxlength="2048" placeholder="https://..."/></div>
</div></section>
<footer class="p-form-footer"><small>{{meta.recipientCount}} vendedores con email recibirán este email.</small><div class="p-form-actions"><button class="btn btn-primary" :disabled="sending||!meta.smtpConfigured||!meta.recipientCount"><Icon name="mail" :size="15"/>{{sending?'Enviando...':`Enviar a ${meta.recipientCount} vendedores`}}</button></div></footer>
</form>
<aside class="mail-preview-wrap"><p class="p-nav-label">VISTA PREVIA</p><div class="mail-preview" :class="`mail-preview-${form.template}`"><div class="mail-preview-brand">MiTiendaYa</div><div class="mail-preview-body"><span class="mail-preview-eyebrow">{{form.template==='release'?'NOVEDADES DE PRODUCTO':form.template==='maintenance'?'INFORMACIÓN IMPORTANTE':'COMUNICADO'}}</span><span v-if="form.template==='release'&&form.version" class="mail-preview-version">Versión {{form.version}}</span><h2>{{form.title||'Título del mensaje'}}</h2><p>{{form.message||'El contenido del email aparecerá acá.'}}</p><div v-if="form.template==='release'&&changes.length" class="mail-preview-changes"><strong>Qué cambió</strong><ul><li v-for="item in changes" :key="item">{{item}}</li></ul></div><span v-if="form.ctaText" class="mail-preview-button">{{form.ctaText}}</span></div><div class="mail-preview-footer">MiTiendaYa · Herramientas para hacer crecer tu tienda.</div></div></aside>
</div></div></template>

<style scoped>
.mail-admin-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(330px,.8fr);gap:24px;align-items:start}.mail-preview-wrap{position:sticky;top:103px}.mail-preview{background:#fffaf1;border:1px solid #e4dacb;border-radius:16px;overflow:hidden;box-shadow:0 12px 34px rgba(29,26,22,.08);color:#27231e}.mail-preview-brand{padding:20px 25px;background:#1d1a16;color:#fff8ec;font-size:20px;font-weight:800;letter-spacing:-.6px}.mail-preview-maintenance .mail-preview-brand{background:#51483c}.mail-preview-announcement .mail-preview-brand{background:#332e28}.mail-preview-body{padding:30px 28px}.mail-preview-eyebrow{display:block;font-size:9px;letter-spacing:1.6px;color:#8b7d6a;font-weight:800;margin-bottom:10px}.mail-preview-version{display:inline-block;background:#eee4d6;color:#574d41;padding:6px 9px;border-radius:999px;font-size:10px;font-weight:700;margin-bottom:16px}.mail-preview h2{font-size:25px;line-height:1.18;margin:0 0 16px;color:#27231e}.mail-preview p{white-space:pre-line;color:#51493f;line-height:1.65;font-size:13px}.mail-preview-changes{margin-top:20px;background:#f7f0e5;border:1px solid #eadfce;padding:18px;border-radius:12px}.mail-preview-changes strong{font-size:12px}.mail-preview-changes ul{padding-left:18px;margin:12px 0 0}.mail-preview-changes li{font-size:12px;line-height:1.55;margin-bottom:7px}.mail-preview-button{display:inline-block;margin-top:22px;background:#1d1a16;color:#fff8ec;padding:11px 16px;border-radius:9px;font-weight:700;font-size:12px}.mail-preview-footer{padding:17px 28px;border-top:1px solid #e9dfd1;color:#897d6d;font-size:10px}@media(max-width:1050px){.mail-admin-grid{grid-template-columns:1fr}.mail-preview-wrap{position:static}}[data-theme=dark] .mail-preview-wrap{filter:saturate(.82) brightness(.93)}
</style>

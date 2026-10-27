<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { date } from '../../services/panel.js';
import { confirmDialog, notify } from '../../services/notifications.js';
import Icon from '../../components/Icon.vue';

const route=useRoute(),router=useRouter();
const item=ref(null),loading=ref(true),error=ref(''),saving=ref(false),deleting=ref(false);
const form=reactive({status:'new',adminNote:''});
const statusLabel=value=>({new:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',closed:'Cerrado'}[value]||value);
const statusClass=value=>({new:'orange',reviewing:'blue',resolved:'green',closed:''}[value]||'');
const attachmentUrl=attachment=>`/api/admin/bug-reports/${route.params.id}/attachments/${attachment._id}`;
async function load(){loading.value=true;error.value='';try{item.value=await api.get(`/admin/bug-reports/${route.params.id}`);form.status=item.value.status;form.adminNote=item.value.adminNote||''}catch(e){error.value=e.message}finally{loading.value=false}}
async function save(){saving.value=true;try{item.value=await api.put(`/admin/bug-reports/${route.params.id}`,{status:form.status,adminNote:form.adminNote});form.status=item.value.status;form.adminNote=item.value.adminNote||'';notify.success('Reporte actualizado.')}catch(e){notify.error(e.message)}finally{saving.value=false}}
async function remove(){const confirmed=await confirmDialog({title:'Eliminar reporte',message:'Se eliminará el reporte y sus adjuntos privados. Esta acción no se puede deshacer.',confirmText:'Eliminar reporte',danger:true});if(!confirmed)return;deleting.value=true;try{await api.delete(`/admin/bug-reports/${route.params.id}`);notify.success('Reporte eliminado.');await router.push('/app/error-reports')}catch(e){notify.error(e.message)}finally{deleting.value=false}}
onMounted(load);
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">CALIDAD Y SOPORTE</p><h1>Detalle del reporte</h1><p>Analizá el problema, revisá los adjuntos y registrá el estado para futuras novedades de versión.</p></div><div class="p-page-header-actions"><RouterLink class="btn btn-secondary" to="/app/error-reports"><Icon name="back" :size="15"/>Volver</RouterLink><button v-if="item" type="button" class="btn btn-danger" :disabled="deleting||saving" @click="remove"><Icon name="trash" :size="15"/>{{deleting?'Eliminando…':'Eliminar'}}</button></div></header>
  <div v-if="error" class="p-error">{{error}} <button class="btn btn-text" type="button" @click="load">Reintentar</button></div>
  <div v-else-if="loading" class="p-loading-page"><span class="p-spinner"/>Cargando reporte...</div>
  <template v-else-if="item">
    <div class="report-detail-grid">
      <section class="p-section-card">
        <div class="p-section-title"><div><h2>Reporte del vendedor</h2><p>Recibido el {{date(item.createdAt)}}.</p></div><span class="p-badge" :class="statusClass(item.status)">{{statusLabel(item.status)}}</span></div>
        <dl class="report-facts"><div><dt>Vendedor</dt><dd>{{item.reporterId?.name||'Vendedor'}}<small>{{item.reporterId?.email||'Sin email'}}</small></dd></div><div><dt>Tienda</dt><dd>{{item.storeId?.name||'Sin tienda asociada'}}<small v-if="item.storeId?.slug">/{{item.storeId.slug}}</small></dd></div><div><dt>Adjuntos</dt><dd>{{item.attachments?.length||0}} archivo{{item.attachments?.length===1?'':'s'}}</dd></div></dl>
        <div class="report-message"><span>Comentario</span><p>{{item.comment}}</p></div>
        <div v-if="item.attachments?.length" class="report-gallery"><a v-for="attachment in item.attachments" :key="attachment._id" :href="attachmentUrl(attachment)" target="_blank" rel="noopener"><img :src="attachmentUrl(attachment)" :alt="attachment.name" loading="lazy"/><span><strong>{{attachment.name}}</strong><small>{{(attachment.size/1024/1024).toFixed(2)}} MB</small></span></a></div>
      </section>

      <section class="p-section-card report-management">
        <div class="p-section-title"><div><h2>Seguimiento</h2><p>Estado interno y nota visible para el vendedor.</p></div><Icon name="settings" :size="18"/></div>
        <form class="management-form" @submit.prevent="save"><div class="p-field"><label for="bug-status">Estado</label><select id="bug-status" v-model="form.status"><option value="new">Nuevo</option><option value="reviewing">En revisión</option><option value="resolved">Resuelto</option><option value="closed">Cerrado</option></select></div><div class="p-field"><label for="bug-note">Nota de administración</label><textarea id="bug-note" v-model="form.adminNote" maxlength="5000" rows="8" placeholder="Ej.: Corregido y previsto para la próxima versión."/><small>El vendedor verá esta nota en su historial de reportes.</small></div><button class="btn btn-primary" type="submit" :disabled="saving||deleting">{{saving?'Guardando…':'Guardar seguimiento'}}</button></form>
        <div v-if="item.reviewedBy" class="reviewed-by"><span>Última intervención</span><strong>{{item.reviewedBy.name||item.reviewedBy.username||'Administración'}}</strong><small>{{date(item.updatedAt)}}</small></div>
      </section>
    </div>
  </template>
</div>
</template>

<style scoped>
.report-detail-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.7fr);gap:22px;align-items:start}.report-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px}.report-facts>div{padding:14px;border:1px solid var(--line);border-radius:9px;background:var(--surface-alt)}.report-facts dt,.report-message>span,.reviewed-by>span{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}.report-facts dd{margin:5px 0 0;font-size:12px;font-weight:600;overflow-wrap:anywhere}.report-facts dd small{display:block;font-size:9px;color:var(--muted);font-weight:400;margin-top:2px}.report-message{padding:16px;border:1px solid var(--line);border-radius:10px}.report-message p{margin:7px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:12px}.report-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.report-gallery a{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface-alt);color:var(--text)}.report-gallery img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--surface)}.report-gallery span{display:block;padding:9px}.report-gallery strong,.report-gallery small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-gallery strong{font-size:10px}.report-gallery small{font-size:9px;color:var(--muted);margin-top:2px}.management-form{display:grid;gap:16px}.management-form .btn{width:100%}.reviewed-by{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.reviewed-by strong,.reviewed-by small{display:block}.reviewed-by strong{font-size:11px;margin-top:5px}.reviewed-by small{font-size:9px;color:var(--muted);margin-top:2px}@media(max-width:1000px){.report-detail-grid{grid-template-columns:1fr}}@media(max-width:700px){.report-facts,.report-gallery{grid-template-columns:1fr}}
</style>

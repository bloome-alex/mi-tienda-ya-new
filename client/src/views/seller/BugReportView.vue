<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../../services/api.js';
import { notify } from '../../services/notifications.js';
import { date } from '../../services/panel.js';
import { workspace } from '../../services/workspace.js';
import Icon from '../../components/Icon.vue';

const comment=ref('');
const files=ref([]);
const previews=ref([]);
const reports=ref([]);
const loading=ref(true),saving=ref(false),error=ref('');
const fileInput=ref(null);
const activeStore=computed(()=>workspace.stores.find(store=>store._id===workspace.activeStoreId));
const statusLabel=value=>({new:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',closed:'Cerrado'}[value]||value);
const statusClass=value=>({new:'orange',reviewing:'blue',resolved:'green',closed:''}[value]||'');
const attachmentUrl=(report,attachment)=>`/api/me/bug-reports/${report._id}/attachments/${attachment._id}`;

function clearPreviews(){for(const item of previews.value)URL.revokeObjectURL(item.url);previews.value=[];}
function chooseFiles(event){
  clearPreviews();
  const selected=[...(event.target.files||[])].slice(0,5);
  const invalid=selected.find(file=>!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024);
  if(invalid){files.value=[];event.target.value='';notify.error('Usá hasta 5 imágenes o GIFs JPG, PNG, WebP o GIF de hasta 8 MB cada uno.');return;}
  if(selected.reduce((sum,file)=>sum+file.size,0)>24*1024*1024){files.value=[];event.target.value='';notify.error('Los adjuntos pueden pesar hasta 24 MB en total.');return;}
  files.value=selected;
  previews.value=selected.map(file=>({name:file.name,url:URL.createObjectURL(file),type:file.type,size:file.size}));
}
function removeFile(index){
  URL.revokeObjectURL(previews.value[index]?.url);
  previews.value.splice(index,1);files.value.splice(index,1);
}
async function load(){loading.value=true;error.value='';try{reports.value=await api.get('/me/bug-reports?limit=20')}catch(e){error.value=e.message}finally{loading.value=false}}
async function submit(){
  if(comment.value.trim().length<10){notify.error('Contanos el error con al menos 10 caracteres.');return;}
  const form=new FormData();form.append('comment',comment.value.trim());if(workspace.activeStoreId)form.append('storeId',workspace.activeStoreId);for(const file of files.value)form.append('files',file);
  saving.value=true;
  try{
    const result=await api.upload('/me/bug-reports',form);
    notify.success(result.notification||'Gracias por reportar el error. Tendremos información en próximas novedades de versión.');
    comment.value='';files.value=[];clearPreviews();if(fileInput.value)fileInput.value.value='';await load();
  }catch(e){notify.error(e.message)}finally{saving.value=false}
}
onMounted(load);onBeforeUnmount(clearPreviews);
</script>

<template>
<div>
  <header class="p-page-header"><div><p class="p-eyebrow">AYUDANOS A MEJORAR</p><h1>Reportar un error</h1><p>Contanos qué ocurrió y, si podés, adjuntá imágenes o GIFs para que podamos reproducirlo y resolverlo en próximas versiones.</p></div></header>
  <div v-if="error" class="p-error">{{error}} <button type="button" class="btn btn-text" @click="load">Reintentar</button></div>
  <div class="report-layout">
    <section class="p-section-card">
      <div class="p-section-title"><div><h2>Nuevo reporte</h2><p><template v-if="activeStore">Se asociará a {{activeStore.name}}.</template><template v-else>El reporte se asociará a tu cuenta.</template></p></div><Icon name="bug" :size="20"/></div>
      <form class="report-form" @submit.prevent="submit">
        <div class="p-field"><label for="bug-comment">¿Qué pasó? *</label><textarea id="bug-comment" v-model="comment" maxlength="5000" rows="7" required placeholder="Describí qué estabas haciendo, qué esperabas que ocurriera y qué sucedió en su lugar."/><small>{{comment.trim().length}} / 5000 caracteres · mínimo 10.</small></div>
        <div class="p-field"><label>Imágenes o GIFs</label><label class="p-upload report-upload"><input ref="fileInput" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" @change="chooseFiles"/><Icon name="upload" :size="22"/><span><strong>Adjuntar capturas o GIFs</strong><small>Hasta 5 archivos, 8 MB cada uno y 24 MB en total.</small></span></label></div>
        <div v-if="previews.length" class="report-previews"><article v-for="(file,index) in previews" :key="file.url"><img :src="file.url" :alt="file.name"/><div><strong>{{file.name}}</strong><small>{{(file.size/1024/1024).toFixed(2)}} MB</small></div><button type="button" class="p-icon-btn danger" title="Quitar adjunto" @click="removeFile(index)"><Icon name="trash" :size="14"/></button></article></div>
        <div class="p-info report-note"><strong>Gracias por ayudarnos a mejorar MiTiendaYa.</strong><span>Al enviar el reporte vas a recibir una confirmación y podrás consultar su estado desde esta misma sección.</span></div>
        <div class="p-form-actions"><button class="btn btn-primary" type="submit" :disabled="saving||comment.trim().length<10">{{saving?'Enviando reporte…':'Enviar reporte'}}</button></div>
      </form>
    </section>

    <section class="p-section-card report-history">
      <div class="p-section-title"><div><h2>Mis reportes recientes</h2><p>Seguimiento de los últimos errores que enviaste.</p></div><button type="button" class="p-icon-btn" :disabled="loading" title="Actualizar" @click="load"><Icon name="refresh" :size="15"/></button></div>
      <div v-if="loading" class="p-loading-page compact"><span class="p-spinner"/>Cargando reportes...</div>
      <div v-else-if="!reports.length" class="report-empty"><Icon name="bug" :size="30"/><strong>Todavía no enviaste reportes.</strong><span>Cuando encuentres un problema, podés detallarlo desde el formulario.</span></div>
      <article v-for="report in reports" :key="report._id" class="report-history-item">
        <div class="report-history-head"><span class="p-badge" :class="statusClass(report.status)">{{statusLabel(report.status)}}</span><time>{{date(report.createdAt)}}</time></div>
        <p>{{report.comment}}</p>
        <small v-if="report.storeId?.name">Tienda: {{report.storeId.name}}</small>
        <div v-if="report.attachments?.length" class="report-history-files"><a v-for="attachment in report.attachments" :key="attachment._id" :href="attachmentUrl(report,attachment)" target="_blank" rel="noopener"><Icon name="image" :size="13"/>{{attachment.name}}</a></div>
        <div v-if="report.adminNote" class="report-admin-note"><strong>Respuesta de administración</strong><span>{{report.adminNote}}</span></div>
      </article>
    </section>
  </div>
</div>
</template>

<style scoped>
.report-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:22px;align-items:start}.report-form{display:grid;gap:18px}.report-upload{min-height:88px}.report-previews{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.report-previews article{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px;border:1px solid var(--line);border-radius:9px;background:var(--surface-alt)}.report-previews img{width:64px;height:52px;border-radius:7px;object-fit:cover;background:var(--surface)}.report-previews strong{display:block;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-previews small{font-size:9px;color:var(--muted)}.report-note{display:flex;flex-direction:column;gap:3px;margin:0}.report-history{max-height:760px;overflow:auto}.p-loading-page.compact{min-height:120px}.report-empty{text-align:center;padding:35px 16px;color:var(--muted)}.report-empty strong,.report-empty span{display:block}.report-empty strong{margin-top:10px;color:var(--text);font-size:12px}.report-empty span{font-size:10px;margin-top:4px}.report-history-item{padding:15px 0;border-bottom:1px solid var(--line)}.report-history-item:last-child{border-bottom:0}.report-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.report-history-head time{font-size:9px;color:var(--muted)}.report-history-item>p{font-size:11px;line-height:1.65;margin:10px 0 5px;white-space:pre-wrap;overflow-wrap:anywhere}.report-history-item>small{color:var(--muted);font-size:9px}.report-history-files{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.report-history-files a{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;color:var(--text-secondary);font-size:9px;background:var(--surface-alt);max-width:100%}.report-admin-note{margin-top:10px;padding:10px;border-radius:8px;background:var(--surface-alt);border:1px solid var(--line)}.report-admin-note strong,.report-admin-note span{display:block}.report-admin-note strong{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.report-admin-note span{margin-top:4px;font-size:10px;white-space:pre-wrap}.p-form-actions{display:flex;justify-content:flex-end}@media(max-width:1000px){.report-layout{grid-template-columns:1fr}.report-history{max-height:none}}@media(max-width:620px){.report-previews{grid-template-columns:1fr}}
</style>

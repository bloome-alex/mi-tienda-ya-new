<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { confirmation, resolveConfirmation, cancelConfirmation } from '../services/notifications.js';
import Icon from './Icon.vue';
const dialog=ref(null),cancel=ref(null);
let previousFocus;
watch([()=>confirmation.open,()=>confirmation.requestId],async ([open],[wasOpen])=>{
  if(open){
    if(!wasOpen)previousFocus=document.activeElement;
    await nextTick();
    if(!confirmation.open)return;
    cancel.value?.focus();
    document.addEventListener('keydown',keyboard);
  }else{
    document.removeEventListener('keydown',keyboard);
    await nextTick();
    if(previousFocus?.isConnected)previousFocus.focus?.();
  }
});
function keyboard(event){
  if(event.key==='Escape'){event.preventDefault();cancelConfirmation();return;}
  if(event.key!=='Tab')return;
  const focusable=dialog.value?.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if(!focusable?.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&(document.activeElement===first||!dialog.value.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!dialog.value.contains(document.activeElement))){event.preventDefault();first.focus();}
}
onBeforeUnmount(()=>document.removeEventListener('keydown',keyboard));
</script>
<template>
  <Teleport to="body">
    <div v-if="confirmation.open" class="p-modal-backdrop" @click.self="cancelConfirmation">
      <section ref="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" class="p-confirm" :class="{'p-confirm-choices':confirmation.mode==='choice'}">
        <div class="p-confirm-icon" :class="{'p-danger-icon':confirmation.danger,'p-choice-icon':confirmation.mode==='choice'}"><Icon :name="confirmation.icon||'warning'" :size="28"/></div>
        <h2 id="confirm-title">{{confirmation.title}}</h2><p id="confirm-message">{{confirmation.message}}</p>
        <div class="p-dialog-actions" :class="{'has-choices':confirmation.mode==='choice'}">
          <button ref="cancel" type="button" class="btn btn-secondary" @click="cancelConfirmation">{{confirmation.cancelText||'Volver'}}</button>
          <template v-if="confirmation.mode==='choice'"><button v-for="choice in confirmation.choices" :key="choice.value" type="button" class="btn" :class="'btn-'+choice.tone" @click="resolveConfirmation(choice.value)">{{choice.label}}</button></template>
          <button v-else type="button" class="btn" :class="confirmation.danger?'btn-danger':'btn-primary'" @click="resolveConfirmation(true)">{{confirmation.confirmText||'Confirmar'}}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.p-confirm.p-confirm-choices{max-width:570px}.p-confirm-icon.p-choice-icon:not(.p-danger-icon){background:var(--surface-alt,#f4f4f5);color:var(--text,#18181b)}.p-dialog-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:24px}.p-dialog-actions .btn{min-height:40px}.p-dialog-actions.has-choices>.btn:first-child{margin-right:auto}@media(max-width:540px){.p-dialog-actions.has-choices{display:grid;grid-template-columns:1fr;width:100%}.p-dialog-actions.has-choices>.btn{width:100%;margin:0}.p-dialog-actions.has-choices>.btn-primary{grid-row:1}.p-dialog-actions.has-choices>.btn:first-child{grid-row:3}}
</style>

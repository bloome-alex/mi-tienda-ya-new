<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Notifications from './components/Notifications.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
const online = ref(navigator.onLine);
const installEvent = ref(null);
const dismissed = ref(sessionStorage.getItem('mty-install-dismissed') === '1');
function connectionChanged() { online.value = navigator.onLine; }
function available(event) { event.preventDefault(); installEvent.value = event; }
async function install() { await installEvent.value?.prompt(); installEvent.value = null; }
function dismiss() { dismissed.value = true; sessionStorage.setItem('mty-install-dismissed', '1'); }
onMounted(() => { window.addEventListener('online', connectionChanged); window.addEventListener('offline', connectionChanged); window.addEventListener('beforeinstallprompt', available); });
onUnmounted(() => { window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); window.removeEventListener('beforeinstallprompt', available); });
</script>
<template>
  <RouterView />
  <Notifications />
  <ConfirmDialog />
  <div v-if="!online" role="status" class="offline-banner">Estás sin conexión. Reconectate para guardar cambios o realizar una compra.</div>
  <div v-if="installEvent && !dismissed" class="pwa-prompt"><div><strong>Tu tienda, siempre a mano</strong><span class="muted">Instalá la aplicación en tu dispositivo.</span></div><button class="btn btn-primary btn-sm" @click="install">Instalar</button><button class="icon-button" aria-label="Cerrar sugerencia" @click="dismiss">×</button></div>
</template>

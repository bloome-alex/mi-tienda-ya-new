<script setup>
import { notifications, dismissNotification } from '../services/notifications.js';
import Icon from './Icon.vue';
</script>
<template><Teleport to="body"><div class="p-notifications" aria-live="polite" aria-atomic="false"><TransitionGroup name="notification"><div v-for="item in notifications" :key="item.id" class="p-toast" :class="`p-toast-${item.type}`" :role="item.type==='error'?'alert':'status'"><span class="p-toast-icon"><Icon :name="item.type==='success'?'check':item.type==='error'?'warning':'info'"/></span><div><strong>{{item.type==='success'?'Listo':item.type==='error'?'No pudimos completar la acción':'Información'}}</strong><p>{{item.message}}</p></div><button @click="dismissNotification(item.id)" aria-label="Cerrar notificación"><Icon name="close" :size="16"/></button></div></TransitionGroup></div></Teleport></template>

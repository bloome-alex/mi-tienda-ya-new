<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthCard from '../../components/AuthCard.vue';
import { api } from '../../services/api.js';
import { setSession } from '../../services/auth.js';
import { notify } from '../../services/notifications.js';
const router=useRouter(),currentPassword=ref(''),newPassword=ref(''),repeated=ref(''),busy=ref(false),error=ref('');
async function submit(){error.value='';if(newPassword.value!==repeated.value){error.value='Las contraseñas nuevas no coinciden.';return;}if(busy.value)return;busy.value=true;try{setSession(await api.post('/auth/root/password',{currentPassword:currentPassword.value,newPassword:newPassword.value}));notify.success('La contraseña se actualizó. Ya podés administrar la plataforma.');await router.replace('/app/dashboard');}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><AuthCard title="Protegé tu acceso" subtitle="Elegí una nueva contraseña para continuar con la administración." eyebrow="PRIMER INGRESO"><form class="stack" @submit.prevent="submit"><div v-if="error" role="alert" class="notice error">{{error}}</div><div class="field"><label for="old-password">Contraseña actual</label><input id="old-password" v-model="currentPassword" type="password" required autocomplete="current-password" /></div><div class="field"><label for="new-password">Nueva contraseña</label><input id="new-password" v-model="newPassword" type="password" required minlength="12" autocomplete="new-password" /><small>Al menos 12 caracteres. Usá una frase larga y única.</small></div><div class="field"><label for="repeat-password">Repetir nueva contraseña</label><input id="repeat-password" v-model="repeated" type="password" required minlength="12" autocomplete="new-password" /></div><button class="btn btn-primary" :disabled="busy">{{busy?'Guardando…':'Guardar y continuar'}}</button></form></AuthCard></template>

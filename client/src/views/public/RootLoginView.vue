<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthCard from '../../components/AuthCard.vue';
import { api } from '../../services/api.js';
import { setSession } from '../../services/auth.js';
const router=useRouter(), username=ref(''), password=ref(''),busy=ref(false),error=ref('');
async function submit(){if(busy.value)return;busy.value=true;error.value='';try{const session=await api.post('/auth/root/login',{username:username.value,password:password.value});setSession(session);await router.replace(session.user.mustChangePassword?'/root/change-password':'/app/dashboard');}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><AuthCard title="Administración de la plataforma" subtitle="Ingresá con tu usuario administrador." eyebrow="ACCESO RESTRINGIDO"><form class="stack" @submit.prevent="submit"><div v-if="error" role="alert" class="notice error">{{error}}</div><div class="field"><label for="root-user">Usuario</label><input id="root-user" v-model="username" autocomplete="username" required maxlength="100" /></div><div class="field"><label for="root-pass">Contraseña</label><input id="root-pass" v-model="password" type="password" autocomplete="current-password" required /></div><button class="btn btn-primary btn-block" :disabled="busy">{{busy?'Ingresando…':'Ingresar'}}</button><p class="muted text-sm">El primer ingreso requiere cambiar la contraseña inicial.</p></form></AuthCard></template>

<script setup>
import { ref } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import AuthCard from '../../components/AuthCard.vue';
import { api } from '../../services/api.js';
import { setSession } from '../../services/auth.js';
const route=useRoute(),router=useRouter(),token=ref(typeof route.query.token==='string'?route.query.token:''),busy=ref(false),error=ref('');
// No consumir en GET: los escáneres de correo pueden visitar el enlace automáticamente.
async function confirm(){if(busy.value)return;busy.value=true;error.value='';try{setSession(await api.post('/auth/magic/consume',{token:token.value}));history.replaceState({},'',location.pathname);await router.replace('/app/dashboard');}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><AuthCard title="Tu tienda te espera." subtitle="Confirmá que querés ingresar para abrir tu espacio de trabajo." eyebrow="UN ACCESO SEGURO"><div class="stack"><div v-if="error" role="alert" class="notice error">{{error}}</div><button v-if="token" class="btn btn-primary btn-block" :disabled="busy" @click="confirm">{{busy?'Confirmando acceso…':'Confirmar y entrar'}}</button><div v-else class="notice warning">Este enlace está incompleto. Pedí uno nuevo con tu correo.</div><RouterLink to="/login" class="btn btn-secondary">Solicitar un nuevo enlace</RouterLink></div></AuthCard></template>

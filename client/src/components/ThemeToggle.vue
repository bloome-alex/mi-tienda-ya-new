<script setup>
import { theme, themeService } from '../services/theme.js';
import Icon from './Icon.vue';
defineProps({ compact: Boolean });
</script>
<template>
  <button type="button" class="theme-toggle" :class="{ compact }" :aria-label="`Cambiar a modo ${theme.resolved === 'dark' ? 'claro' : 'oscuro'}`" :title="`Cambiar a modo ${theme.resolved === 'dark' ? 'claro' : 'oscuro'}`" :aria-pressed="theme.resolved === 'dark'" @click="themeService.toggle()">
    <Icon :name="theme.resolved === 'dark' ? 'moon' : 'sun'" :size="18" />
    <span v-if="!compact">{{ theme.resolved === 'dark' ? 'Oscuro' : 'Claro' }}</span>
  </button>
</template>
<style scoped>
.theme-toggle{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;border:1px solid var(--line);border-radius:8px;padding:8px 11px;background:var(--surface);color:var(--text);font-size:12px;font-weight:600;white-space:nowrap}.theme-toggle:hover{background:var(--surface-alt)}.theme-toggle.compact{width:38px;padding:8px}@media(max-width:600px){.theme-toggle{width:36px;min-height:36px;padding:7px}.theme-toggle>span{display:none}}
</style>

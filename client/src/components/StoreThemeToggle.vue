<script setup>
import Icon from './Icon.vue';
defineProps({ mode: { type: String, default: 'light' } });
defineEmits(['toggle']);
</script>

<template>
  <button type="button" class="store-theme-toggle" :aria-label="`Ver la tienda en modo ${mode === 'dark' ? 'claro' : 'oscuro'}`" :title="`Cambiar a modo ${mode === 'dark' ? 'claro' : 'oscuro'}`" :aria-pressed="mode === 'dark'" @click="$emit('toggle')"><Icon :name="mode === 'dark' ? 'sun' : 'moon'" :size="18"/></button>
</template>

<style scoped>
.store-theme-toggle{appearance:none;display:flex;align-items:center;justify-content:center;align-self:center;flex:none;width:38px;height:38px;margin:0;padding:0;line-height:0;border:1px solid var(--store-line,var(--line));border-radius:50%;color:var(--store-text,var(--text));background:var(--store-surface,var(--surface));cursor:pointer;transition:background .18s,transform .18s}.store-theme-toggle :deep(svg){display:block;flex:none}.store-theme-toggle:hover{background:var(--store-surface-alt,var(--surface-alt));transform:translateY(-1px)}.store-theme-toggle:focus-visible{outline:2px solid var(--store-primary,var(--primary));outline-offset:3px}@media(max-width:500px){.store-theme-toggle{width:34px;height:34px}}@media(prefers-reduced-motion:reduce){.store-theme-toggle{transition:none;transform:none}}
</style>

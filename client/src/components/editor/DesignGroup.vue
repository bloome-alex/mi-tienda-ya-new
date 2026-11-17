<script setup>
import { nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
const props = defineProps({ title: String, description: String, modelValue: Boolean, badge: String });
const emit = defineEmits(['update:modelValue']);
const summary = ref(null);
// Al abrir una sección se cierra la anterior; si estaba arriba, el contenido sube. Se lleva el encabezado abierto a la vista.
async function toggle() {
  const opening = !props.modelValue;
  emit('update:modelValue', opening);
  if (!opening) return;
  await nextTick();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  summary.value?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
}
</script>
<template>
  <details class="ed-group" :open="modelValue">
    <summary ref="summary" @click.prevent="toggle"><span><strong>{{title}}</strong><small v-if="description">{{description}}</small></span><span class="ed-group-end"><em v-if="badge">{{badge}}</em><Icon name="chevron-down" :size="16"/></span></summary>
    <div class="ed-group-body"><slot/></div>
  </details>
</template>

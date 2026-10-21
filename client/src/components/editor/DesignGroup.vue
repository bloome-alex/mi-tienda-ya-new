<script setup>
import Icon from '../Icon.vue';
defineProps({ title: String, description: String, modelValue: Boolean, badge: String });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <details class="ed-group" :open="modelValue">
    <summary @click.prevent="emit('update:modelValue', !modelValue)"><span><strong>{{title}}</strong><small v-if="description">{{description}}</small></span><span class="ed-group-end"><em v-if="badge">{{badge}}</em><Icon name="chevron-down" :size="16"/></span></summary>
    <div class="ed-group-body"><slot/></div>
  </details>
</template>

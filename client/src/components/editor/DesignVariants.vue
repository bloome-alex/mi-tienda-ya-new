<script setup>
import Icon from '../Icon.vue';
defineProps({ modelValue: [String, Number], options: { type: Array, default: () => [] }, disabled: Boolean, label: String, kind: String });
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <div class="ed-variants" :class="{ 'ed-variants-many': options.length > 4 }" role="group" :aria-label="label">
    <button v-for="option in options" :key="option[0]" type="button" class="ed-variant" :class="{ selected: modelValue === option[0] }" :disabled="disabled" :aria-pressed="modelValue === option[0]" @click="emit('update:modelValue', option[0])">
      <span class="ed-variant-drawing" :class="['drawing-' + (kind || 'layout'), 'drawing-' + option[0]]" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="ed-variant-label">{{option[1]}}<Icon v-if="modelValue === option[0]" name="check" :size="13"/></span>
      <small v-if="option[2]">{{option[2]}}</small>
    </button>
  </div>
</template>

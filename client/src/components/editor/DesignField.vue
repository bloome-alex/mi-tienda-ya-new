<script setup>
import { computed } from 'vue';
import Icon from '../Icon.vue';
import DesignVariants from './DesignVariants.vue';
const props = defineProps({ field: { type: Object, required: true }, modelValue: [String, Number, Boolean], scope: { type: String, default: 'design' }, disabled: Boolean, reason: String, busy: Boolean });
const emit = defineEmits(['update:modelValue', 'upload']);
const id = computed(() => `ed-${props.scope}-${props.field.key}`.replace(/[^a-zA-Z0-9_-]/g, '-'));
const blocked = computed(() => props.disabled || !!props.reason || props.busy);
function update(event) { emit('update:modelValue', props.field.type === 'toggle' ? event.target.checked : ['range', 'number'].includes(props.field.type) ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value); }
function upload(event) { const file = event.target.files?.[0]; event.target.value = ''; if (file) emit('upload', file); }
</script>
<template>
  <div class="ed-field" :class="{ 'ed-field-disabled': blocked }" :data-design-field="scope + '.' + field.key">
    <label v-if="field.type === 'toggle'" class="ed-toggle" :for="id"><span>{{field.label}}</span><input :id="id" type="checkbox" :checked="modelValue" :disabled="blocked" :aria-describedby="field.help || reason ? id + '-help' : undefined" @change="update"/><i aria-hidden="true"></i></label>
    <template v-else>
      <label :for="field.type === 'variants' ? undefined : id">{{field.label}}<span v-if="field.optional" class="ed-optional">Opcional</span></label>
      <DesignVariants v-if="field.type === 'variants'" :model-value="modelValue" :options="field.options" :disabled="blocked" :label="field.label" :kind="field.kind || field.key" @update:model-value="emit('update:modelValue', $event)"/>
      <select v-else-if="field.type === 'select'" :id="id" :value="modelValue" :disabled="blocked" :aria-describedby="field.help || reason ? id + '-help' : undefined" @change="update"><option v-for="option in field.options" :key="option[0]" :value="option[0]">{{option[1]}}</option></select>
      <textarea v-else-if="field.type === 'textarea'" :id="id" :value="modelValue" :maxlength="field.max || 4000" :rows="field.rows || 3" :placeholder="field.placeholder || ''" dir="auto" :disabled="blocked" :aria-describedby="field.help || reason ? id + '-help' : undefined" @input="update"></textarea>
      <div v-else-if="field.type === 'range'" class="ed-range"><input :id="id" type="range" :value="modelValue" :min="field.min" :max="field.max" :step="field.step || 1" :disabled="blocked" @input="update"/><div><input :value="modelValue" type="number" :min="field.min" :max="field.max" :step="field.step || 1" :aria-label="field.label + ', valor exacto'" :disabled="blocked" @input="update"/><span v-if="field.unit">{{field.unit}}</span></div></div>
      <div v-else-if="field.type === 'color'" class="ed-color"><input :id="id" :value="/^#[a-f\d]{6}$/i.test(modelValue || '') ? modelValue : '#000000'" type="color" :disabled="blocked" @input="update"/><input :value="modelValue" type="text" maxlength="7" pattern="#[a-fA-F0-9]{6}" :aria-label="field.label + ' hexadecimal'" :disabled="blocked" @input="update"/></div>
      <div v-else-if="field.type === 'image'" class="ed-image-field">
        <div v-if="modelValue" class="ed-image-preview"><img :src="modelValue" :alt="field.label"/><button type="button" class="ed-icon-button" :aria-label="'Quitar ' + field.label" :disabled="blocked" @click="emit('update:modelValue', '')"><Icon name="trash" :size="15"/></button></div>
        <label class="ed-upload" :class="{ 'ed-upload-busy': busy }"><span v-if="busy" class="spinner"></span><Icon v-else name="upload" :size="16"/><span>{{busy ? 'Procesando imagen…' : modelValue ? 'Reemplazar imagen' : 'Subir imagen'}}</span><input :id="id" type="file" accept="image/jpeg,image/png,image/webp" :disabled="blocked" :aria-describedby="id + '-help'" @change="upload"/></label>
      </div>
      <input v-else :id="id" :value="modelValue" :type="['url','number','date'].includes(field.type) ? field.type : 'text'" :maxlength="field.max || 4000" :min="field.min" :max="field.type === 'number' ? field.max : undefined" :placeholder="field.placeholder || (field.type === 'url' ? 'https://…' : '')" :dir="field.type==='url'?'ltr':'auto'" :disabled="blocked" :aria-describedby="field.help || reason ? id + '-help' : undefined" @input="update"/>
      <small v-if="field.counter" class="ed-counter">{{String(modelValue || '').length.toLocaleString('es-AR')}} / {{field.max.toLocaleString('es-AR')}}</small>
    </template>
    <p v-if="reason || field.help" :id="id + '-help'" class="ed-help" :class="{ 'ed-dependency': reason }"><Icon v-if="reason" name="info" :size="12"/><span>{{reason || field.help}}</span></p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import DesignVariants from './DesignVariants.vue';
import { clampNumber, normalizeHexColor, isWebUrl } from './fieldValidation.js';
const props = defineProps({ field: { type: Object, required: true }, modelValue: [String, Number, Boolean], scope: { type: String, default: 'design' }, disabled: Boolean, reason: String, busy: Boolean });
const emit = defineEmits(['update:modelValue', 'upload']);
const id = computed(() => `ed-${props.scope}-${props.field.key}`.replace(/[^a-zA-Z0-9_-]/g, '-'));
const blocked = computed(() => props.disabled || !!props.reason || props.busy);
const draftError = ref('');
// Texto que se está escribiendo: evita que el campo vuelva al valor guardado mientras el valor todavía es inválido.
const draftText = ref(null);
const shown = computed(() => draftText.value ?? props.modelValue);
const urlError = computed(() => props.field.type === 'url' && props.modelValue && !isWebUrl(props.modelValue) ? 'Usá una dirección completa que empiece con https:// o http://.' : '');
const error = computed(() => draftError.value || urlError.value);
const rangeHint = computed(() => `Entre ${props.field.min} y ${props.field.max}${props.field.unit ? ' ' + props.field.unit : ''}.`);
function update(event) { emit('update:modelValue', props.field.type === 'toggle' ? event.target.checked : props.field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value); }
// Números: mientras se escribe sólo se aplica un valor dentro del rango; al salir del campo se ajusta al límite más cercano.
function typeNumber(event) {
  const raw = event.target.value; draftText.value = raw;
  if (raw === '' || Number.isNaN(Number(raw))) { draftError.value = rangeHint.value; return; }
  const value = Number(raw), clamped = clampNumber(value, props.field.min, props.field.max);
  draftError.value = clamped === value ? '' : `Ingresá un valor ${rangeHint.value.charAt(0).toLowerCase()}${rangeHint.value.slice(1)}`;
  if (clamped === value) emit('update:modelValue', value);
}
function commitNumber(event) {
  const raw = event.target.value;
  const value = raw === '' || Number.isNaN(Number(raw)) ? Number(props.modelValue) : Number(raw);
  const clamped = clampNumber(Number.isFinite(value) ? value : props.field.min, props.field.min, props.field.max);
  draftText.value = null; event.target.value = String(clamped); draftError.value = '';
  if (clamped !== props.modelValue) emit('update:modelValue', clamped);
}
function slideNumber(event) { draftError.value = ''; draftText.value = null; emit('update:modelValue', Number(event.target.value)); }
// Colores: se aplica sólo un hexadecimal válido; acepta #abc y valores sin numeral.
function typeColor(event) {
  draftText.value = event.target.value;
  const color = normalizeHexColor(event.target.value);
  draftError.value = color ? '' : 'Usá un color hexadecimal de 6 dígitos, por ejemplo #6b3e26.';
  if (color) emit('update:modelValue', color);
}
function commitColor(event) { const color = normalizeHexColor(event.target.value); draftText.value = null; event.target.value = color || props.modelValue || ''; draftError.value = ''; if (color && color !== props.modelValue) emit('update:modelValue', color); }
function pickColor(event) { draftError.value = ''; draftText.value = null; emit('update:modelValue', event.target.value); }
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
      <div v-else-if="field.type === 'range'" class="ed-range"><input :id="id" type="range" :value="modelValue" :min="field.min" :max="field.max" :step="field.step || 1" :disabled="blocked" @input="slideNumber"/><div><input :value="shown" type="number" :min="field.min" :max="field.max" :step="field.step || 1" :aria-label="field.label + ', valor exacto'" :aria-invalid="!!error" :disabled="blocked" @input="typeNumber" @change="commitNumber" @blur="commitNumber"/><span v-if="field.unit">{{field.unit}}</span></div></div>
      <div v-else-if="field.type === 'color'" class="ed-color"><input :id="id" :value="/^#[a-f\d]{6}$/i.test(modelValue || '') ? modelValue : '#000000'" type="color" :disabled="blocked" @input="pickColor"/><input :value="shown" type="text" maxlength="7" pattern="#[a-fA-F0-9]{6}" :aria-label="field.label + ' hexadecimal'" :aria-invalid="!!error" :disabled="blocked" @input="typeColor" @blur="commitColor"/></div>
      <div v-else-if="field.type === 'image'" class="ed-image-field">
        <div v-if="modelValue" class="ed-image-preview"><img :src="modelValue" :alt="field.label"/><button type="button" class="ed-icon-button" :aria-label="'Quitar ' + field.label" :disabled="blocked" @click="emit('update:modelValue', '')"><Icon name="trash" :size="15"/></button></div>
        <label class="ed-upload" :class="{ 'ed-upload-busy': busy }"><span v-if="busy" class="spinner"></span><Icon v-else name="upload" :size="16"/><span>{{busy ? 'Procesando imagen…' : modelValue ? 'Reemplazar imagen' : 'Subir imagen'}}</span><input :id="id" type="file" accept="image/jpeg,image/png,image/webp" :disabled="blocked" :aria-describedby="id + '-help'" @change="upload"/></label>
      </div>
      <input v-else :id="id" :value="modelValue" :type="['url','number','date'].includes(field.type) ? field.type : 'text'" :maxlength="field.max || 4000" :min="field.min" :max="field.type === 'number' ? field.max : undefined" :placeholder="field.placeholder || (field.type === 'url' ? 'https://…' : '')" :dir="field.type==='url'?'ltr':'auto'" :aria-invalid="!!error" :disabled="blocked" :aria-describedby="field.help || reason ? id + '-help' : undefined" @input="update"/>
      <small v-if="field.counter" class="ed-counter">{{String(modelValue || '').length.toLocaleString('es-AR')}} / {{field.max.toLocaleString('es-AR')}}</small>
    </template>
    <p v-if="error" class="ed-field-error" role="alert"><Icon name="warning" :size="12"/><span>{{error}}</span></p>
    <p v-if="reason || field.help" :id="id + '-help'" class="ed-help" :class="{ 'ed-dependency': reason }"><Icon v-if="reason" name="info" :size="12"/><span>{{reason || field.help}}</span></p>
  </div>
</template>

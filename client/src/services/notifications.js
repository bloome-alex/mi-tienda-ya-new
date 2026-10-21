import { reactive } from 'vue';
import { uniqueKey } from './ids.js';

export const notifications = reactive([]);
export function dismissNotification(id) { const i = notifications.findIndex(n => n.id === id); if (i >= 0) notifications.splice(i, 1); }
function push(type, message) { const id = uniqueKey(); notifications.push({ id, type, message }); setTimeout(() => dismissNotification(id), type === 'error' ? 9000 : 5500); return id; }
export const notify = { success: message => push('success', message), error: message => push('error', message), info: message => push('info', message) };

export const confirmation = reactive({
  open: false, requestId: 0, mode: 'confirm', title: '', message: '', icon: 'warning',
  confirmText: 'Confirmar', cancelText: 'Volver', danger: false, choices: [], cancelValue: false
});
let pending;
function openDialog(configuration, kind, cancelValue, values = []) {
  if (pending) { const previous = pending; pending = undefined; previous.resolve(previous.cancelValue); }
  Object.assign(confirmation, configuration, { open: true, requestId: confirmation.requestId + 1 });
  return new Promise(resolve => { pending = { resolve, kind, cancelValue, values: new Set(values) }; });
}

/** Existing callers continue to receive exactly true or false. */
export function confirmDialog(options = {}) {
  return openDialog({
    mode: 'confirm', title: options.title || 'Confirmar acción', message: options.message || '',
    confirmText: options.confirmText || 'Confirmar', cancelText: options.cancelText || 'Volver',
    danger: !!options.danger, icon: options.icon || 'warning', choices: [], cancelValue: false
  }, 'confirm', false);
}

/** A choice dialog returns one of its explicit values, or cancelValue on dismissal. */
export function choiceDialog(options = {}) {
  const cancelValue = options.cancelValue ?? 'cancel';
  const choices = (options.choices || []).map(choice => ({
    value: choice.value, label: String(choice.label || choice.value),
    tone: ['primary', 'secondary', 'danger'].includes(choice.tone) ? choice.tone : 'secondary'
  }));
  if (!choices.length || choices.some(choice => typeof choice.value !== 'string' || choice.value === cancelValue)
    || new Set(choices.map(choice => choice.value)).size !== choices.length) throw new TypeError('Las opciones del diálogo deben tener valores de texto distintos.');
  return openDialog({
    mode: 'choice', title: options.title || 'Elegí cómo continuar', message: options.message || '',
    confirmText: '', cancelText: options.cancelText || 'Volver', danger: !!options.danger,
    icon: options.icon || 'warning', choices, cancelValue
  }, 'choice', cancelValue, choices.map(choice => choice.value));
}

export function unsavedChangesDialog(options = {}) {
  return choiceDialog({
    title: 'Tenés cambios sin guardar',
    message: 'Guardá los cambios antes de salir, descartalos o seguí editando.',
    cancelText: 'Seguir editando', icon: 'edit', ...options,
    cancelValue: 'cancel', choices: [
      { value: 'discard', label: 'Descartar cambios', tone: 'secondary' },
      { value: 'save', label: options.saveText || 'Guardar cambios', tone: 'primary' }
    ]
  });
}

export function resolveConfirmation(value) {
  const current = pending;
  pending = undefined;
  confirmation.open = false;
  if (!current) return;
  const result = current.kind === 'confirm' ? value === true : current.values.has(value) ? value : current.cancelValue;
  current.resolve(result);
}
export function cancelConfirmation() { resolveConfirmation(confirmation.cancelValue); }

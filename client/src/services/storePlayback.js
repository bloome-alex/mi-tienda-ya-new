import { computed, onMounted, onUnmounted, ref, toValue, watch } from 'vue';

/** Shared pause rules for storefront carousels; no animation runs in a hidden tab. */
export function useStorePlayback({ enabled, interval, pauseOnHover = true, advance }) {
  const media = typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = ref(Boolean(media?.matches)), manuallyPaused = ref(false), hovered = ref(false), focused = ref(false);
  const hidden = ref(typeof document !== 'undefined' && document.hidden);
  const playing = computed(() => Boolean(toValue(enabled)) && !manuallyPaused.value && !focused.value && !hidden.value && !reducedMotion.value && !(toValue(pauseOnHover) && hovered.value));
  let timer;
  function schedule() {
    clearTimeout(timer);
    if (!playing.value) return;
    timer = setTimeout(() => { if (playing.value) advance(); schedule(); }, Math.max(2, Number(toValue(interval)) || 5) * 1000);
  }
  const onMotionChange = () => { reducedMotion.value = Boolean(media?.matches); };
  const onVisibilityChange = () => { hidden.value = document.hidden; };
  watch([playing, () => toValue(interval)], schedule, { immediate: true });
  onMounted(() => {
    media?.addEventListener?.('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });
  onUnmounted(() => {
    clearTimeout(timer);
    media?.removeEventListener?.('change', onMotionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
  return {
    playing, manuallyPaused, reducedMotion,
    pause: () => { manuallyPaused.value = true; },
    toggle: () => { manuallyPaused.value = !manuallyPaused.value; },
    pointerEnter: event => { if (event.pointerType !== 'touch') hovered.value = true; },
    pointerLeave: () => { hovered.value = false; },
    focusIn: () => { focused.value = true; },
    focusOut: event => { if (!event.currentTarget.contains(event.relatedTarget)) focused.value = false; }
  };
}

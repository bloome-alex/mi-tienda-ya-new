<script setup>
import { computed, onMounted, watch, ref } from 'vue';
import { api } from '../../services/api.js';
import PlatformLayout from '../../layouts/PlatformLayout.vue';
import Icon from '../../components/Icon.vue';

const props = defineProps({ kind: { type: String, required: true } });
const document = ref(null);
const loading = ref(true);
const error = ref('');

const kindLabel = computed(() => props.kind === 'privacy' ? 'PRIVACIDAD Y DATOS' : 'REGLAS DE USO');
const canonicalLabel = computed(() => props.kind === 'privacy' ? 'Política de privacidad' : 'Condiciones del servicio');
const formattedDate = computed(() => {
  const value = document.value?.updatedAt;
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
});

function anchorFor(index) { return `seccion-${index + 1}`; }

async function load() {
  loading.value = true;
  error.value = '';
  document.value = null;
  try { document.value = await api.get(`/public/legal/${props.kind}`); }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

onMounted(load);
watch(() => props.kind, load);
</script>

<template>
<PlatformLayout>
  <div class="legal-page">
    <div v-if="loading" class="legal-state"><span class="spinner"></span><p>Cargando documento…</p></div>
    <div v-else-if="error" class="legal-state legal-error"><Icon name="shield" :size="32"/><h1>No pudimos mostrar este documento</h1><p>{{error}}</p><button type="button" class="btn btn-primary" @click="load">Reintentar</button></div>
    <template v-else-if="document">
      <header class="legal-hero">
        <div class="legal-hero-copy">
          <span class="legal-eyebrow">{{kindLabel}}</span>
          <h1>{{document.title}}</h1>
          <p>{{document.intro}}</p>
          <div class="legal-meta">
            <span><Icon name="clock" :size="15"/>Última actualización: {{formattedDate || 'sin fecha publicada'}}</span>
            <span><Icon name="shield" :size="15"/>Documento oficial de MiTiendaYa</span>
          </div>
        </div>
        <aside class="legal-summary" aria-label="Resumen del documento">
          <span class="legal-summary-icon"><Icon name="shield" :size="28"/></span>
          <strong>Transparencia y seguridad</strong>
          <p>Este documento describe cómo funciona MiTiendaYa y las reglas que aplican a la plataforma y sus integraciones.</p>
          <RouterLink v-if="props.kind==='privacy'" to="/condiciones-del-servicio">Ver condiciones del servicio <Icon name="arrow-right" :size="14"/></RouterLink>
          <RouterLink v-else to="/politica-de-privacidad">Ver política de privacidad <Icon name="arrow-right" :size="14"/></RouterLink>
        </aside>
      </header>

      <div class="legal-layout">
        <aside class="legal-toc">
          <div class="legal-toc-card">
            <span>EN ESTA PÁGINA</span>
            <nav aria-label="Índice del documento">
              <a v-for="(section,index) in document.sections" :key="index" :href="`#${anchorFor(index)}`">{{section.title}}</a>
            </nav>
          </div>
        </aside>

        <article class="legal-content">
          <section v-for="(section,index) in document.sections" :id="anchorFor(index)" :key="index" class="legal-section">
            <h2>{{section.title}}</h2>
            <p>{{section.content}}</p>
          </section>

          <section class="legal-contact">
            <span class="legal-summary-icon"><Icon name="mail" :size="22"/></span>
            <div>
              <h2>¿Necesitás comunicarte con MiTiendaYa?</h2>
              <p>Para consultas sobre {{canonicalLabel.toLowerCase()}}, seguridad, privacidad o funcionamiento de la plataforma, utilizá nuestros canales oficiales.</p>
              <a v-if="document.contact?.email" :href="`mailto:${document.contact.email}`" class="btn btn-secondary">{{document.contact.email}}</a>
              <RouterLink v-else to="/#contacto" class="btn btn-secondary">Ir a contacto</RouterLink>
            </div>
          </section>
        </article>
      </div>

      <footer class="legal-footer">
        <strong>MiTiendaYa</strong>
        <nav aria-label="Documentos legales">
          <RouterLink to="/politica-de-privacidad">Política de privacidad</RouterLink>
          <RouterLink to="/condiciones-del-servicio">Condiciones del servicio</RouterLink>
        </nav>
      </footer>
    </template>
  </div>
</PlatformLayout>
</template>

<style scoped>
.legal-page{min-height:calc(100vh - 82px);background:var(--surface);color:var(--text)}
.legal-state{min-height:62vh;display:grid;place-items:center;align-content:center;gap:14px;text-align:center;padding:50px 24px;color:var(--muted)}
.legal-state h1{margin:0;color:var(--text)}.legal-state p{max-width:560px;margin:0 0 8px}.legal-error svg{color:var(--text)}
.legal-hero{max-width:1280px;margin:auto;padding:76px 56px 58px;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:70px;align-items:end;border-bottom:1px solid var(--line)}
.legal-eyebrow{display:inline-flex;align-items:center;font-size:.6rem;letter-spacing:.14em;font-weight:800;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:8px 10px}
.legal-hero h1{font-size:clamp(2.5rem,5vw,4.8rem);line-height:1.02;letter-spacing:-.065em;max-width:850px;margin:24px 0;color:var(--text)}
.legal-hero-copy>p{font-size:1rem;line-height:1.9;color:var(--muted);max-width:800px;margin:0}
.legal-meta{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:28px;color:var(--text-secondary);font-size:.75rem}.legal-meta span{display:flex;align-items:center;gap:7px}
.legal-summary{border:1px solid var(--line);border-radius:12px;padding:26px;background:var(--surface-alt)}.legal-summary-icon{width:46px;height:46px;border-radius:10px;display:grid;place-items:center;background:var(--primary);color:var(--on-primary);margin-bottom:22px}.legal-summary strong{display:block;font-size:1rem}.legal-summary p{font-size:.79rem;line-height:1.75;color:var(--muted);margin:10px 0 20px}.legal-summary a{display:flex;align-items:center;gap:7px;font-size:.74rem;font-weight:700;color:var(--text)}
.legal-layout{max-width:1280px;margin:auto;padding:58px 56px 90px;display:grid;grid-template-columns:270px minmax(0,1fr);gap:70px;align-items:start}.legal-toc{position:sticky;top:calc(var(--platform-header-height,82px) + 22px)}.legal-toc-card{border:1px solid var(--line);border-radius:10px;padding:21px;background:var(--surface-alt);max-height:calc(100vh - 145px);overflow:auto}.legal-toc-card>span{font-size:.55rem;letter-spacing:.12em;color:var(--muted);font-weight:800}.legal-toc nav{display:grid;gap:4px;margin-top:14px}.legal-toc a{font-size:.72rem;line-height:1.4;color:var(--text-secondary);padding:8px 7px;border-radius:5px}.legal-toc a:hover{background:var(--surface);color:var(--text)}
.legal-content{min-width:0}.legal-section{scroll-margin-top:145px;padding:0 0 42px;margin:0 0 42px;border-bottom:1px solid var(--line)}.legal-section h2{font-size:1.42rem;line-height:1.3;letter-spacing:-.025em;margin:0 0 18px;color:var(--text)}.legal-section p{white-space:pre-line;font-size:.91rem;line-height:1.95;color:var(--text-secondary);margin:0;max-width:850px}.legal-contact{display:flex;gap:22px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:28px;background:var(--surface-alt)}.legal-contact .legal-summary-icon{flex:0 0 auto;margin:0}.legal-contact h2{font-size:1.1rem;margin:2px 0 8px}.legal-contact p{font-size:.82rem;line-height:1.7;color:var(--muted);margin:0 0 18px}.legal-footer{border-top:1px solid var(--line);padding:28px 56px;display:flex;align-items:center;justify-content:space-between;gap:20px;color:var(--muted)}.legal-footer strong{color:var(--text)}.legal-footer nav{display:flex;gap:22px;font-size:.7rem}.legal-footer a:hover{text-decoration:underline}
@media(max-width:900px){.legal-hero{grid-template-columns:1fr;padding:55px 34px 45px;gap:34px}.legal-summary{max-width:560px}.legal-layout{grid-template-columns:1fr;padding:40px 34px 70px;gap:32px}.legal-toc{position:static}.legal-toc-card{max-height:none}.legal-toc nav{grid-template-columns:repeat(2,minmax(0,1fr))}.legal-footer{padding:25px 34px}}
@media(max-width:560px){.legal-hero{padding:40px 22px 36px}.legal-hero h1{font-size:2.55rem}.legal-hero-copy>p{font-size:.9rem}.legal-meta{display:grid}.legal-layout{padding:28px 22px 55px}.legal-toc nav{grid-template-columns:1fr}.legal-section{padding-bottom:30px;margin-bottom:30px}.legal-section h2{font-size:1.2rem}.legal-section p{font-size:.86rem;line-height:1.85}.legal-contact{padding:22px;display:block}.legal-contact .legal-summary-icon{margin-bottom:16px}.legal-footer{padding:24px 22px;align-items:flex-start;flex-direction:column}.legal-footer nav{display:grid;gap:10px}}
</style>

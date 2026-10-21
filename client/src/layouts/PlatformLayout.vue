<script setup>
import Icon from '../components/Icon.vue';
import ThemeToggle from '../components/ThemeToggle.vue';
</script>
<template>
  <div class="platform-layout">
    <header class="platform-nav">
      <RouterLink class="brand-mark" to="/" aria-label="Mi Tienda Ya, inicio"><span class="brand-symbol"><Icon name="store" :size="23" /></span><span>mi tienda<span class="brand-ya">ya.</span><small>TU NEGOCIO ONLINE</small></span></RouterLink>
      <nav class="platform-top-links" aria-label="Navegación principal">
        <RouterLink to="/#como-funciona">Cómo funciona</RouterLink>
        <RouterLink to="/#planes">Planes</RouterLink>
        <RouterLink to="/#preguntas">Preguntas frecuentes</RouterLink>
        <RouterLink to="/#contacto">Contacto</RouterLink>
      </nav>
      <div class="platform-nav-actions"><ThemeToggle/><RouterLink to="/login" class="btn btn-primary">Ingresar <Icon name="arrow-right" :size="16" /></RouterLink></div>
    </header>
    <main class="platform-main"><slot /></main>
  </div>
</template>
<style scoped>
.platform-layout{--platform-header-height:82px;min-height:100vh;background:var(--surface)}
.platform-nav{position:fixed;inset:0 0 auto;height:var(--platform-header-height);background:var(--surface);border-bottom:1px solid var(--line);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:0 clamp(20px,3vw,48px);z-index:40}
.brand-mark{display:flex;align-items:center;gap:11px;font-size:1.3rem;font-weight:800;letter-spacing:-.07em;line-height:1;white-space:nowrap}
.brand-mark small{font-size:.46rem;display:block;letter-spacing:.16em;margin-top:7px;color:var(--text-secondary);font-weight:650}
.brand-ya{color:var(--primary);margin-left:3px}
.brand-symbol{display:grid;place-items:center;border-radius:10px;background:var(--primary);color:var(--on-primary);width:42px;height:43px;flex-shrink:0}
.platform-top-links{display:flex;align-items:center;justify-content:center;gap:clamp(16px,2.4vw,34px);font-size:.81rem;color:var(--text-secondary);min-width:0}
.platform-top-links a{white-space:nowrap;padding:10px 0;transition:color .15s}
.platform-top-links a:hover{color:var(--primary)}
.platform-top-links a:focus-visible,.brand-mark:focus-visible{outline:2px solid var(--primary);outline-offset:5px;border-radius:4px}
.platform-nav-actions{display:flex;align-items:center;gap:10px}
.platform-main{padding-top:var(--platform-header-height);min-width:0}
@media(max-width:960px){
  .platform-layout{--platform-header-height:118px}
  .platform-nav{grid-template-columns:1fr auto;grid-template-rows:70px 47px;gap:0 16px;padding:0 20px}
  .platform-top-links{grid-column:1/-1;grid-row:2;justify-content:flex-start;gap:24px;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;border-top:1px solid var(--line);height:100%}
  .platform-top-links a{padding:10px 2px}
  .platform-nav-actions{grid-column:2;grid-row:1}
}
@media(max-width:480px){
  .platform-nav{padding-inline:14px;gap:0 10px}
  .brand-mark{font-size:1.06rem;gap:8px}
  .brand-mark small{font-size:.39rem}
  .brand-symbol{width:35px;height:36px}
  .platform-nav-actions{gap:6px}
  .platform-nav-actions>.btn{padding:10px 12px;font-size:.78rem}
  .platform-top-links{gap:12px;font-size:.75rem;justify-content:space-between}
}
</style>

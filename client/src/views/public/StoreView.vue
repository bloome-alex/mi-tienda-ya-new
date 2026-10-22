<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api.js';
import { useStorefront } from '../../services/storefront.js';
import { storefrontSlug } from '../../services/storeHost.js';
import { CategoryTree } from '../../services/categories.js';
import Icon from '../../components/Icon.vue';
import ProductCard from '../../components/ProductCard.vue';
import StoreHero from '../../components/StoreHero.vue';
import StoreFeatured from '../../components/StoreFeatured.vue';
import StoreSections from '../../components/StoreSections.vue';
import { sectionSpacing } from '../../services/design.js';
import { StoreCopy } from '../../services/storeCopy.js';
import { StoreTextLayout } from '../../services/storeNavigation.js';
import StoreCategoryNavigation from '../../components/StoreCategoryNavigation.vue';
const sf = useStorefront(), route = useRoute(), router = useRouter();
const currentSlug = computed(() => storefrontSlug(route));
const categoryFromRoute = () => typeof (route.query.categoryId ?? route.query.category) === 'string' ? (route.query.categoryId ?? route.query.category) : '';
const search = ref(''), category = ref(categoryFromRoute()), sort = ref('newest'), page = ref(1);
const products = ref(sf.products.value), featuredProducts = ref([]), meta = ref(sf.catalogMeta.value), loading = ref(false), error = ref('');
const limit = 12;
let timer, requestId = 0;
const design = computed(() => sf.design.value),copy=new StoreCopy(()=>sf.design.value);
const categoryLabels=computed(()=>({all:copy.text('allCategories'),title:copy.text('categoryLabel'),open:copy.text('categoryButton'),close:copy.text('categoryClose'),viewAll:copy.text('clearCategory')}));
const catalogSpacing = computed(() => sectionSpacing({paddingX:design.value.shop.catalogPaddingX,paddingY:design.value.shop.catalogPaddingY,fullWidth:design.value.shop.catalogFullWidth}));
const categoryTree = computed(() => new CategoryTree(sf.categories.value));
const allCategoryTree = computed(() => new CategoryTree(sf.allCategories?.value || sf.categories.value));
const rootCategories = computed(() => categoryTree.value.roots());
const selectedCategory = computed(() => categoryTree.value.get(category.value));
const selectedTrail=computed(()=>categoryTree.value.trail(category.value));
const categoryNavigationVisible=computed(()=>design.value.shop.showCategories&&rootCategories.value.length&&design.value.shop.categoryNavigation!=='navbar');
const pages = computed(() => Math.max(1, Math.ceil((meta.value.total || 0) / limit)));
const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b._id).localeCompare(String(a._id));

async function load() {
  const seq = ++requestId;
  loading.value = true; error.value = '';
  try {
    if (sf.isPreview.value) {
      const available = sf.products.value.filter(product => product.active && !product.archived);
      featuredProducts.value = available.filter(product => product.featured).sort(byNewest).slice(0, 12);
      const branch = new Set(allCategoryTree.value.branchIds(category.value));
      const term = search.value.trim().toLocaleLowerCase('es');
      let items = available.filter(product => (!term || product.name.toLocaleLowerCase('es').includes(term)) && (!category.value || branch.has(CategoryTree.id(product.categoryId))));
      if (sort.value === 'price_asc') items.sort((a, b) => a.price - b.price || String(a._id).localeCompare(String(b._id)));
      else if (sort.value === 'price_desc') items.sort((a, b) => b.price - a.price || String(a._id).localeCompare(String(b._id)));
      else if (sort.value === 'name') items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      else items.sort(byNewest);
      meta.value = {total:items.length, page:page.value, limit};
      products.value = items.slice((page.value - 1) * limit, page.value * limit);
    } else {
      const query = new URLSearchParams({search:search.value, sort:sort.value, page:String(page.value), limit:String(limit)});
      if (category.value) query.set('categoryId', category.value);
      const data = await api.get(`/public/stores/${currentSlug.value}?${query}`);
      if (seq !== requestId) return;
      products.value = data.products;
      featuredProducts.value = data.featuredProducts || [];
      meta.value = data.meta;
    }
  } catch (e) { if (seq === requestId) error.value = e.message; }
  finally { if (seq === requestId) loading.value = false; }
}
function selectCategory(value) {
  const next = CategoryTree.id(value);
  if (next === category.value) return;
  category.value = next;
  const query = {...route.query};
  delete query.category;
  if (next) query.categoryId = next;
  else delete query.categoryId;
  router.replace({path:route.path, query, hash:'#catalogo'});
}
function clearFilters() { search.value = ''; selectCategory(''); }
function changePage(value) {
  page.value = Math.min(pages.value, Math.max(1, value));
  load();
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  document.getElementById('catalogo')?.scrollIntoView({behavior, block:'start'});
}
watch(categoryFromRoute, value => { if (value !== category.value) category.value = value; });
watch([category, sort], () => { clearTimeout(timer); page.value = 1; load(); });
watch(search, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load(); }, 300); });
watch(() => sf.products.value, load, {immediate:true});
onUnmounted(() => { clearTimeout(timer); requestId++; });
</script>

<template>
  <div>
    <StoreHero/>
    <StoreFeatured :products="featuredProducts" @catalog="clearFilters"/>
    <StoreSections placement="beforeCatalog"/>
    <section v-if="design.shop.showCatalog" id="catalogo" class="store-catalog store-section" :class="['catalog-variant-'+design.shop.catalogVariant,'catalog-text-'+design.shop.catalogAlign]" :style="{...catalogSpacing,...StoreTextLayout.style(design.shop.catalogAlign),'--catalog-sidebar-cols':Math.min(design.shop.catalogColumns,3),'--catalog-sidebar-narrow-cols':Math.min(design.shop.catalogColumns,2)}" :dir="StoreTextLayout.direction(design.shop.catalogDirection)" aria-labelledby="catalog-heading">
      <div class="store-section-heading"><div><span v-if="copy.text('catalogEyebrow')" class="store-eyebrow">{{copy.text('catalogEyebrow')}}</span><h2 id="catalog-heading">{{selectedCategory?.name || design.shop.catalogTitle}}</h2><p v-if="copy.text('catalogDescription')" class="catalog-description">{{copy.text('catalogDescription')}}</p></div><p v-if="copy.text('catalogCount',{count:meta.total||0})" class="store-muted" aria-live="polite">{{copy.text('catalogCount',{count:meta.total||0})}}</p></div>
      <nav v-if="selectedTrail.length" class="catalog-breadcrumb" aria-label="Categoría seleccionada"><button type="button" @click="selectCategory('')">{{copy.text('allCategories')}}</button><template v-for="item in selectedTrail" :key="CategoryTree.id(item)"><span aria-hidden="true">/</span><button type="button" :aria-current="category===CategoryTree.id(item)?'page':undefined" @click="selectCategory(item)">{{item.name}}</button></template></nav>
      <div class="catalog-tools"><div v-if="design.shop.showSearch" class="store-search"><Icon name="search" :size="18"/><input v-model="search" :aria-label="copy.text('catalogSearch')||'Buscar productos'" :placeholder="copy.text('catalogSearch')" type="search"/></div><div class="store-sort"><label for="sort-products">{{copy.text('catalogSort')}}</label><select id="sort-products" v-model="sort" :aria-label="copy.text('catalogSort')||'Ordenar productos'"><option value="newest">{{copy.text('sortRecent')}}</option><option value="price_asc">{{copy.text('sortPriceAsc')}}</option><option value="price_desc">{{copy.text('sortPriceDesc')}}</option><option value="name">{{copy.text('sortName')}}</option></select></div></div>
      <div class="catalog-body" :class="{'with-sidebar':categoryNavigationVisible&&design.shop.categoryNavigation==='sidebar','with-overlay-panel':categoryNavigationVisible&&design.shop.categoryNavigation==='drawer'}">
       <StoreCategoryNavigation v-if="categoryNavigationVisible" :tree="categoryTree" :selected="category" :mode="design.shop.categoryNavigation" :labels="categoryLabels" :panel-animation="design.shop.categoryPanelAnimation" :panel-duration="design.shop.categoryPanelDuration" @select="selectCategory"/>
       <div class="catalog-results" :aria-busy="loading">
        <div v-if="error" class="notice error">{{error}} <button type="button" class="link" @click="load">Reintentar</button></div>
        <div v-else-if="loading" class="loading"><span class="spinner"></span>Buscando productos…</div>
        <div v-else-if="!products.length" class="store-empty"><Icon name="package" :size="42"/><h3>{{copy.text(search||category?'catalogNoResultsTitle':'catalogEmptyTitle')}}</h3><p>{{copy.text(search||category?'catalogNoResultsDescription':'catalogEmptyDescription')}}</p><button v-if="search || category" type="button" class="store-button secondary" @click="clearFilters">{{copy.text('catalogClearSearch')}}</button></div>
        <div v-else class="store-product-grid" :class="{'catalog-editorial-featured':design.shop.catalogVariant==='editorial'&&design.shop.catalogColumns>2}"><ProductCard v-for="product in products" :key="product._id" :product="product"/></div>
        <div v-if="pages>1" class="store-pagination"><button type="button" class="store-button secondary" :disabled="page===1||loading" :aria-label="copy.text('previous')||'Anterior'" @click="changePage(page-1)"><Icon name="arrow-left" :size="16"/>{{copy.text('previous')}}</button><span>{{copy.text('catalogPagination',{current:page,pages})}}</span><button type="button" class="store-button secondary" :disabled="page===pages||loading" :aria-label="copy.text('next')||'Siguiente'" @click="changePage(page+1)">{{copy.text('next')}}<Icon name="arrow-right" :size="16"/></button></div>
       </div>
      </div>
    </section>
    <StoreSections placement="afterCatalog"/>
  </div>
</template>
<style scoped>
.store-catalog{scroll-margin-top:calc(var(--store-header-offset,82px) + 20px)}.catalog-body,.catalog-results{min-width:0}.catalog-body.with-overlay-panel{display:grid;grid-template-columns:minmax(0,1fr);align-items:start}.with-overlay-panel>:deep(.store-category-picker),.with-overlay-panel>.catalog-results{grid-area:1/1}.with-overlay-panel>.catalog-results{padding-top:58px;z-index:1}.with-overlay-panel>:deep(.store-category-picker){z-index:4}.catalog-body.with-sidebar{display:grid;grid-template-columns:minmax(190px,240px) minmax(0,1fr);gap:30px;align-items:start}.with-sidebar .store-product-grid{grid-template-columns:repeat(var(--catalog-sidebar-cols,3),minmax(0,1fr))}.catalog-description{font-size:.87rem;color:var(--store-muted);line-height:1.7;max-width:760px;margin:13px 0 0;white-space:pre-line}.catalog-text-center .store-section-heading{flex-direction:column;align-items:center;gap:16px}.catalog-text-center .catalog-description{margin-inline:auto}.catalog-text-right .store-section-heading{flex-direction:row-reverse}.catalog-breadcrumb{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:0 0 20px;font-size:.7rem;color:var(--store-muted)}.catalog-breadcrumb button{border:0;background:transparent;color:inherit;padding:4px 0;font:inherit;overflow-wrap:anywhere}.catalog-breadcrumb button[aria-current]{font-weight:600;color:var(--store-text)}.catalog-breadcrumb button:focus-visible{outline:2px solid var(--store-primary);outline-offset:3px}.catalog-text-center .catalog-breadcrumb{justify-content:center}.catalog-text-right .catalog-breadcrumb{justify-content:flex-end}.store-catalog :is(h2,p){overflow-wrap:anywhere}@media(max-width:1050px){.with-sidebar .store-product-grid{grid-template-columns:repeat(var(--catalog-sidebar-narrow-cols,2),minmax(0,1fr))}.catalog-body.with-sidebar{grid-template-columns:210px minmax(0,1fr);gap:24px}}@media(max-width:850px){.catalog-body.with-sidebar{display:block}}@media(max-width:600px){.store-section-heading,.catalog-text-right .store-section-heading{flex-direction:column;align-items:stretch;gap:13px}.catalog-description{font-size:.79rem}.store-pagination{gap:10px;flex-wrap:wrap}.store-pagination>span{font-size:.68rem}}
</style>

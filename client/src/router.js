import { createRouter, createWebHistory } from 'vue-router';
import { nextTick } from 'vue';
import { auth, loadSession, canFeature } from './services/auth.js';
import { isHostedStorefront } from './services/storeHost.js';

const storeChildren=[
  {path:'',component:()=>import('./views/public/StoreView.vue')},
  {path:'producto/:id',component:()=>import('./views/public/ProductView.vue')},
  {path:'carrito',component:()=>import('./views/public/CartView.vue')},
  {path:'checkout',component:()=>import('./views/public/CheckoutView.vue')},
  {path:'terminos',component:()=>import('./views/public/TermsView.vue')}
];

const hostedRoutes=[
  {path:'/',component:()=>import('./layouts/StoreLayout.vue'),children:storeChildren},
  {path:'/pedido/:id',component:()=>import('./views/public/OrderTrackingView.vue'),meta:{title:'Tu pedido'}},
  {path:'/:pathMatch(.*)*',component:()=>import('./views/public/NotFoundView.vue'),meta:{title:'Página no encontrada'}}
];

const platformRoutes=[
  {path:'/',component:()=>import('./views/public/HomeView.vue'),meta:{title:'Tu emprendimiento, en su mejor versión'}},
  {path:'/planes',component:()=>import('./views/public/PlansView.vue'),meta:{title:'Planes'}},
  {path:'/login',component:()=>import('./views/public/LoginView.vue'),meta:{title:'Ingresar'}},
  {path:'/auth/verify',component:()=>import('./views/public/VerifyView.vue'),meta:{title:'Confirmar acceso'}},
  {path:'/root/login',component:()=>import('./views/public/RootLoginView.vue'),meta:{title:'Acceso administrador'}},
  {path:'/root/change-password',component:()=>import('./views/public/ChangePasswordView.vue'),meta:{requiresAuth:true,admin:true,allowPasswordChange:true,title:'Cambiar contraseña'}},
  {path:'/app',component:()=>import('./layouts/DashboardLayout.vue'),meta:{requiresAuth:true},children:[
    {path:'',redirect:'/app/dashboard'},
    {path:'dashboard',component:()=>import('./views/DashboardView.vue'),meta:{title:'Resumen',feature:'dashboard.statistics'}},
    {path:'users',component:()=>import('./views/admin/UsersView.vue'),meta:{admin:true,title:'Usuarios'}},
    {path:'users/new',component:()=>import('./views/admin/UserFormView.vue'),meta:{admin:true,title:'Nuevo vendedor'}},
    {path:'users/:id',component:()=>import('./views/admin/UserFormView.vue'),meta:{admin:true,title:'Editar vendedor'}},
    {path:'stores',component:()=>import('./views/admin/StoresView.vue'),meta:{feature:'management.stores',title:'Tiendas'}},
    {path:'stores/new',component:()=>import('./views/admin/StoreFormView.vue'),meta:{feature:'management.stores',title:'Nueva tienda'}},
    {path:'stores/:id',component:()=>import('./views/admin/StoreFormView.vue'),meta:{feature:'management.stores',title:'Editar tienda'}},
    {path:'settings',component:()=>import('./views/admin/SettingsView.vue'),meta:{admin:true,title:'Configuración'}},
    {path:'emails',component:()=>import('./views/admin/EmailsView.vue'),meta:{admin:true,title:'Emails'}},
    {path:'custom-plan-requests',component:()=>import('./views/admin/CustomPlanRequestsView.vue'),meta:{admin:true,title:'Solicitudes de planes'}},
    {path:'custom-plan-requests/:id',component:()=>import('./views/admin/CustomPlanRequestDetailView.vue'),meta:{admin:true,title:'Detalle de solicitud'}},
    {path:'settings/plans/new',component:()=>import('./views/admin/PlanFormView.vue'),meta:{admin:true,title:'Nuevo plan'}},
    {path:'settings/plans/:id',component:()=>import('./views/admin/PlanFormView.vue'),meta:{admin:true,title:'Editar plan'}},
    {path:'audit',component:()=>import('./views/admin/AuditView.vue'),meta:{admin:true,title:'Auditoría'}},
    {path:'audit/:id',component:()=>import('./views/admin/AuditDetailView.vue'),meta:{admin:true,title:'Detalle de auditoría'}},
    {path:'products',component:()=>import('./views/seller/ProductsView.vue'),meta:{title:'Productos',feature:'management.products'}},
    {path:'products/new',component:()=>import('./views/seller/ProductFormView.vue'),meta:{title:'Nuevo producto',feature:'management.products'}},
    {path:'products/:id',component:()=>import('./views/seller/ProductFormView.vue'),meta:{title:'Editar producto',feature:'management.products'}},
    {path:'categories',component:()=>import('./views/seller/CategoriesView.vue'),meta:{title:'Categorías',feature:'management.categories'}},
    {path:'categories/new',component:()=>import('./views/seller/CategoryFormView.vue'),meta:{title:'Nueva categoría',feature:'management.categories'}},
    {path:'categories/:id',component:()=>import('./views/seller/CategoryFormView.vue'),meta:{title:'Editar categoría',feature:'management.categories'}},
    {path:'stock',component:()=>import('./views/seller/StockView.vue'),meta:{title:'Stock',feature:'management.stock'}},
    {path:'orders',component:()=>import('./views/seller/OrdersView.vue'),meta:{title:'Pedidos',feature:'management.orders'}},
    {path:'orders/new',component:()=>import('./views/seller/OrderFormView.vue'),meta:{title:'Nuevo pedido',feature:'management.orders'}},
    {path:'orders/:id',component:()=>import('./views/seller/OrderDetailView.vue'),meta:{title:'Detalle del pedido',feature:'management.orders'}},
    {path:'payments',component:()=>import('./views/seller/PaymentsView.vue'),meta:{title:'Cobros y entrega'}},
    {path:'payments/methods/new',component:()=>import('./views/seller/PaymentMethodFormView.vue'),meta:{title:'Nuevo medio de pago'}},
    {path:'payments/methods/:id',component:()=>import('./views/seller/PaymentMethodFormView.vue'),meta:{title:'Editar medio de pago'}},
    {path:'payments/deliveries/new',component:()=>import('./views/seller/DeliveryFormView.vue'),meta:{title:'Nueva forma de entrega'}},
    {path:'payments/deliveries/:id',component:()=>import('./views/seller/DeliveryFormView.vue'),meta:{title:'Editar forma de entrega'}},
    {path:'contact',component:()=>import('./views/seller/ContactView.vue'),meta:{title:'Contacto'}},
    {path:'social',component:()=>import('./views/seller/SocialAdsView.vue'),meta:{title:'Redes y anuncios',feature:'ads.limited'}},
    {path:'domain',component:()=>import('./views/seller/DomainView.vue'),meta:{title:'Dominio'}},
    {path:'pwa',component:()=>import('./views/seller/StorePwaView.vue'),meta:{title:'Aplicación PWA',feature:'store.pwa'}},
    {path:'plan',redirect:'/app/subscription'},
    {path:'subscription',component:()=>import('./views/seller/SubscriptionView.vue'),meta:{title:'Mi suscripción'}},
    {path:'transfers',component:()=>import('./views/seller/TransfersView.vue'),meta:{title:'Transferencias de tiendas'}},
    {path:'transfer-history',component:()=>import('./views/seller/TransferHistoryView.vue'),meta:{title:'Historial de Transferencias',feature:'stores.transfer'}},
    {path:'design',component:()=>import('./views/seller/DesignView.vue'),meta:{title:'Diseño de tu tienda',feature:'design.limited'}}
  ]},
  {path:'/t/:slug',component:()=>import('./layouts/StoreLayout.vue'),children:storeChildren},
  {path:'/pedido/:id',component:()=>import('./views/public/OrderTrackingView.vue'),meta:{title:'Tu pedido'}},
  {path:'/:pathMatch(.*)*',component:()=>import('./views/public/NotFoundView.vue'),meta:{title:'Página no encontrada'}}
];

const router = createRouter({
  history: createWebHistory(),
  async scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) {
      await nextTick();
      const header=document.querySelector('.store-navbar') || document.querySelector('.platform-nav');
      const fixed=header && ['fixed','sticky'].includes(getComputedStyle(header).position);
      const offset=fixed ? header.getBoundingClientRect().height+16 : 16;
      return {el:to.hash,top:offset,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'};
    }
    return {top:0};
  },
  routes:isHostedStorefront()?hostedRoutes:platformRoutes
});
router.beforeEach(async to=>{
  if(to.meta.requiresAuth){
    try { await loadSession(); } catch { return {path:'/login',query:{error:'connection'}}; }
    if(!auth.user) return {path:'/login',query:{next:to.fullPath}};
    if(to.meta.admin && auth.user.role!=='admin') return '/app/dashboard';
    if(auth.user.role==='vendedor'){
      const required = to.meta.features || (to.meta.feature ? [to.meta.feature] : []);
      if(required.length && !required.every(canFeature)) return {path:'/app/subscription',query:{featureDenied:required[0]}};
    }
    if(auth.user.mustChangePassword && !to.meta.allowPasswordChange) return '/root/change-password';
  }
});
router.afterEach(to=>{document.title=(to.meta.title ? `${to.meta.title} · `:'')+'MiTiendaYa';});
export default router;

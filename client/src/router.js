import { createRouter, createWebHistory } from 'vue-router';
import { nextTick } from 'vue';
import { auth, loadSession } from './services/auth.js';
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
  routes: [
    {path:'/',component:()=>import('./views/public/HomeView.vue'),meta:{title:'Tu emprendimiento, en su mejor versión'}},
    {path:'/login',component:()=>import('./views/public/LoginView.vue'),meta:{title:'Ingresar'}},
    {path:'/auth/verify',component:()=>import('./views/public/VerifyView.vue'),meta:{title:'Confirmar acceso'}},
    {path:'/root/login',component:()=>import('./views/public/RootLoginView.vue'),meta:{title:'Acceso administrador'}},
    {path:'/root/change-password',component:()=>import('./views/public/ChangePasswordView.vue'),meta:{requiresAuth:true,admin:true,allowPasswordChange:true,title:'Cambiar contraseña'}},
    {path:'/app',component:()=>import('./layouts/DashboardLayout.vue'),meta:{requiresAuth:true},children:[
      {path:'',redirect:'/app/dashboard'},
      {path:'dashboard',component:()=>import('./views/DashboardView.vue'),meta:{title:'Resumen'}},
      {path:'users',component:()=>import('./views/admin/UsersView.vue'),meta:{admin:true,title:'Usuarios'}},
      {path:'users/new',component:()=>import('./views/admin/UserFormView.vue'),meta:{admin:true,title:'Nuevo vendedor'}},
      {path:'users/:id',component:()=>import('./views/admin/UserFormView.vue'),meta:{admin:true,title:'Editar vendedor'}},
      {path:'stores',component:()=>import('./views/admin/StoresView.vue'),meta:{admin:true,title:'Tiendas'}},
      {path:'stores/new',component:()=>import('./views/admin/StoreFormView.vue'),meta:{admin:true,title:'Nueva tienda'}},
      {path:'stores/:id',component:()=>import('./views/admin/StoreFormView.vue'),meta:{admin:true,title:'Editar tienda'}},
      {path:'settings',component:()=>import('./views/admin/SettingsView.vue'),meta:{admin:true,title:'Configuración'}},
      {path:'settings/plans/new',component:()=>import('./views/admin/PlanFormView.vue'),meta:{admin:true,title:'Nuevo plan'}},
      {path:'settings/plans/:id',component:()=>import('./views/admin/PlanFormView.vue'),meta:{admin:true,title:'Editar plan'}},
      {path:'audit',component:()=>import('./views/admin/AuditView.vue'),meta:{admin:true,title:'Auditoría'}},
      {path:'audit/:id',component:()=>import('./views/admin/AuditDetailView.vue'),meta:{admin:true,title:'Detalle de auditoría'}},
      {path:'products',component:()=>import('./views/seller/ProductsView.vue'),meta:{title:'Productos'}},
      {path:'products/new',component:()=>import('./views/seller/ProductFormView.vue'),meta:{title:'Nuevo producto'}},
      {path:'products/:id',component:()=>import('./views/seller/ProductFormView.vue'),meta:{title:'Editar producto'}},
      {path:'categories',component:()=>import('./views/seller/CategoriesView.vue'),meta:{title:'Categorías'}},
      {path:'categories/new',component:()=>import('./views/seller/CategoryFormView.vue'),meta:{title:'Nueva categoría'}},
      {path:'categories/:id',component:()=>import('./views/seller/CategoryFormView.vue'),meta:{title:'Editar categoría'}},
      {path:'stock',component:()=>import('./views/seller/StockView.vue'),meta:{title:'Stock'}},
      {path:'orders',component:()=>import('./views/seller/OrdersView.vue'),meta:{title:'Pedidos'}},
      {path:'orders/new',component:()=>import('./views/seller/OrderFormView.vue'),meta:{title:'Nuevo pedido'}},
      {path:'orders/:id',component:()=>import('./views/seller/OrderDetailView.vue'),meta:{title:'Detalle del pedido'}},
      {path:'payments',component:()=>import('./views/seller/PaymentsView.vue'),meta:{title:'Cobros y entrega'}},
      {path:'payments/methods/new',component:()=>import('./views/seller/PaymentMethodFormView.vue'),meta:{title:'Nuevo medio de pago'}},
      {path:'payments/methods/:id',component:()=>import('./views/seller/PaymentMethodFormView.vue'),meta:{title:'Editar medio de pago'}},
      {path:'payments/deliveries/new',component:()=>import('./views/seller/DeliveryFormView.vue'),meta:{title:'Nueva forma de entrega'}},
      {path:'payments/deliveries/:id',component:()=>import('./views/seller/DeliveryFormView.vue'),meta:{title:'Editar forma de entrega'}},
      {path:'contact',component:()=>import('./views/seller/ContactView.vue'),meta:{title:'Contacto'}},
      {path:'plan',component:()=>import('./views/seller/PlanView.vue'),meta:{title:'Tu plan'}},
      {path:'design',component:()=>import('./views/seller/DesignView.vue'),meta:{title:'Diseño de tu tienda'}}
    ]},
    {path:'/t/:slug',component:()=>import('./layouts/StoreLayout.vue'),children:[
      {path:'',component:()=>import('./views/public/StoreView.vue')},
      {path:'producto/:id',component:()=>import('./views/public/ProductView.vue')},
      {path:'carrito',component:()=>import('./views/public/CartView.vue')},
      {path:'checkout',component:()=>import('./views/public/CheckoutView.vue')},
      {path:'terminos',component:()=>import('./views/public/TermsView.vue')}
    ]},
    {path:'/pedido/:id',component:()=>import('./views/public/OrderTrackingView.vue'),meta:{title:'Tu pedido'}},
    {path:'/:pathMatch(.*)*',component:()=>import('./views/public/NotFoundView.vue'),meta:{title:'Página no encontrada'}}
  ]
});
router.beforeEach(async to=>{
  if(to.meta.requiresAuth){
    try { await loadSession(); } catch { return {path:'/login',query:{error:'connection'}}; }
    if(!auth.user) return {path:'/login',query:{next:to.fullPath}};
    if(to.meta.admin && auth.user.role!=='admin') return '/app/dashboard';
    if(auth.user.mustChangePassword && !to.meta.allowPasswordChange) return '/root/change-password';
  }
});
router.afterEach(to=>{document.title=(to.meta.title ? `${to.meta.title} · `:'')+'Mi Tienda Ya';});
export default router;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appRoot=path.resolve(root,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const readApp=relative=>fs.readFileSync(path.join(appRoot,relative),'utf8');

test('formas de pago y entrega no tienen tope técnico y 0 continúa siendo ilimitado',()=>{
  const model=read('src/models/index.js');
  const routes=read('src/routes/core.js');
  const limits=read('src/services/CommercePlanLimitService.js');
  const form=readApp('client/src/views/admin/PlanFormView.vue');
  assert.match(model,/maxPaymentMethods: \{ type: Number, min: 0, default: 3 \}/);
  assert.match(model,/maxDeliveryMethods: \{ type: Number, min: 0, default: 3 \}/);
  assert.doesNotMatch(model,/maxPaymentMethods:[^\n]+max: 20/);
  assert.doesNotMatch(model,/maxDeliveryMethods:[^\n]+max: 20/);
  assert.match(routes,/maxPaymentMethods: nonnegativeInteger\.default\(3\)/);
  assert.match(routes,/maxDeliveryMethods: nonnegativeInteger\.default\(3\)/);
  assert.doesNotMatch(limits,/Math\.min\(20/);
  assert.match(limits,/if \(limit === 0 \|\| next <= limit \|\| next <= current\) return/);
  assert.doesNotMatch(form,/max="20"/);
  assert.match(form,/0 significa sin límite\. No existe un máximo técnico artificial/);
});

test('dashboard administrativo desglosa usuarios y estimado mensual por plan sin comisiones',()=>{
  const service=read('src/services/AdminDashboardService.js');
  const routes=read('src/routes/core.js');
  const view=readApp('client/src/views/admin/DashboardView.vue');
  assert.match(service,/class AdminDashboardService/);
  assert.match(service,/role: 'vendedor', active: true/);
  assert.match(service,/estimatedMonthlyRevenue/);
  assert.match(service,/price \* 30 \/ durationDays/);
  assert.match(routes,/adminDashboardService\.subscriptionSummary\(\)/);
  assert.match(view,/Suscripciones por plan/);
  assert.match(view,/No descuenta comisiones de Mercado Pago/);
  assert.match(view,/plan\.users/);
  assert.match(view,/plan\.estimatedMonthly/);
});

test('actividad reciente separa actor y fecha en elementos independientes',()=>{
  const view=readApp('client/src/views/admin/DashboardView.vue');
  assert.match(view,/class="activity-meta"/);
  assert.match(view,/<small>\{\{auditActor\(item\)\}\}/);
  assert.match(view,/<time :datetime="item\.createdAt">\{\{date\(item\.createdAt\)\}\}<\/time>/);
});

test('reportes de errores soportan comentarios, imágenes, GIF y seguimiento administrativo',()=>{
  const model=read('src/models/index.js');
  const service=read('src/services/BugReportService.js');
  const routes=read('src/routes/core.js');
  const router=readApp('client/src/router.js');
  const seller=readApp('client/src/views/seller/BugReportView.vue');
  const admin=readApp('client/src/views/admin/BugReportsView.vue');
  const detail=readApp('client/src/views/admin/BugReportDetailView.vue');
  assert.match(model,/bugReportSchema/);
  assert.match(model,/\['new', 'reviewing', 'resolved', 'closed'\]/);
  assert.match(service,/class BugReportService/);
  assert.match(service,/image\/gif/);
  assert.match(service,/R2_RECEIPTS_BUCKET_NAME/);
  assert.match(routes,/router\.post\('\/me\/bug-reports'/);
  assert.match(routes,/router\.get\('\/admin\/bug-reports'/);
  assert.match(routes,/router\.put\('\/admin\/bug-reports\/:id'/);
  assert.match(routes,/router\.delete\('\/admin\/bug-reports\/:id'/);
  assert.match(router,/report-error/);
  assert.match(router,/error-reports/);
  assert.match(seller,/Gracias por reportar el error/);
  assert.match(seller,/image\/gif/);
  assert.match(admin,/Reportes de errores/);
  assert.match(detail,/Guardar seguimiento/);
});

test('la limpieza de R2 conserva adjuntos mientras el reporte exista',()=>{
  const cleanup=read('src/services/StorageCleanupService.js');
  assert.match(cleanup,/BugReport/);
  assert.match(cleanup,/attachments\.objectKey/);
});

test('la versión distribuida es 1.24.0',()=>{
  const rootPackage=JSON.parse(readApp('package.json'));
  const apiPackage=JSON.parse(read('package.json'));
  const clientPackage=JSON.parse(readApp('client/package.json'));
  assert.equal(rootPackage.version,'1.24.0');
  assert.equal(apiPackage.version,'1.24.0');
  assert.equal(clientPackage.version,'1.24.0');
});

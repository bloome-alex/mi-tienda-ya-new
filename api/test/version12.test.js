import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { User, Store, Plan, Product, Category, Session, Settings, AuditLog, UploadedImage } from '../src/models/index.js';
import { Order, StockMovement, MailJob } from '../src/models/commerce.js';
import { AuditService, redactAudit, auditChanges } from '../src/services/AuditService.js';
import { CommerceService, InventoryService, safePublicStore } from '../src/services/commerce.js';
import { validateDesign } from '../src/utils/design.js';
import { hashToken } from '../src/utils/crypto.js';
import { auditValue, auditLabels } from '../../client/src/services/audit.js';
import { defaultDesign, sectionTemplate, blockTemplate, slideTemplate, designEnums, designNumberRanges } from '../../client/src/services/design.js';

const models = [User, Store, Plan, Product, Category, Session, Settings, AuditLog, UploadedImage, Order, StockMovement, MailJob];
let mongo, app, directory;
before(async () => {
  config.encryptionKey = 'ed'.repeat(32); config.sessionSecret = 'version12-test-private-secret'; config.isProduction = false; config.appUrl = 'http://localhost:5000'; config.trustProxy = 0;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mi-tienda-v12-')); config.uploadDir = directory;
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all(models.map(model => model.init())); app = createApp();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); await fs.rm(directory, { recursive:true, force:true }); });
beforeEach(async () => { await Promise.all(models.map(model => model.deleteMany({}))); });

async function session(user) {
  const token = crypto.randomBytes(32).toString('hex'), csrfToken = crypto.randomUUID();
  await Session.create({ userId:user._id, tokenHash:hashToken(token), csrfToken, expiresAt:new Date(Date.now()+86400000) });
  return { user, token, csrfToken };
}
async function fixture(design = {}) {
  const user = await User.create({ role:'vendedor', name:'Vendedora de prueba', email:crypto.randomUUID()+'@example.test', active:true, trialEndsAt:new Date(Date.now()+86400000) });
  const store = await Store.create({ ownerId:user._id, name:'Tienda del diseño', slug:'prueba-'+crypto.randomUUID().slice(0,8), active:true, design,
    payments:[{id:'cash',type:'cash',name:'Efectivo',active:true,deliveryIds:[]},{id:'transfer',type:'transfer',name:'Transferencia',active:true,deliveryIds:[]}],
    deliveries:[{id:'pickup',type:'pickup',name:'Retiro',active:true,price:0},{id:'shipping',type:'shipping',name:'Envío',active:true,price:100},{id:'digital',type:'digital',name:'Correo',active:true,price:0}],
  });
  return { ...await session(user), store };
}
async function admin() { return session(await User.create({role:'admin',username:'root',name:'Administración de prueba',active:true,mustChangePassword:false})); }
function api(who, method, endpoint, body) {
  const call = request(app)[method]('/api'+endpoint).set('Cookie','mt_session='+who.token);
  return ['get','head'].includes(method) ? call : call.set('X-CSRF-Token',who.csrfToken).send(body||{});
}
function upload(who, buffer, purpose, extra = {}) {
  let call = request(app).post('/api/stores/'+(extra.storeId||who.store._id)+'/uploads').set('Cookie','mt_session='+who.token).set('X-CSRF-Token',who.csrfToken);
  if (purpose !== undefined) call = call.field('purpose',purpose);
  return call.attach('files',buffer,{filename:extra.name||'imagen.png',contentType:extra.mime||'image/png'});
}
const picture = (width,height) => sharp({create:{width,height,channels:3,background:'#7a987c'}}).png().toBuffer();
const saveDesign = (who,design) => api(who,'put','/stores/'+who.store._id+'/design',{design});
const internalTerms = { enabled:true,title:'Condiciones vigentes',intro:'Leé estas condiciones.',content:'Versión inicial de las condiciones.',updatedAt:'2026-10-20' };
async function sellable(who, type='physical') {
  return Product.create({storeId:who.store._id,name:'Producto de prueba',price:1200,stock:20,active:true,type,...(type==='digital'?{digitalUrl:'https://example.test/recurso-privado?token=private-download'}:{})});
}
function orderInput(product, extra={}) { return {customer:{name:'Compradora',email:'compradora@example.test',phone:'1122334455'},items:[{productId:String(product._id),quantity:1}],deliveryId:product.type==='digital'?'digital':'pickup',paymentId:product.type==='digital'?'transfer':'cash',idempotencyKey:crypto.randomUUID(),...extra}; }

test('diseño v1.2 normaliza versiones anteriores y valida todos sus tipos, enums y rangos', () => {
  const old = validateDesign({brand:{primary:'#00796b'},shop:{heroTitle:'Mi tienda anterior'}});
  assert.equal(old.shop.heroTitle,'Mi tienda anterior'); assert.equal(old.terms.enabled,false); assert.deepEqual(old.sections,[]);
  assert.equal(validateDesign({product:{paddingX:0,paddingY:0}}).product.paddingX,0);
  for (const [section,settings] of Object.entries(defaultDesign)) {
    if (Array.isArray(settings)) continue;
    for (const [key,value] of Object.entries(settings)) {
      const invalid = typeof value==='boolean' ? 'true' : typeof value==='number' ? String(value) : typeof value==='string' ? false : {};
      assert.throws(()=>validateDesign({[section]:{[key]:invalid}}), section+'.'+key);
      assert.throws(()=>validateDesign({[section]:{[key]:null}}), 'null '+section+'.'+key);
    }
  }
  for (const [field,values] of Object.entries(designEnums).filter(([key])=>!key.includes('*'))) {
    const [section,key]=field.split('.');
    assert.throws(()=>validateDesign({[section]:{[key]:'not-an-option'}}),field);
    assert.ok(values.includes(validateDesign({[section]:{[key]:values[0]}})[section][key]));
  }
  for (const [field,[min,max]] of Object.entries(designNumberRanges).filter(([key])=>!key.includes('*'))) {
    const [section,key]=field.split('.');
    for (const value of [min-1,max+1,min+0.5]) assert.throws(()=>validateDesign({[section]:{[key]:value}}),field);
  }
  for (const key of ['primary','accent','background','text','darkPrimary','darkAccent','darkBackground','darkText']) assert.throws(()=>validateDesign({brand:{[key]:'#123'}}));
  assert.throws(()=>validateDesign({shop:{heroTextColor:'red'}})); assert.throws(()=>validateDesign({cart:{paddingY:161}}));
});

test('secciones, complementos y diapositivas cumplen límites, IDs y profundidad sin aceptar código', () => {
  const design={sections:Array.from({length:12},(_,i)=>({...sectionTemplate,id:'section-'+i,blocks:Array.from({length:12},(_,j)=>({...blockTemplate,id:'block-'+j,text:'Texto'}))})),shop:{heroSlides:Array.from({length:8},(_,i)=>({...slideTemplate,id:'slide-'+i,image:'https://example.test/foto.png'}))}};
  const saved=validateDesign(design); assert.equal(saved.sections.length,12); assert.equal(saved.sections[0].blocks.length,12); assert.equal(saved.shop.heroSlides.length,8);
  for (const invalid of [
    {sections:[...design.sections,{...sectionTemplate,id:'extra'}]},
    {sections:[{...sectionTemplate,id:'x',blocks:[...design.sections[0].blocks,{...blockTemplate,id:'extra'}]}]},
    {shop:{heroSlides:[...design.shop.heroSlides,{...slideTemplate,id:'extra'}]}},
    {sections:[{...sectionTemplate,id:'same'},{...sectionTemplate,id:'same'}]},
    {sections:[{...sectionTemplate,id:'bad/id'}]}, {sections:[{...sectionTemplate,id:'x',blocks:[{...blockTemplate,id:'same'},{...blockTemplate,id:'same'}]}]},
    {shop:{heroSlides:[{...slideTemplate,id:'same'},{...slideTemplate,id:'same'}]}},
    {sections:[{...sectionTemplate,id:'x',blocks:[{...blockTemplate,id:'b',icon:'script'}]}]},
    {sections:[{...sectionTemplate,id:'x',type:'html'}]}, {sections:[{...sectionTemplate,id:'x',columns:5}]},
    {sections:[null]}, {sections:null}, {shop:{heroSlides:'wrong'}},
    {sections:[{...sectionTemplate,id:'x',image:'javascript:alert(1)'}]},
  ]) assert.throws(()=>validateDesign(invalid));
  assert.throws(()=>validateDesign(JSON.parse('{"sections":[{"id":"x","constructor":{"prototype":{"polluted":true}}}]}')));
  assert.equal(validateDesign({sections:[{...sectionTemplate,id:'x',script:'alert(1)',blocks:[{...blockTemplate,id:'b',blocks:[{id:'nested'}]}]}]}).sections[0].script,undefined);
  assert.equal({}.polluted,undefined);
});

test('términos y diseño respetan máximos y fechas reales; guardar Unicode no choca con el antiguo límite HTTP', async () => {
  assert.throws(()=>validateDesign({terms:{...internalTerms,content:' '}}));
  assert.throws(()=>validateDesign({terms:{...internalTerms,updatedAt:'2026-02-30'}}));
  assert.throws(()=>validateDesign({terms:{...internalTerms,content:'x'.repeat(20001)}}));
  assert.throws(()=>validateDesign({shop:{heroSubtitle:'x'.repeat(241)}}));
  assert.throws(()=>validateDesign({brand:{logo:'https://example.test/'+'x'.repeat(2048)}}));
  assert.throws(()=>validateDesign({unused:'x'.repeat(160001)}));
  assert.equal(validateDesign({terms:{...internalTerms,content:'x'.repeat(20000)}}).terms.content.length,20000);
  const who=await fixture();
  const design={sections:Array.from({length:12},(_,i)=>({...sectionTemplate,id:'s'+i,body:'漢'.repeat(4000),blocks:Array.from({length:6},(_,j)=>({...blockTemplate,id:'b'+j,text:'漢'.repeat(1000)}))}))};
  assert.ok(JSON.stringify(design).length<160000); assert.ok(Buffer.byteLength(JSON.stringify({design}))>200*1024);
  const response=await saveDesign(who,design);
  assert.equal(response.status,200,JSON.stringify(response.body)); assert.equal(response.body.data.design.sections[11].blocks[5].text.length,1000);
});

test('fondos rechazan formatos inválidos, más de 25 megapíxeles, más de 5 MiB y propósitos ajenos', async () => {
  const who=await fixture();
  assert.equal((await upload(who,await picture(5001,5000),'wallpaper-shared')).status,422);
  assert.equal((await upload(who,Buffer.from('<svg><script/></svg>'),'wallpaper-shared')).status,422);
  assert.equal((await upload(who,await picture(600,600),'remote-wallpaper')).status,422);
  assert.equal((await upload(who,Buffer.alloc(5*1024*1024+1),'wallpaper-shared')).status,413);
  assert.equal(await UploadedImage.countDocuments(),0);
});

test('fondos aceptan resoluciones pequeñas, grandes y relaciones libres conservando sus dimensiones reales', async () => {
  const who=await fixture();
  for (const [width,height,format] of [[1,1,'png'],[600,600,'jpeg'],[3000,180,'webp'],[5000,5000,'png'],[20000,300,'png']]) {
    const buffer=await sharp({create:{width,height,channels:3,background:'#aabbcc'}})[format]().toBuffer();
    const response=await upload(who,buffer,'wallpaper-shared',{name:'libre.'+format,mime:'image/'+format});
    assert.equal(response.status,201,JSON.stringify(response.body));
    const asset=response.body.data[0];
    assert.equal(asset.width,width); assert.equal(asset.height,height);
    if (width>16383) assert.match(asset.name,/\.png$/);
    const registered=await UploadedImage.findOne({url:asset.url}).select('+contentHash').lean();
    assert.equal(String(registered.storeId),String(who.store._id)); assert.equal(String(registered.uploadedBy),String(who.user._id));
    assert.equal(registered.width,width); assert.equal(registered.height,height); assert.match(registered.contentHash,/^[a-f\d]{64}$/);
    assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'shared',sharedImage:asset.url}})).status,200);
  }
});

test('fondos usan dimensiones orientadas y se vuelven a verificar contra la tienda, el propósito y el archivo', async () => {
  const who=await fixture(), other=await fixture();
  const rotated=await sharp({create:{width:720,height:1280,channels:3,background:'#abcdef'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const desktop=await upload(who,rotated,'wallpaper-desktop',{name:'rotada.jpg',mime:'image/jpeg'});
  assert.equal(desktop.status,201,JSON.stringify(desktop.body)); assert.equal(desktop.body.data[0].width,1280); assert.equal(desktop.body.data[0].height,720);
  const shared=await upload(who,await picture(1280,900),'wallpaper-shared');
  assert.equal(shared.status,201,JSON.stringify(shared.body));
  const asset=shared.body.data[0]; assert.equal(asset.purpose,'wallpaper-shared');
  assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'shared',sharedImage:asset.url}})).status,200);
  assert.equal((await saveDesign(other,{wallpaper:{enabled:true,mode:'shared',sharedImage:asset.url}})).status,422);
  assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'shared',sharedImage:desktop.body.data[0].url}})).status,422);
  assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'shared',sharedImage:'https://example.test/fondo.webp'}})).status,422);
  assert.equal((await saveDesign(who,{wallpaper:{enabled:false,sharedImage:'/uploads/images/no-registrada.webp'}})).status,422);
  await fs.writeFile(path.join(directory,'images',asset.name),await picture(1920,1080));
  assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'shared',sharedImage:asset.url}})).status,422);
  assert.equal((await upload(who,await picture(1920,1920),'wallpaper-shared',{storeId:other.store._id})).status,404);
});

test('modo responsive usa fondos de resoluciones independientes y las imágenes genéricas conservan su API', async () => {
  const who=await fixture();
  const desktop=(await upload(who,await picture(1600,900),'wallpaper-desktop')).body.data[0];
  const mobile=(await upload(who,await picture(900,1600),'wallpaper-mobile')).body.data[0];
  assert.equal((await saveDesign(who,{wallpaper:{enabled:true,mode:'responsive',desktopImage:desktop.url}})).status,422);
  const saved=await saveDesign(who,{wallpaper:{enabled:true,mode:'responsive',desktopImage:desktop.url,mobileImage:mobile.url}});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const generic=await upload(who,await picture(2200,1000));
  assert.equal(generic.status,201); assert.equal(generic.body.data[0].purpose,'image'); assert.equal(generic.body.data[0].width,2000);
  assert.equal((await saveDesign(who,{wallpaper:{sharedImage:generic.body.data[0].url}})).status,422);
});

test('la auditoría redacta secretos recursivamente al guardar y al leer eventos anteriores', async () => {
  const who=await fixture(), root=await admin();
  const details={safe:'Visible',nested:[{password:'password-unique',accessToken:'access-unique',hasAccessToken:'wrong-type-unique',child:{authorization:'Bearer header-unique',digitalUrl:'https://example.test/private-unique'}}],
    changes:[{field:'integrations.mercadopago.accessToken',before:'before-unique',after:'after-unique'}],
    link:'https://example.test/callback?token=query-unique&other=normal',bearer:'Bearer bearer-unique',hasAccessToken:true,
  };
  const event=await AuditService.log({actorId:who.user._id,storeId:who.store._id,action:'store.payments.updated',entity:'store',entityId:who.store._id,details});
  const serialized=JSON.stringify(await AuditLog.findById(event._id).lean());
  for(const value of ['password-unique','access-unique','wrong-type-unique','header-unique','private-unique','before-unique','after-unique','query-unique','bearer-unique']) assert.ok(!serialized.includes(value),value);
  const old=await AuditLog.create({action:'order.paid',entity:'Order',details});
  const detail=await api(root,'get','/admin/audit/'+old._id);
  assert.equal(detail.status,200); assert.equal(detail.body.data.actionLabel,'Pedido pagado'); assert.equal(detail.body.data.changes[0].before,'[Oculto]');
  for(const value of ['password-unique','access-unique','wrong-type-unique','private-unique']) assert.ok(!JSON.stringify(detail.body).includes(value));
  assert.equal(detail.body.data.details.hasAccessToken,true);
  assert.equal((await api(who,'get','/admin/audit/'+event._id)).status,403);
  assert.equal((await request(app).get('/api/admin/audit/'+event._id)).status,401);
});

test('eventos históricos no inventan antes/después; snapshots conservan el contexto aunque cambie el nombre', async () => {
  const who=await fixture(), root=await admin();
  const event=await AuditService.log({actorId:who.user._id,storeId:who.store._id,action:'product.updated',entity:'product',entityId:new mongoose.Types.ObjectId(),entityName:'Producto en ese momento',details:{changes:[{field:'price',after:900}]}});
  await User.updateOne({_id:who.user._id},{$set:{name:'Nuevo nombre'}}); await Store.updateOne({_id:who.store._id},{$set:{name:'Nueva marca'}});
  const read=await api(root,'get','/admin/audit/'+event._id);
  assert.equal(read.body.data.actor.name,'Vendedora de prueba'); assert.equal(read.body.data.store.name,'Tienda del diseño');
  assert.equal(read.body.data.entityName,'Producto en ese momento'); assert.equal(read.body.data.changes[0].beforeRecorded,false); assert.equal(read.body.data.changes[0].before,undefined);
  assert.equal(auditValue('pending','name'),'pending'); assert.equal(auditValue('pending','status'),'Pendiente');
  for (const template of [sectionTemplate,blockTemplate,slideTemplate]) for (const key of Object.keys(template)) assert.ok(Object.hasOwn(auditLabels,key),'Etiqueta española para '+key);
  const designBefore={design:{sections:[{...sectionTemplate,id:'one',title:'Historia',blocks:[{...blockTemplate,id:'block',text:'Texto anterior'}]},{...sectionTemplate,id:'two',title:'Beneficios'},{...sectionTemplate,id:'removed',title:'Descuento'}],shop:{heroSlides:[{...slideTemplate,id:'slide',title:'Primera portada'}]}}};
  const designAfter=structuredClone(designBefore);
  designAfter.design.sections=[designAfter.design.sections[1],designAfter.design.sections[0],{...sectionTemplate,id:'new',title:'Nueva sección'}];
  designAfter.design.sections[1].blocks[0].text='Texto nuevo'; designAfter.design.shop.heroSlides[0].title='Nueva portada';
  const nested=auditChanges(designBefore,designAfter);
  assert.equal(nested.filter(change=>change.field.endsWith('.blocks.0.text')).length,1);
  const blockChange=nested.find(change=>change.field.endsWith('.blocks.0.text'));
  assert.equal(blockChange.before,'Texto anterior'); assert.equal(blockChange.after,'Texto nuevo'); assert.match(blockChange.label,/Complemento.*Texto/);
  assert.ok(nested.some(change=>change.field==='design.sections.order' && change.label.includes('Orden de las secciones')));
  assert.ok(nested.some(change=>change.before===null && change.label.includes('Nueva sección')));
  assert.ok(nested.some(change=>change.after===null && change.label.includes('Descuento')));
  assert.ok(nested.some(change=>change.field==='design.shop.heroSlides.0.title' && change.label.includes('Diapositiva')));
  const nestedEvent=await AuditService.log({actorId:root.user._id,storeId:who.store._id,action:'store.design.updated',entity:'store',entityId:who.store._id,details:{changes:nested}});
  const nestedResult=await api(root,'get','/admin/audit/'+nestedEvent._id);
  assert.ok(nestedResult.body.data.changes.some(change=>change.label===blockChange.label));

  assert.ok(auditChanges({design:{terms:{updatedAt:'2026-10-19'}}},{design:{terms:{updatedAt:'2026-10-20'}}}).some(change=>change.field==='design.terms.updatedAt'));
  const old=await AuditLog.create({action:'unknown.old.event',entity:'store',entityId:String(who.store._id),details:{fields:['contact']}});
  const historical=await api(root,'get','/admin/audit/'+old._id);
  assert.equal(historical.body.data.actionLabel,'Actividad registrada'); assert.equal(historical.body.data.changes.length,0); assert.equal(historical.body.data.actor.type,'unknown'); assert.match(historical.body.data.detailNotice,/no registró/);
  assert.equal((await api(root,'get','/admin/audit/no-id')).status,404);
});

test('listados y dashboard presentan auditoría en español con filtros de acción, actor, tienda y fecha', async () => {
  const who=await fixture(), root=await admin();
  await AuditService.log({actorId:who.user._id,storeId:who.store._id,action:'store.design.updated',entity:'store',entityId:who.store._id,details:{changes:[{field:'design.brand.primary',before:'#000000',after:'#ffffff'}]}});
  await AuditService.log({actorId:root.user._id,action:'plan.created',entity:'plan',details:{}});
  const day=new Date().toISOString().slice(0,10);
  const list=await api(root,'get','/admin/audit?search=Diseño&actorId='+who.user._id+'&storeId='+who.store._id+'&entity=store&from='+day+'&to='+day+'&limit=1');
  assert.equal(list.status,200,JSON.stringify(list.body)); assert.equal(list.body.meta.total,1); assert.equal(list.body.data[0].actionLabel,'Diseño de tienda actualizado'); assert.equal(list.body.data[0].details,undefined); assert.equal(list.body.data[0].changesCount,1);
  assert.equal((await api(root,'get','/admin/audit?action=plan.created')).body.meta.total,1);
  assert.equal((await api(root,'get','/admin/audit?from=2026-02-30')).status,422);
  const dashboard=await api(root,'get','/admin/dashboard');
  assert.equal(dashboard.status,200); assert.ok(dashboard.body.data.activity.every(row=>row.actionLabel)); assert.equal(dashboard.body.data.activity[0].actionLabel,'Plan creado');
});

test('cambios de productos, categorías y planes dejan valores previos reales y ninguna descarga privada', async () => {
  const who=await fixture(), root=await admin(), product=await sellable(who,'digital');
  const changed=await api(who,'put','/stores/'+who.store._id+'/products/'+product._id,{price:1800,featured:true});
  assert.equal(changed.status,200,JSON.stringify(changed.body));
  const event=await AuditLog.findOne({action:'product.updated'}).lean();
  assert.deepEqual(event.details.changes.find(item=>item.field==='price'),{field:'price',before:1200,after:1800});
  assert.ok(!JSON.stringify(event).includes('private-download'));
  const category=await api(who,'post','/stores/'+who.store._id+'/categories',{name:'Original'});
  const renamed=await api(who,'put','/stores/'+who.store._id+'/categories/'+category.body.data._id,{name:'Renombrada'});
  assert.equal(renamed.status,200);
  assert.deepEqual((await AuditLog.findOne({action:'category.updated'})).details.changes.find(item=>item.field==='name'),{field:'name',before:'Original',after:'Renombrada'});
  const plan=await Plan.create({name:'Plan de prueba',price:500,maxStores:1,maxProducts:100});
  const assigned=await api(root,'put','/admin/users/'+who.user._id+'/plan',{planId:String(plan._id),days:30});
  assert.equal(assigned.status,200,JSON.stringify(assigned.body));
  const planEvent=await AuditLog.findOne({action:'user.plan.assigned'}).lean();
  assert.equal(planEvent.details.planName,'Plan de prueba'); assert.ok(planEvent.details.changes.some(change=>change.field==='planExpiresAt' && change.after));
});

test('acciones simultáneas de destacado registran sus preimágenes atómicas y no alteran el stock', async () => {
  const who=await fixture(), product=await sellable(who);
  const endpoint='/stores/'+who.store._id+'/products/'+product._id;
  const results=await Promise.all([api(who,'put',endpoint,{featured:true}),api(who,'put',endpoint,{featured:true})]);
  assert.ok(results.every(result=>result.status===200));
  const events=await AuditLog.find({action:'product.featured.updated'}).lean();
  assert.equal(events.length,2); assert.equal(events.flatMap(event=>event.details.changes).length,1);
  assert.equal((await Product.findById(product._id)).stock,20);
});

test('términos internos exigen aceptación booleana antes de reservar y guardan snapshot autoritativo', async () => {
  const who=await fixture({terms:internalTerms}), product=await sellable(who), service=new CommerceService();
  for(const value of [undefined,false,'true',1,null]) {
    const input=orderInput(product,{termsAccepted:value});
    await assert.rejects(service.createOrder(who.store,input),error=>['TERMS_ACCEPTANCE_REQUIRED','INVALID_TERMS_ACCEPTANCE'].includes(error.code));
  }
  assert.equal(await Order.countDocuments(),0); assert.equal((await Product.findById(product._id)).stock,20);
  const input=orderInput(product,{termsAccepted:true,termsAcceptance:{acceptedAt:'1900-01-01',snapshot:{content:'Falsificado'},contentHash:'fake'}});
  const created=await request(app).post('/api/public/stores/'+who.store.slug+'/orders').send(input);
  assert.equal(created.status,201,JSON.stringify(created.body));
  const order=await Order.findById(created.body.data.order._id);
  assert.equal(order.termsAcceptance.accepted,true); assert.equal(order.termsAcceptance.source,'internal'); assert.equal(order.termsAcceptance.snapshot.content,internalTerms.content);
  assert.equal(order.termsAcceptance.snapshot.url,'http://localhost:5000/t/'+who.store.slug+'/terminos');
  assert.ok(order.termsAcceptance.acceptedAt>new Date(Date.now()-60000)); assert.match(order.termsAcceptance.contentHash,/^[a-f\d]{64}$/);
  const expected=crypto.createHash('sha256').update(JSON.stringify({source:'internal',snapshot:{title:internalTerms.title,intro:internalTerms.intro,content:internalTerms.content,url:order.termsAcceptance.snapshot.url,updatedAt:internalTerms.updatedAt}})).digest('hex');
  assert.equal(order.termsAcceptance.contentHash,expected);
  const entry=await AuditLog.findOne({action:'order.created'}).lean(); assert.equal(entry.actorSnapshot.type,'customer'); assert.equal(entry.actorSnapshot.name,input.customer.name);
});

test('reintentos de pedido conservan aceptación previa aunque se modifiquen los términos y el checkbox', async () => {
  const who=await fixture({terms:internalTerms}), product=await sellable(who), service=new CommerceService(), input=orderInput(product,{termsAccepted:true});
  const first=await service.createOrder(who.store,input);
  const original=await Order.findById(first.order._id);
  who.store.design={terms:{...internalTerms,content:'Nueva versión que se publicó después.'}}; who.store.markModified('design'); await who.store.save();
  const replay=await request(app).post('/api/public/stores/'+who.store.slug+'/orders').send({...input,termsAccepted:false});
  assert.equal(replay.status,201,JSON.stringify(replay.body)); assert.equal(replay.body.data.order._id,String(original._id));
  assert.equal(replay.body.data.order.termsAcceptance.contentHash,original.termsAcceptance.contentHash);
  assert.equal(await Order.countDocuments(),1); assert.equal((await Product.findById(product._id)).stock,19);
  await assert.rejects(service.createOrder(who.store,{...input,items:[{productId:String(product._id),quantity:2}]}),error=>error.code==='IDEMPOTENCY_CONFLICT');
});

test('pedidos manuales no atribuyen aceptación al cliente; enlaces externos sólo guardan los datos conocidos', async () => {
  const who=await fixture({terms:internalTerms}), product=await sellable(who), service=new CommerceService();
  const manual=await api(who,'post','/stores/'+who.store._id+'/orders',orderInput(product,{termsAccepted:true}));
  assert.equal(manual.status,201,JSON.stringify(manual.body));
  const recorded=await Order.findById(manual.body.data.order._id);
  assert.equal(recorded.termsAcceptance.required,true); assert.equal(recorded.termsAcceptance.accepted,false); assert.equal(recorded.termsAcceptance.source,'manual'); assert.equal(recorded.termsAcceptance.acceptedAt,undefined);
  who.store.design={terms:{enabled:false,content:'Borrador privado'},checkout:{termsUrl:'https://example.test/condiciones',termsLabel:'Acepto las condiciones externas'}}; who.store.markModified('design'); await who.store.save();
  await assert.rejects(service.createOrder(who.store,orderInput(product)),error=>error.code==='TERMS_ACCEPTANCE_REQUIRED');
  const external=await service.createOrder(who.store,orderInput(product,{termsAccepted:true}));
  const externalOrder=await Order.findById(external.order._id);
  assert.equal(externalOrder.termsAcceptance.source,'external'); assert.equal(externalOrder.termsAcceptance.snapshot.content,''); assert.equal(externalOrder.termsAcceptance.snapshot.url,'https://example.test/condiciones');
  assert.equal(externalOrder.termsAcceptance.snapshot.title,'Acepto las condiciones externas');
});

test('el catálogo oculta borradores de términos sin modificar el diseño privado', async () => {
  const who=await fixture({terms:{enabled:false,title:'Título privado',intro:'Introducción privada',content:'Borrador secreto de términos'}});
  const before=JSON.stringify(who.store.design), safe=safePublicStore(who.store);
  assert.equal(safe.design.terms.content,''); assert.equal(safe.design.terms.intro,''); assert.equal(JSON.stringify(who.store.design),before);
  const publicResult=await request(app).get('/api/public/stores/'+who.store.slug);
  assert.equal(publicResult.status,200); assert.ok(!JSON.stringify(publicResult.body).includes('Borrador secreto'));
  const privateResult=await api(who,'get','/stores/'+who.store._id);
  assert.equal(privateResult.body.data.design.terms.content,'Borrador secreto de términos');
  assert.equal((await Order.create({storeId:who.store._id,number:'LEGACY',customer:{name:'Test',email:'test@example.test'},items:[],subtotal:0,total:0,payment:{},delivery:{},idempotencyHash:'old',requestHash:'old',accessTokenHash:'old'})).termsAcceptance,undefined);
});

test('checkout exige teléfono configurado y dirección completa en envíos sin impedir productos digitales', async () => {
  const who=await fixture(), product=await sellable(who), service=new CommerceService();
  for(const omitted of ['address','city','postalCode']) {
    const customer={name:'Comprador',email:'persona@example.test',phone:'112233',address:'Calle 123',city:'Rosario',postalCode:'2000'}; delete customer[omitted];
    await assert.rejects(service.createOrder(who.store,orderInput(product,{deliveryId:'shipping',customer})),error=>error.code==='DELIVERY_ADDRESS_REQUIRED');
  }
  const shipped=await service.createOrder(who.store,orderInput(product,{deliveryId:'shipping',customer:{name:'Comprador',email:'persona@example.test',phone:'112233',address:'Calle 123',city:'Rosario',postalCode:'2000'}}));
  assert.equal(shipped.order.total,1300);
  const digital=await sellable(who,'digital');
  const noPhone=orderInput(digital,{customer:{name:'Comprador digital',email:'persona@example.test'}});
  assert.ok((await service.createOrder(who.store,noPhone)).order._id);
  who.store.design={checkout:{requirePhone:true}};
  await assert.rejects(service.createOrder(who.store,{...noPhone,idempotencyKey:crypto.randomUUID()}),/teléfono/);
});

test('auditoría comercial registra stock y transiciones exactas de pago y entrega', async () => {
  const who=await fixture(), product=await sellable(who), inventory=new InventoryService(), service=new CommerceService();
  await inventory.setStock(who.store._id,{reason:'Conteo de inventario',items:[{productId:String(product._id),stock:35,expectedStock:20}]},who.user._id);
  const stock=await AuditLog.findOne({action:'stock.adjusted'}).lean();
  assert.deepEqual(stock.details.adjustments[0],{productId:String(product._id),productName:product.name,variantId:'',variantName:'',before:20,after:35,delta:15});
  const created=await service.createOrder(who.store,orderInput(product));
  await service.changeStatus(who.store._id,String(created.order._id),{status:'paid',confirmFinal:true,note:'Cobro en el local'},who.user._id);
  const paid=await AuditLog.findOne({action:'order.paid'}).lean();
  assert.deepEqual(paid.details.changes.find(change=>change.field==='status'),{field:'status',before:'pending',after:'paid'}); assert.equal(paid.details.note,'Cobro en el local');
  await service.fulfillment(who.store._id,String(created.order._id),{fulfillmentStatus:'delivered',note:'Retirado'},who.user._id);
  const delivery=await AuditLog.findOne({action:'order.fulfillment'}).lean();
  assert.deepEqual(delivery.details.changes.find(change=>change.field==='fulfillmentStatus'),{field:'fulfillmentStatus',before:'unfulfilled',after:'delivered'});
});

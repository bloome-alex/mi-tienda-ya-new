import { Plan } from '../models/index.js';

const planFeatureError = (message, code) => Object.assign(new Error(message), { status: 422, statusCode: 422, code });

export const PLAN_FEATURE_SCHEMA_VERSION = 2;

/**
 * Catálogo único de funcionalidades comerciales.
 *
 * Las claves son contratos técnicos estables. El título/descripción comercial
 * puede personalizarse por plan sin modificar los permisos que consume la app.
 * Los niveles de diseño se expanden de forma acumulativa para mantener la regla
 * Limitado -> Premium -> Empresarial en un solo lugar (OOP / responsabilidad única).
 */
export const PLAN_FEATURES = Object.freeze([
  { key: 'dashboard.statistics', group: 'Administración', label: 'Dashboard de estadísticas', description: 'Habilita ver la sección Administrar / Resumen.' },
  { key: 'management.products', group: 'Administración', label: 'Gestión de Productos', description: 'Habilita ver la sección Administrar / Productos.' },
  { key: 'management.stores', group: 'Administración', label: 'Gestión de Tiendas', description: 'Habilita ver la sección Administrar / Tiendas.' },
  { key: 'management.stock', group: 'Administración', label: 'Gestión de Stock', description: 'Habilita ver la sección Administrar / Stock.' },
  { key: 'management.categories', group: 'Administración', label: 'Gestión de Categorías', description: 'Habilita ver la sección Administrar / Categorías.' },
  { key: 'management.orders', group: 'Administración', label: 'Gestión de Pedidos', description: 'Habilita ver la sección Administrar / Pedidos.' },

  { key: 'design.limited', group: 'Diseño', label: 'Diseño Limitado', description: 'Habilita Identidad, Tienda y Textos.' },
  { key: 'design.premium', group: 'Diseño', label: 'Diseño Premium', description: 'Incluye Diseño Limitado y suma Cabecera, Secciones personalizadas, Producto y Términos.', implies: ['design.limited'] },
  { key: 'design.enterprise', group: 'Diseño', label: 'Diseño Empresarial', description: 'Incluye Diseño Premium y suma Carrito y Checkout.', implies: ['design.premium', 'design.limited'] },

  { key: 'domain.subdomain', group: 'Publicación e integraciones', label: 'Subdominio personalizado', description: 'Habilita la posibilidad de usar y crear un subdominio personalizado.' },
  { key: 'domain.custom', group: 'Publicación e integraciones', label: 'Gestión de dominios propios', description: 'Habilita la posibilidad de usar un dominio propio.' },
  { key: 'store.pwa', group: 'Publicación e integraciones', label: 'Aplicación de tus tiendas para dispositivos', description: 'Habilita configurar la PWA y recomendar la instalación de la tienda desde dispositivos compatibles.' },
  { key: 'payments.mercadopago', group: 'Publicación e integraciones', label: 'Integración con Mercado Pago Checkout Pro', description: 'Habilita Mercado Pago Checkout Pro y su uso en la sección de Cobros.' },
  { key: 'contact.whatsapp', group: 'Publicación e integraciones', label: 'Contacto y Whatsapp directo en tu tienda', description: 'Habilita configurar WhatsApp y mostrar el botón flotante en la tienda.' },
  { key: 'stores.transfer', group: 'Publicación e integraciones', label: 'Transferencia de Tiendas', description: 'Habilita transferir tiendas propias a otros usuarios.' },
]);

const featureMap = new Map(PLAN_FEATURES.map(item => [item.key, item]));
export const ALL_PLAN_FEATURE_KEYS = Object.freeze(PLAN_FEATURES.map(item => item.key));

const idOf = value => value?._id ? String(value._id) : value ? String(value) : '';
const plain = value => value?.toObject ? value.toObject() : { ...value };
const cleanText = (value, max) => String(value || '').trim().slice(0, max);

const LEGACY_FEATURE_MAP = Object.freeze({
  'section.products': 'management.products',
  'section.categories': 'management.categories',
  'section.stock': 'management.stock',
  'section.orders': 'management.orders',
  'section.pwa': 'store.pwa',
  'payments.mercadopago': 'payments.mercadopago',
  'domain.subdomain': 'domain.subdomain',
  'domain.custom': 'domain.custom',
  'contact.whatsapp': 'contact.whatsapp',
  'stores.transfer': 'stores.transfer',
});

export class PlanFeatureService {
  isKnown(key) { return featureMap.has(String(key)); }
  allKeys() { return [...ALL_PLAN_FEATURE_KEYS]; }
  normalize(keys = []) { return [...new Set((Array.isArray(keys) ? keys : []).map(String).filter(key => this.isKnown(key)))]; }
  label(key) { return featureMap.get(String(key))?.label || String(key); }
  description(key) { return featureMap.get(String(key))?.description || ''; }

  expand(keys = []) {
    const expanded = new Set();
    const visit = key => {
      if (!this.isKnown(key) || expanded.has(key)) return;
      expanded.add(key);
      for (const implied of featureMap.get(key)?.implies || []) visit(implied);
    };
    for (const key of this.normalize(keys)) visit(key);
    return [...expanded];
  }

  compact(keys = []) {
    const direct = this.normalize(keys);
    return direct.filter(key => !direct.some(other => other !== key && this.expand([other]).includes(key)));
  }

  catalog() {
    const groups = [];
    for (const feature of PLAN_FEATURES) {
      let group = groups.find(item => item.name === feature.group);
      if (!group) { group = { name: feature.group, features: [] }; groups.push(group); }
      group.features.push({
        key: feature.key,
        label: feature.label,
        description: feature.description,
        implies: [...(feature.implies || [])],
      });
    }
    return groups;
  }

  graph(rows = []) { return new Map(rows.map(row => [idOf(row), plain(row)])); }

  resolveFromGraph(planOrId, graph, stack = []) {
    const id = idOf(planOrId);
    const plan = typeof planOrId === 'object' && planOrId ? plain(planOrId) : graph.get(id);
    if (!plan) return { keys: [], inheritedKeys: [], chain: [] };
    if (stack.includes(id)) throw planFeatureError('Los planes no pueden heredarse en forma circular.', 'PLAN_INHERITANCE_CYCLE');
    const directKeys = this.expand(plan.featureKeys);
    const parentId = idOf(plan.inheritsPlanId);
    if (!parentId) return { keys: directKeys, inheritedKeys: [], chain: [] };
    const parent = graph.get(parentId);
    if (!parent) return { keys: directKeys, inheritedKeys: [], chain: [] };
    const inherited = this.resolveFromGraph(parent, graph, [...stack, id]);
    return {
      keys: [...new Set([...inherited.keys, ...directKeys])],
      inheritedKeys: inherited.keys,
      chain: [{ _id: parentId, name: parent.name }, ...inherited.chain],
    };
  }

  normalizePresentation(entries = [], allowedKeys = null) {
    const allowed = allowedKeys ? new Set(this.normalize(allowedKeys)) : null;
    const byKey = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const key = String(entry?.key || '');
      if (!this.isKnown(key) || (allowed && !allowed.has(key))) continue;
      const title = cleanText(entry?.title, 120);
      const description = cleanText(entry?.description, 500);
      if (title || description) byKey.set(key, { key, title, description });
    }
    return [...byKey.values()];
  }

  presentationFor(plan, directFeatureKeys) {
    const configured = new Map(this.normalizePresentation(plan.featurePresentation, directFeatureKeys).map(item => [item.key, item]));
    return directFeatureKeys.map(key => {
      const custom = configured.get(key);
      return {
        key,
        title: custom?.title || this.label(key),
        description: custom ? custom.description : this.description(key),
      };
    });
  }

  presentFromGraph(plan, graph, { admin = false } = {}) {
    const data = plain(plan);
    const resolved = this.resolveFromGraph(data, graph);
    const parent = resolved.chain[0] || null;
    const inheritedSet = new Set(resolved.inheritedKeys);
    const directFeatureKeys = this.compact(data.featureKeys).filter(key => !inheritedSet.has(key));
    const directFeatures = directFeatureKeys.map(key => this.label(key));
    const featurePresentation = this.normalizePresentation(data.featurePresentation, directFeatureKeys);
    const cardFeatures = this.presentationFor({ ...data, featurePresentation }, directFeatureKeys);
    return {
      ...data,
      featureKeys: directFeatureKeys,
      directFeatureKeys,
      directFeatures,
      featurePresentation,
      cardFeatures: [...(parent ? [{ key: `inherits:${parent._id}`, title: `Todo lo de ${parent.name}`, description: 'Incluye las funcionalidades del plan base.' }] : []), ...cardFeatures],
      resolvedFeatureKeys: resolved.keys,
      inheritedFeatureKeys: resolved.inheritedKeys,
      inheritsPlan: parent,
      features: [...(parent ? [`Incluye todo lo de ${parent.name}`] : []), ...cardFeatures.map(item => item.title)],
      ...(admin ? { inheritanceChain: resolved.chain } : {}),
    };
  }

  async presentMany(plans, options = {}) {
    const all = await Plan.find({}).lean();
    const graph = this.graph(all);
    return plans.map(plan => this.presentFromGraph(plan, graph, options));
  }

  async present(plan, options = {}) { return (await this.presentMany([plan], options))[0]; }

  async directKeysForSave(featureKeys = [], inheritsPlanId = null) {
    const direct = this.compact(featureKeys);
    if (!inheritsPlanId) return direct;
    const inherited = new Set(await this.keysForPlan(inheritsPlanId));
    return direct.filter(key => !inherited.has(key));
  }

  async assertDependencies({ featureKeys = [], inheritsPlanId = null }) {
    const inherited = inheritsPlanId ? await this.keysForPlan(inheritsPlanId) : [];
    return [...new Set([...inherited, ...this.expand(featureKeys)])];
  }

  async assertInheritance({ planId = null, inheritsPlanId = null }) {
    const parentId = idOf(inheritsPlanId);
    if (!parentId) return null;
    if (planId && idOf(planId) === parentId) throw planFeatureError('Un plan no puede heredarse a sí mismo.', 'PLAN_INHERITANCE_SELF');
    const parent = await Plan.findById(parentId).lean();
    if (!parent) throw planFeatureError('El plan base seleccionado no existe.', 'PLAN_PARENT_NOT_FOUND');
    if (!planId) return parent;
    const rows = await Plan.find({}).lean();
    const graph = this.graph(rows);
    let current = parent;
    const visited = new Set([idOf(planId)]);
    while (current) {
      const currentId = idOf(current);
      if (visited.has(currentId)) throw planFeatureError('La herencia de planes formaría un ciclo.', 'PLAN_INHERITANCE_CYCLE');
      visited.add(currentId);
      const nextId = idOf(current.inheritsPlanId);
      current = nextId ? graph.get(nextId) : null;
    }
    return parent;
  }

  async keysForPlan(planId) {
    if (!planId) return [];
    const [plan, all] = await Promise.all([Plan.findById(planId).lean(), Plan.find({}).lean()]);
    if (!plan) return [];
    return this.resolveFromGraph(plan, this.graph(all)).keys;
  }

  async keysForUser(user) {
    if (!user?.active) return [];
    if (user.role === 'admin') return this.allKeys();
    if (user.planId) return this.keysForPlan(user.planId?._id || user.planId);
    if (user.trialEndsAt && new Date(user.trialEndsAt) > new Date()) return this.allKeys();
    return [];
  }

  async has(user, key) {
    if (user?.role === 'admin') return true;
    if (!this.isKnown(key)) return false;
    return (await this.keysForUser(user)).includes(key);
  }

  legacyKeys(row) {
    const source = Array.isArray(row.featureKeys) ? row.featureKeys.map(String) : [];
    if (!Array.isArray(row.featureKeys)) return this.allKeys();
    const next = new Set(['dashboard.statistics']); // Resumen era visible para todos los planes anteriores.
    if (Number(row.maxStores || 1) > 1) next.add('management.stores');
    for (const key of source) {
      if (this.isKnown(key)) next.add(key);
      if (LEGACY_FEATURE_MAP[key]) next.add(LEGACY_FEATURE_MAP[key]);
    }
    // El editor anterior mostraba todos estos tabs con section.design. Se conserva
    // acceso equivalente al migrar para no degradar tiendas ya configuradas.
    if (source.includes('section.design')) next.add('design.enterprise');
    return this.normalize([...next]);
  }

  async initializeLegacyPlans() {
    await Plan.collection.updateMany({ visible: { $exists: false } }, { $set: { visible: true } }).catch(error => {
      if (!['NamespaceNotFound'].includes(error?.codeName)) throw error;
    });

    const legacyRows = await Plan.find({ featureSchemaVersion: { $ne: PLAN_FEATURE_SCHEMA_VERSION } }).lean();
    for (const row of legacyRows) {
      const featureKeys = this.legacyKeys(row);
      await Plan.updateOne({ _id: row._id }, { $set: {
        featureKeys,
        features: featureKeys.map(key => this.label(key)),
        featureSchemaVersion: PLAN_FEATURE_SCHEMA_VERSION,
        featurePresentation: this.normalizePresentation(row.featurePresentation, featureKeys),
      } });
    }

    // La base guarda solamente extras directos. Las heredadas se resuelven en tiempo real.
    const rows = await Plan.find({}).lean();
    const graph = this.graph(rows);
    for (const row of rows) {
      const parentId = idOf(row.inheritsPlanId);
      if (!parentId) continue;
      const parent = graph.get(parentId);
      if (!parent) continue;
      const inherited = new Set(this.resolveFromGraph(parent, graph).keys);
      const direct = this.compact(row.featureKeys).filter(key => !inherited.has(key));
      const presentation = this.normalizePresentation(row.featurePresentation, direct);
      if (JSON.stringify(direct) !== JSON.stringify(this.normalize(row.featureKeys)) || JSON.stringify(presentation) !== JSON.stringify(row.featurePresentation || [])) {
        await Plan.updateOne({ _id: row._id }, { $set: { featureKeys: direct, features: direct.map(key => this.label(key)), featurePresentation: presentation } });
      }
    }
  }
}

export const planFeatureService = new PlanFeatureService();

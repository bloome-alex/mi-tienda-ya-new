import { Plan } from '../models/index.js';

const planFeatureError = (message, code) => Object.assign(new Error(message), { status: 422, statusCode: 422, code });

export const PLAN_FEATURES = Object.freeze([
  { key: 'section.products', group: 'Secciones del panel', label: 'Productos', description: 'ABM de productos de la tienda.' },
  { key: 'section.categories', group: 'Secciones del panel', label: 'Categorías', description: 'ABM jerárquico de categorías y subcategorías.' },
  { key: 'section.stock', group: 'Secciones del panel', label: 'Stock', description: 'Gestión y movimientos de existencias.' },
  { key: 'section.orders', group: 'Secciones del panel', label: 'Pedidos', description: 'Listado, detalle y seguimiento de pedidos.' },
  { key: 'section.payments', group: 'Secciones del panel', label: 'Cobros y entregas', description: 'Configuración de medios de pago y formas de entrega.' },
  { key: 'section.design', group: 'Secciones del panel', label: 'Diseño de la tienda', description: 'Editor visual de la tienda y vista previa.' },
  { key: 'section.contact', group: 'Secciones del panel', label: 'Contacto', description: 'Datos de contacto y formulario público.' },
  { key: 'section.domain', group: 'Secciones del panel', label: 'Dominio', description: 'Subdominio de la plataforma o dominio propio.' },
  { key: 'section.pwa', group: 'Secciones del panel', label: 'Aplicación PWA', description: 'Nombre e ícono instalable por tienda.' },

  { key: 'stores.transfer', group: 'Tiendas y colaboración', label: 'Transferencia de tiendas', description: 'Transferir una tienda a otro vendedor y conservar el historial de transferencias.' },

  { key: 'domain.subdomain', requires: ['section.domain'], group: 'Dominio y publicación', label: 'Subdominio MiTiendaYa', description: 'Publicar con un subdominio propio de la plataforma.' },
  { key: 'domain.custom', requires: ['section.domain'], group: 'Dominio y publicación', label: 'Dominio propio', description: 'Vincular, validar y aprovisionar un dominio externo con HTTPS.' },

  { key: 'products.variants', requires: ['section.products'], group: 'Productos y catálogo', label: 'Variantes de producto', description: 'Talles, colores, SKU, stock y precio por variante.' },
  { key: 'products.digital', requires: ['section.products'], group: 'Productos y catálogo', label: 'Productos digitales', description: 'Entrega automática por enlace después del pago.' },
  { key: 'products.featured', requires: ['section.products'], group: 'Productos y catálogo', label: 'Productos destacados', description: 'Marcado y sección pública de productos destacados.' },
  { key: 'products.related', requires: ['section.products'], group: 'Productos y catálogo', label: 'Productos relacionados', description: 'Relaciones y recomendaciones entre productos.' },

  { key: 'orders.manual', requires: ['section.orders'], group: 'Ventas y cobros', label: 'Carga manual de pedidos', description: 'Crear pedidos desde el panel del vendedor.' },
  { key: 'payments.cash', requires: ['section.payments'], group: 'Ventas y cobros', label: 'Cobro en efectivo', description: 'Habilitar efectivo como medio de pago.' },
  { key: 'payments.transfer', requires: ['section.payments'], group: 'Ventas y cobros', label: 'Transferencia y comprobantes', description: 'Transferencias bancarias con comprobante privado.' },
  { key: 'payments.mercadopago', requires: ['section.payments'], group: 'Ventas y cobros', label: 'Mercado Pago Checkout Pro', description: 'Cobros de las tiendas mediante Mercado Pago.' },
  { key: 'payments.delivery', requires: ['section.payments'], group: 'Ventas y cobros', label: 'Formas de entrega configurables', description: 'Retiro, envío, entrega digital y opciones personalizadas.' },

  { key: 'design.custom_sections', requires: ['section.design'], group: 'Diseño y marketing', label: 'Secciones personalizadas', description: 'Secciones y complementos personalizados dentro de la tienda.' },
  { key: 'design.theme_modes', requires: ['section.design'], group: 'Diseño y marketing', label: 'Modo claro y oscuro', description: 'Temas claro/oscuro propios y selector para clientes.' },
  { key: 'design.backgrounds', requires: ['section.design'], group: 'Diseño y marketing', label: 'Fondos personalizados', description: 'Fondos desktop, mobile o compartidos.' },
  { key: 'design.social_links', requires: ['section.design'], group: 'Diseño y marketing', label: 'Redes sociales', description: 'Redes en cabecera y secciones sociales.' },
  { key: 'design.category_navigation', requires: ['section.design'], group: 'Diseño y marketing', label: 'Navegación avanzada de categorías', description: 'Menús multinivel, panel, selector y sidebar de categorías.' },
  { key: 'checkout.terms', requires: ['section.design'], group: 'Diseño y marketing', label: 'Términos personalizados', description: 'Página de términos y aceptación en checkout.' },
  { key: 'contact.whatsapp', requires: ['section.contact'], group: 'Diseño y marketing', label: 'WhatsApp flotante', description: 'Botón flotante y mensaje inicial de WhatsApp.' },
]);

const featureMap = new Map(PLAN_FEATURES.map(item => [item.key, item]));
export const ALL_PLAN_FEATURE_KEYS = Object.freeze(PLAN_FEATURES.map(item => item.key));

const idOf = value => value?._id ? String(value._id) : value ? String(value) : '';
const plain = value => value?.toObject ? value.toObject() : { ...value };

export class PlanFeatureService {
  isKnown(key) { return featureMap.has(String(key)); }
  allKeys() { return [...ALL_PLAN_FEATURE_KEYS]; }
  normalize(keys = []) { return [...new Set((Array.isArray(keys) ? keys : []).map(String).filter(key => this.isKnown(key)))]; }
  label(key) { return featureMap.get(String(key))?.label || String(key); }
  catalog() {
    const groups = [];
    for (const feature of PLAN_FEATURES) {
      let group = groups.find(item => item.name === feature.group);
      if (!group) { group = { name: feature.group, features: [] }; groups.push(group); }
      group.features.push({ key: feature.key, label: feature.label, description: feature.description, requires: [...(feature.requires || [])] });
    }
    return groups;
  }

  graph(rows = []) { return new Map(rows.map(row => [idOf(row), plain(row)])); }

  resolveFromGraph(planOrId, graph, stack = []) {
    const id = idOf(planOrId);
    const plan = typeof planOrId === 'object' && planOrId ? plain(planOrId) : graph.get(id);
    if (!plan) return { keys: [], inheritedKeys: [], chain: [] };
    if (stack.includes(id)) throw planFeatureError('Los planes no pueden heredarse en forma circular.', 'PLAN_INHERITANCE_CYCLE');
    const directKeys = this.normalize(plan.featureKeys);
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

  displayFeatures(plan, resolved) {
    const direct = this.normalize(plan.featureKeys);
    const lines = [];
    if (resolved.chain[0]) lines.push(`Incluye todo lo de ${resolved.chain[0].name}`);
    for (const key of direct.filter(key => !resolved.inheritedKeys.includes(key))) lines.push(this.label(key));
    return lines;
  }

  presentFromGraph(plan, graph, { admin = false } = {}) {
    const data = plain(plan);
    const resolved = this.resolveFromGraph(data, graph);
    const parent = resolved.chain[0] || null;
    const inheritedSet = new Set(resolved.inheritedKeys);
    const directFeatureKeys = this.normalize(data.featureKeys).filter(key => !inheritedSet.has(key));
    const directFeatures = directFeatureKeys.map(key => this.label(key));
    return {
      ...data,
      featureKeys: directFeatureKeys,
      directFeatureKeys,
      directFeatures,
      resolvedFeatureKeys: resolved.keys,
      inheritedFeatureKeys: resolved.inheritedKeys,
      inheritsPlan: parent,
      features: [...(parent ? [`Incluye todo lo de ${parent.name}`] : []), ...directFeatures],
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
    const direct = this.normalize(featureKeys);
    if (!inheritsPlanId) return direct;
    const inherited = new Set(await this.keysForPlan(inheritsPlanId));
    return direct.filter(key => !inherited.has(key));
  }

  async assertDependencies({ featureKeys = [], inheritsPlanId = null }) {
    const direct = this.normalize(featureKeys);
    const inherited = inheritsPlanId ? await this.keysForPlan(inheritsPlanId) : [];
    const effective = new Set([...inherited, ...direct]);
    for (const key of effective) {
      const feature = featureMap.get(key);
      for (const required of feature?.requires || []) {
        if (!effective.has(required)) throw planFeatureError(`${feature.label} requiere ${this.label(required)}.`, 'PLAN_FEATURE_DEPENDENCY');
      }
    }
    return [...effective];
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

  async initializeLegacyPlans() {
    // Los planes creados antes del sistema de permisos conservan todas las funciones
    // para evitar bajas de acceso al actualizar. Los planes nuevos sí nacen explícitos.
    await Plan.collection.updateMany({ featureKeys: { $exists: false } }, { $set: { featureKeys: this.allKeys() } }).catch(error => {
      if (!['NamespaceNotFound'].includes(error?.codeName)) throw error;
    });
    await Plan.collection.updateMany({ visible: { $exists: false } }, { $set: { visible: true } }).catch(error => {
      if (!['NamespaceNotFound'].includes(error?.codeName)) throw error;
    });
    // La base guarda solamente extras directos. Las heredadas se resuelven en tiempo real.
    const rows = await Plan.find({}).lean();
    const graph = this.graph(rows);
    for (const row of rows) {
      const parentId = idOf(row.inheritsPlanId);
      if (!parentId) continue;
      const parent = graph.get(parentId);
      if (!parent) continue;
      const inherited = new Set(this.resolveFromGraph(parent, graph).keys);
      const direct = this.normalize(row.featureKeys).filter(key => !inherited.has(key));
      if (JSON.stringify(direct) !== JSON.stringify(this.normalize(row.featureKeys))) await Plan.updateOne({ _id: row._id }, { $set: { featureKeys: direct, features: direct.map(key => this.label(key)) } });
    }
  }
}

export const planFeatureService = new PlanFeatureService();

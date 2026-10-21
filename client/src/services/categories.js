/** Iterative, multilevel category navigation shared by forms and storefront. */
export class CategoryTree {
  static id(value) {
    const identifier = value?._id ?? value;
    return identifier == null ? '' : String(identifier);
  }
  constructor(categories = []) {
    this.items = categories.filter(category => category && !category.archived)
      .slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
    this.byId = new Map(this.items.map(category => [CategoryTree.id(category), category]));
    this.byParent = new Map();
    for (const category of this.items) {
      const key = CategoryTree.id(category.parentId);
      if (!this.byParent.has(key)) this.byParent.set(key, []);
      this.byParent.get(key).push(category);
    }
  }
  get(value) { return this.byId.get(CategoryTree.id(value)) || null; }
  parent(value) { return this.get(this.get(value)?.parentId); }
  children(value) { const id = CategoryTree.id(value); return id ? this.byParent.get(id) || [] : []; }
  roots() { return this.items.filter(category => !this.get(category.parentId)); }
  assignableRoots(excludedId = '') {
    const excluded = new Set(this.branchIds(excludedId));
    return this.roots().filter(category => !excluded.has(CategoryTree.id(category)));
  }
  assignableParents(excludedId = '') {
    const excluded = new Set(this.branchIds(excludedId));
    return this.rows().filter(category => !excluded.has(CategoryTree.id(category)));
  }
  trail(value) {
    const result = [], seen = new Set(); let cursor = this.get(value);
    while (cursor && !seen.has(CategoryTree.id(cursor))) {
      seen.add(CategoryTree.id(cursor)); result.push(cursor); cursor = this.parent(cursor);
    }
    return result.reverse();
  }
  root(value) { return this.trail(value)[0] || null; }
  label(value) { return this.trail(value).map(category => category.name).join(' / '); }
  branchIds(value) {
    const category = this.get(value), result = [], seen = new Set(), queue = category ? [category] : [];
    for (let index = 0; index < queue.length; index++) {
      const item = queue[index], key = CategoryTree.id(item);
      if (seen.has(key)) continue;
      seen.add(key); result.push(key); queue.push(...this.children(item));
    }
    return result;
  }
  visibleRows(expandedIds = [], query = '') {
    const rows = this.rows(), expanded = new Set([...expandedIds].map(CategoryTree.id));
    const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const term = normalized(query).trim();
    if (term) {
      const visible = new Set();
      for (const row of rows) {
        if (!normalized([row.name, row.description, row.categoryPath].join(' ')).includes(term)) continue;
        for (const parent of this.trail(row)) visible.add(CategoryTree.id(parent));
      }
      return rows.filter(row => visible.has(CategoryTree.id(row)));
    }
    return rows.filter(row => {
      if (!row.depth) return true;
      const seen = new Set(); let parent = this.parent(row);
      while (parent) {
        const id = CategoryTree.id(parent);
        if (seen.has(id) || !expanded.has(id)) return false;
        seen.add(id); parent = this.parent(parent);
      }
      return true;
    });
  }
  rows() {
    const result = [], seen = new Set();
    const visit = start => {
      const stack = [{ category: start, depth: 0 }];
      while (stack.length) {
        const { category, depth } = stack.pop(), key = CategoryTree.id(category);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ ...category, depth, parentName: this.parent(category)?.name || '', parentPath: this.parent(category) ? this.label(this.parent(category)) : '', categoryPath: this.label(category), isSubcategory: Boolean(CategoryTree.id(category.parentId)), childCount: this.children(category).length });
        for (const child of this.children(category).slice().reverse()) stack.push({ category: child, depth: depth + 1 });
      }
    };
    this.roots().forEach(visit);
    // Defensive fallback makes malformed imported data inspectable without loops.
    this.items.filter(category => !seen.has(CategoryTree.id(category))).forEach(visit);
    return result;
  }
}

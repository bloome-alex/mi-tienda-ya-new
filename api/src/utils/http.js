export const ok = (res, data, status = 200, meta) => res.status(status).json({ data, ...(meta ? { meta } : {}) });
export function pagination(query = {}) {
  return { page: Math.max(1, Math.min(100000, parseInt(query.page || 1, 10) || 1)), limit: Math.max(1, Math.min(500, parseInt(query.limit || 50, 10) || 50)) };
}
export async function listResponse(res, Model, filter, query, { select, populate, sort = { createdAt: -1 } } = {}) {
  const { page, limit } = pagination(query);
  let cursor = Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (select) cursor = cursor.select(select);
  if (populate) cursor = cursor.populate(populate);
  const [data, total] = await Promise.all([cursor.lean(), Model.countDocuments(filter)]);
  return ok(res, data, 200, { page, limit, total });
}
export function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

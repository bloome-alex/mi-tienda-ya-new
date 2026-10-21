export class ApiError extends Error {
  constructor(message, status, code, details) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; }
}

export class ApiClient {
  constructor(baseUrl = '/api') { this.baseUrl = baseUrl; this.csrfToken = ''; }
  setCsrf(token) { this.csrfToken = token || ''; }
  async request(path, { method = 'GET', body, raw = false, signal } = {}) {
    const headers = { Accept: 'application/json' };
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (this.csrfToken && method !== 'GET') headers['X-CSRF-Token'] = this.csrfToken;
    let response;
    try { response = await fetch(`${this.baseUrl}${path}`, { method, headers, credentials: 'include', body: body === undefined ? undefined : isForm ? body : JSON.stringify(body), signal }); }
    catch (error) { if (error.name === 'AbortError') throw error; throw new ApiError('No se pudo conectar. Revisá tu conexión e intentá nuevamente.', 0, 'NETWORK_ERROR'); }
    let payload;
    try { payload = await response.json(); } catch { throw new ApiError('El servidor devolvió una respuesta inesperada.', response.status, 'INVALID_RESPONSE'); }
    if (!response.ok) throw new ApiError(payload.error?.message || 'No se pudo completar la operación.', response.status, payload.error?.code, payload.error?.details);
    return raw ? payload : payload.data;
  }
  get(path, options) { return this.request(path, options); }
  list(path, options = {}) { return this.request(path, { ...options, raw: true }); }
  post(path, body, options) { return this.request(path, { ...options, method: 'POST', body }); }
  put(path, body, options) { return this.request(path, { ...options, method: 'PUT', body }); }
  delete(path, body) { return this.request(path, { method: 'DELETE', body }); }
  upload(path, formData) { return this.post(path, formData); }
}

export const api = new ApiClient();

import { reactive } from 'vue';
import { api } from './api.js';

export const auth = reactive({ user: null, ready: false, csrfToken: '', error: null, entitlement: { featureKeys: [] }, features: { devImpersonation: false }, impersonation: { active: false } });
let loading;
export function setSession(session) {
  auth.user = session?.user || null;
  auth.csrfToken = session?.csrfToken || '';
  auth.entitlement = { featureKeys: [], ...(session?.entitlement || {}) };
  auth.features = { devImpersonation: false, ...(session?.features || {}) };
  auth.impersonation = { active: false, ...(session?.impersonation || {}) };
  api.setCsrf(auth.csrfToken);
  auth.ready = true;
  auth.error = null;
}
export async function loadSession(force = false) {
  if (auth.ready && !force) return auth.user;
  if (loading) return loading;
  loading = api.get('/auth/me').then(session => { setSession(session); return auth.user; }).catch(error => { auth.error = error.message; auth.ready = true; throw error; }).finally(() => { loading = null; });
  return loading;
}
export async function logout() { await api.post('/auth/logout', {}); setSession(null); }

export function canFeature(featureKey) {
  return auth.user?.role === 'admin' || Boolean(auth.entitlement?.featureKeys?.includes(featureKey));
}
export function canAnyFeature(featureKeys = []) {
  return auth.user?.role === 'admin' || featureKeys.some(key => auth.entitlement?.featureKeys?.includes(key));
}

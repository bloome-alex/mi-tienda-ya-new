import { reactive } from 'vue';
import { api } from './api.js';

export const auth = reactive({ user: null, ready: false, csrfToken: '', error: null });
let loading;
export function setSession(session) {
  auth.user = session?.user || null;
  auth.csrfToken = session?.csrfToken || '';
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

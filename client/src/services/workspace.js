import { reactive } from 'vue';
import { api } from './api.js';
export const workspace = reactive({ stores: [], activeStoreId: '', loading: false, transferSummary: { pendingIncoming: [], pendingOutgoing: [], history: [], pendingIncomingCount: 0, pendingOutgoingStoreIds: [], canTransfer: false } });
export async function loadStores() {
  workspace.loading = true;
  try {
    workspace.stores = await api.get('/stores');
    let stored = '';
    try { stored = localStorage.getItem('mt-active-store') || ''; } catch {}
    if (!workspace.stores.some(s => s._id === workspace.activeStoreId)) {
      workspace.activeStoreId = workspace.stores.some(s => s._id === stored) ? stored : (workspace.stores[0]?._id || '');
    }
  } finally { workspace.loading = false; }
}

export async function loadTransferSummary() {
  const result = await api.get('/me/store-transfers');
  workspace.transferSummary = result || { pendingIncoming: [], pendingOutgoing: [], history: [], pendingIncomingCount: 0, pendingOutgoingStoreIds: [], canTransfer: false };
  return workspace.transferSummary;
}

let storeSwitchGuard;
export function registerStoreSwitchGuard(guard) { storeSwitchGuard=guard; return ()=>{if(storeSwitchGuard===guard)storeSwitchGuard=undefined;}; }
export async function ensureWorkspaceCanLeave() { return storeSwitchGuard ? !!(await storeSwitchGuard()) : true; }
export async function selectStore(id) {
  if (id === workspace.activeStoreId) return true;
  if (!workspace.stores.some(store => store._id === id) || !await ensureWorkspaceCanLeave()) return false;
  workspace.activeStoreId = id;
  try { localStorage.setItem('mt-active-store', id); } catch {}
  return true;
}
export function activeStore() { return workspace.stores.find(s => s._id === workspace.activeStoreId); }

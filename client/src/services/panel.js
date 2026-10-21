import { reactive, ref, watch, toValue } from 'vue';
import { api } from './api.js';
export const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value || 0));
export const date = value => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const shortDate = value => value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
export const idOf = value => value?._id || value || '';
export const statuses = {pending:'Pendiente',awaiting_payment:'Esperando pago',processing:'En proceso',paid:'Pagado',cancelled:'Cancelado'};
export const fulfillments = {unfulfilled:'Sin preparar',preparing:'En preparación',shipped:'Enviado',delivered:'Entregado'};
export function useCollection(path, extra = () => ({})) {
  const rows = ref([]), loading = ref(false), error = ref('');
  const meta = reactive({total:0,page:1,limit:15});
  const query = reactive({page:1,search:''});
  let requestId = 0;
  async function load() {
    const endpoint = toValue(path); if (!endpoint) { rows.value=[]; meta.total=0; return; }
    const run = ++requestId; loading.value=true; error.value='';
    try { const params = new URLSearchParams({page:String(query.page),limit:String(meta.limit),search:query.search,...toValue(extra)}); const result=await api.list(`${endpoint}?${params}`); if(run!==requestId)return; rows.value=result.data || []; Object.assign(meta,result.meta || {total:rows.value.length,page:query.page}); }
    catch(e){ if(run===requestId)error.value=e.message; }
    finally { if(run===requestId)loading.value=false; }
  }
  function updateQuery(value) { Object.assign(query,value); }
  watch([()=>toValue(path),()=>toValue(extra),()=>query.page,()=>query.search],load,{immediate:true,deep:true});
  return {rows,loading,error,meta,query,load,updateQuery};
}
export async function fetchAll(path) {
 const rows=[]; let page=1,total=Infinity;
 while(rows.length<total) { const r=await api.list(`${path}${path.includes('?')?'&':'?'}page=${page}&limit=100`); rows.push(...(r.data||[])); total=r.meta?.total ?? rows.length; if(!r.data?.length)break; page++; }
 return rows;
}

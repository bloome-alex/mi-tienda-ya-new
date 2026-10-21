import { reactive } from 'vue';
import { uniqueKey } from './ids.js';
export { uniqueKey } from './ids.js';
export class CartService {
  constructor(slug) {
    this.key = `mty-cart-v1:${slug}`;
    let saved;
    try { saved=JSON.parse(localStorage.getItem(this.key)||'null'); } catch { saved=null; }
    const items=Array.isArray(saved?.items) ? saved.items.filter(i=>typeof i.productId==='string'&&typeof i.key==='string'&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=99).slice(0,100):[];
    this.state=reactive({items,notes:saved?.notes||'',checkoutKey:saved?.checkoutKey||uniqueKey(),fingerprint:saved?.fingerprint||''});
  }
  get count(){return this.state.items.reduce((sum,item)=>sum+item.quantity,0);}
  get subtotal(){return this.state.items.reduce((sum,item)=>sum+item.quantity*Number(item.price||0),0);}
  save(){try{localStorage.setItem(this.key,JSON.stringify(this.state));}catch{}}
  changed(){this.state.checkoutKey=uniqueKey();this.state.fingerprint='';this.save();}
  add(product,variant,quantity=1){
    quantity=Number(quantity);
    if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error('Elegí una cantidad entre 1 y 99.');
    if(product.variants?.length&&!variant)throw new Error('Elegí una variante para continuar.');
    const variantId=variant?.id||'',key=`${product._id}:${variantId}`,existing=this.state.items.find(i=>i.key===key);
    if(quantity+(existing?.quantity||0)>99)throw new Error('Podés agregar hasta 99 unidades por producto o variante.');
    const stock=variant?variant.stock:product.stock,unlimited=product.type==='digital'||product.madeToOrder;
    if(!unlimited&&quantity+(existing?.quantity||0)>stock)throw new Error('No hay suficiente stock para esa cantidad.');
    if(existing){existing.quantity+=quantity;existing.price=variant?.price ?? product.price;existing.unavailable=false;}
    else{if(this.state.items.length>=100)throw new Error('El carrito admite hasta 100 productos diferentes.');this.state.items.push({key,productId:product._id,variantId,name:product.name,variantName:variant?.name||'',image:product.images?.[0]||'',price:variant?.price ?? product.price,type:product.type,madeToOrder:product.madeToOrder,quantity,stock,unavailable:false});}
    this.changed();
  }
  setQuantity(key,quantity){const item=this.state.items.find(i=>i.key===key);if(!item)return;quantity=Number(quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error('La cantidad debe estar entre 1 y 99.');if(item.type!=='digital'&&!item.madeToOrder&&quantity>item.stock)throw new Error('La cantidad supera el stock disponible.');item.quantity=quantity;this.changed();}
  remove(key){this.state.items=this.state.items.filter(i=>i.key!==key);this.changed();}
  notes(value){this.state.notes=value;this.changed();}
  clear(){this.state.items=[];this.state.notes='';this.changed();}
  checkoutKey(fingerprint){if(this.state.fingerprint!==fingerprint){this.state.fingerprint=fingerprint;this.state.checkoutKey=uniqueKey();this.save();}return this.state.checkoutKey;}
  async refresh(getProduct){
    await Promise.all(this.state.items.map(async item=>{try{const product=await getProduct(item.productId),variant=item.variantId?product.variants?.find(v=>v.id===item.variantId):null;item.unavailable=!product.active||(item.variantId&&!variant)||(!item.variantId&&product.variants?.length>0);item.name=product.name;item.image=product.images?.[0]||'';item.price=variant?.price??product.price;item.stock=variant?.stock??product.stock;item.madeToOrder=product.madeToOrder;item.type=product.type;}catch(e){if(e.status===404)item.unavailable=true;else throw e;}}));this.save();
  }
}
const carts=new Map();
export function cartFor(slug){if(!carts.has(slug))carts.set(slug,new CartService(slug));return carts.get(slug);}

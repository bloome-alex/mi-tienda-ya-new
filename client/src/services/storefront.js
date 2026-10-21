import { inject } from 'vue';
export const storefrontKey=Symbol('storefront');
export function useStorefront(){const context=inject(storefrontKey);if(!context)throw new Error('Falta el contexto de tienda.');return context;}

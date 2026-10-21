// randomUUID is restricted to secure contexts. getRandomValues also supports
// local HTTP previews while retaining cryptographically random identifiers.
export const uniqueKey = () => typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');

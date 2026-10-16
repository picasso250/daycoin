// SAFE DEFAULT: no live contract configured. Local tests inject a temporary
// config through a local-only fixture server. Never point this file at v0.1.
export const CONFIG = Object.freeze({
  label: 'UBIC1-v0.2 · 未部署',
  chainId: null,
  address: null,
  runtimeHash: null,
  rpcUrl: null,
  explorerUrl: null
});

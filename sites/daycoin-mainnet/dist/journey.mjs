// Anonymous journey telemetry: one ephemeral ID per tab, expires after inactivity.
// No wallet address, transaction hash, amounts, raw referrer or persistent identity.
const KEY = 'dc1_journey_v1';
const TTL = 30 * 60 * 1000;
const disabled = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
const route = location.pathname;
const page = route.startsWith('/zh/') ? 'zh' : 'en';
const section = route.includes('whitepaper') ? 'whitepaper' : route.includes('manifesto') ? 'manifesto' : 'home';
const pageName = section + '_' + page;
let state;
if (!disabled) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    state = existing && /^[0-9a-f-]{36}$/.test(existing.id) && Date.now() - existing.t < TTL && existing.step < 1000
      ? existing : { id: crypto.randomUUID(), step: 0, t: Date.now() };
  } catch { /* storage unavailable: events are disabled */ }
}
export function track(event) {
  if (!state) return;
  state.step += 1; state.t = Date.now();
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { return; }
  // Fire-and-forget; no impact on any wallet or transaction operation.
  fetch('/api/journey', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: state.id, event, page: pageName, step: state.step }),
    keepalive: true, credentials: 'omit', cache: 'no-store'
  }).catch(() => {});
}
track('page_view');
if (section === 'home') {
  const sectionNode = document.querySelector('#protocol');
  if (sectionNode && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { track('protocol_view'); observer.disconnect(); }
    }, { threshold: 0.25 });
    observer.observe(sectionNode);
  }
}
window.addEventListener('pagehide', () => track('page_exit'), { once: true });

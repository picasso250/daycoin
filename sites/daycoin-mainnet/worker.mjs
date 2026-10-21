// Anonymous, per-tab journey events. No account addresses, amounts, IPs or cookies.
const EVENTS = new Set([
  'page_view', 'protocol_view', 'connect_click', 'wallet_select', 'connect_success',
  'connect_cancel', 'connect_error', 'tab_deposit', 'tab_claim', 'tab_withdraw',
  'deposit_click', 'claim_click', 'withdraw_click', 'confirmation_open',
  'confirmation_cancel', 'confirmation_confirm', 'transaction_submitted',
  'transaction_confirmed', 'transaction_error', 'page_exit'
]);
const PAGES = new Set(['home_en', 'home_zh', 'whitepaper_en', 'whitepaper_zh', 'manifesto_en', 'manifesto_zh']);
const json = (message, status) => new Response(message, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/journey') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json('Method not allowed', 405);
    // Prevent cross-site websites from causing analytics writes.
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return json('Forbidden', 403);
    }
    if (Number(request.headers.get('Content-Length') || 0) > 512) return json('Too large', 413);
    let payload;
    try {
      const body = await request.text();
      if (body.length > 512) return json('Too large', 413);
      payload = JSON.parse(body);
    } catch { return json('Invalid JSON', 400); }
    const { session, event, page, step } = payload ?? {};
    if (typeof session !== 'string' || !/^[0-9a-f-]{36}$/.test(session) ||
      !EVENTS.has(event) || !PAGES.has(page) ||
      !Number.isInteger(step) || step < 1 || step > 1000 ||
      Object.keys(payload).sort().join(',') !== 'event,page,session,step') {
      return json('Invalid event', 400);
    }
    if (!env.JOURNEY || !env.JOURNEY_DB) return json('Analytics unavailable', 503);
    try {
      await env.JOURNEY_DB.prepare('INSERT OR IGNORE INTO daycoin_events (session, step, event, page) VALUES (?, ?, ?, ?)')
        .bind(session, step, event, page).run();
    } catch { return json('Event storage unavailable', 503); }
    env.JOURNEY.writeDataPoint({ blobs: [session, event, page], doubles: [step], indexes: [session] });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
};

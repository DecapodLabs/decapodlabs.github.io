// Offline degraded-availability, fault-injection, and synthetic-readiness tests for Issue #71.
// Zero network calls, zero paid traffic, zero credentials stored.
import '../cloud-flow.js';
import '../signup/signup.js';
import '../admin/admin.js';
import { runSyntheticReadiness } from '../scripts/synthetic-readiness.ts';

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('degraded_assertion_failed: ' + msg);
};
const assertEq = (actual: unknown, expected: unknown, msg: string) => {
  if (actual !== expected) {
    throw new Error(`degraded_assertion_failed (${msg}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const flow = (globalThis as any).DecapodCloudFlow;
const signupApp = (globalThis as any).DecapodSignupApp;
const adminApp = (globalThis as any).DecapodAdminApp;
assert(flow && signupApp && adminApp, 'browser globals exported');

class MockElement {
  id = '';
  tagName: string;
  children: MockElement[] = [];
  dataset: Record<string, string> = {};
  hidden = false;
  disabled = false;
  checked = false;
  value = '';
  href = '';
  min = '1';
  max = '25';
  type = 'text';
  className = '';
  style = { props: new Map<string, string>(), setProperty(k: string, v: string) { this.props.set(k, v); } };
  classList = {
    set: new Set<string>(),
    add: (...c: string[]) => c.forEach(x => this.classList.set.add(x)),
    remove: (...c: string[]) => c.forEach(x => this.classList.set.delete(x)),
    toggle: (c: string, force?: boolean) => {
      if (force === undefined) {
        if (this.classList.set.has(c)) { this.classList.set.delete(c); return false; }
        this.classList.set.add(c); return true;
      }
      if (force) this.classList.set.add(c); else this.classList.set.delete(c);
      return force;
    },
    contains: (c: string) => this.classList.set.has(c),
  };
  attrs = new Map<string, string>();
  listeners = new Map<string, ((ev?: any) => void)[]>();
  onclick: ((ev?: any) => any) | null = null;
  onchange: ((ev?: any) => any) | null = null;
  _text = '';
  constructor(tag = 'div', id = '') { this.tagName = tag; this.id = id; }
  get textContent(): string { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(val: string) { this._text = String(val); this.children = []; }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  appendChild(child: MockElement) { this.children.push(child); return child; }
  replaceChildren(...nodes: MockElement[]) { this._text = ''; this.children = [...nodes]; }
  addEventListener(type: string, fn: (ev?: any) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  click() {
    if (this.disabled) return undefined;
    if (this.onclick) return this.onclick({});
    for (const fn of this.listeners.get('click') ?? []) fn({});
    return undefined;
  }
}

class MockDocument {
  elements = new Map<string, MockElement>();
  selectorLists = new Map<string, MockElement[]>();
  metaMap = new Map<string, MockElement>();
  register(el: MockElement) { if (el.id) this.elements.set(el.id, el); return el; }
  setMeta(name: string, content: string) {
    const meta = new MockElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    this.metaMap.set(`meta[name="${name}"]`, meta);
  }
  getElementById(id: string) { return this.elements.get(id) ?? null; }
  querySelector(sel: string) { return this.metaMap.get(sel) ?? null; }
  querySelectorAll(sel: string) { return this.selectorLists.get(sel) ?? []; }
  createElement(tag: string) { return new MockElement(tag); }
  createTextNode(text: string) { const el = new MockElement('#text'); el.textContent = text; return el; }
  addEventListener() {}
}

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    dump: () => map,
  };
}

function createPricingDom() {
  const doc = new MockDocument();
  doc.setMeta('decapod-flow-contract', '1');
  doc.setMeta('decapod-asset-release', flow.ASSET_RELEASE);
  const reg = (tag: string, id: string) => doc.register(new MockElement(tag, id));
  const repoInput = reg('input', 'repo-count');
  repoInput.value = '2'; repoInput.min = '1'; repoInput.max = '10';
  const seatInput = reg('input', 'seat-count');
  seatInput.value = '5'; seatInput.min = '1'; seatInput.max = '25';
  const cloudBtn = reg('button', 'cloud-pay-cta'); cloudBtn.disabled = true;
  const previewBtn = reg('button', 'preview-checkout'); previewBtn.disabled = true;
  const banner = reg('div', 'pricing-repo-banner'); banner.hidden = true;
  reg('strong', 'pricing-repo-slug');
  reg('span', 'pricing-repo-note');
  reg('div', 'annual-savings');
  for (const id of ['repo-count-value', 'seat-count-value', 'assignment-count', 'assignment-formula', 'repo-discount', 'contributor-discount', 'combined-discount', 'annual-volume', 'annual-discount']) {
    reg('span', id);
  }
  return doc;
}

function createSignupDom() {
  const doc = new MockDocument();
  doc.setMeta('decapod-flow-contract', '1');
  doc.setMeta('decapod-asset-release', flow.ASSET_RELEASE);
  const ids = [
    'signup-app', 'signup-repo-banner', 'signup-repo-banner-title', 'signup-repo-banner-note',
    'signup-status', 'account-bar', 'account-summary', 'refresh-account-btn', 'sign-out-btn',
    'auth-gate', 'auth-github', 'auth-google', 'cancel-auth-btn', 'auth-provider-note',
    'step-identity', 'identity-heading', 'identity-message', 'identity-link-actions',
    'link-github-btn', 'identity-quarantine-actions', 'confirm-provider-btn', 'revoke-provider-btn',
    'step-org-repo', 'org-repo-copy', 'org-picker-block', 'org-select', 'repo-select',
    'repo-input', 'verify-repo-btn', 'authorize-github-repos-btn', 'org-repo-hint',
    'step-state', 'state-kicker', 'state-heading', 'state-message', 'state-detail',
    'state-retry-btn', 'state-change-repo-btn',
    'step-checkout', 'checkout-target-label', 'billing-closed-notice', 'billing-quote-controls',
    'billing-cadence', 'seat-quantity', 'quote-btn', 'quote-summary', 'quote-amount',
    'quote-details', 'quote-commitment', 'checkout-btn', 'checkout-back-btn',
    'step-ready', 'ready-summary', 'ready-another-btn',
  ];
  for (const id of ids) {
    const tag = id.endsWith('-select') ? 'select' : id.endsWith('-btn') ? 'button' : 'div';
    doc.register(new MockElement(tag, id));
  }
  doc.getElementById('billing-cadence')!.value = 'month';
  doc.getElementById('seat-quantity')!.value = '1';
  return doc;
}

function createAdminDom() {
  const doc = new MockDocument();
  doc.setMeta('decapod-flow-contract', '1');
  doc.setMeta('decapod-asset-release', flow.ASSET_RELEASE);
  const ids = [
    'admin-app', 'admin-route-banner', 'admin-route-banner-title', 'admin-route-banner-note',
    'admin-status', 'admin-account-bar', 'admin-account-summary', 'admin-org-switcher-wrap',
    'admin-org-select', 'admin-org-uuid-badge', 'admin-refresh-btn', 'admin-sign-out-btn',
    'admin-auth-gate', 'admin-auth-github', 'admin-auth-google', 'admin-cancel-auth-btn',
    'admin-auth-provider-note', 'admin-identity-panel', 'admin-identity-heading',
    'admin-identity-message', 'admin-identity-link-actions', 'admin-link-github-btn',
    'admin-identity-quarantine-actions', 'admin-confirm-provider-btn', 'admin-revoke-provider-btn',
    'admin-denied-panel', 'admin-denied-kicker', 'admin-denied-heading', 'admin-denied-message',
    'admin-denied-detail', 'admin-denied-actions', 'admin-open-authorized-org-btn',
    'admin-workspace', 'admin-context-heading', 'admin-orthogonality-pill',
    'admin-active-org-uuid', 'admin-active-org-slug', 'admin-active-org-provider',
    'admin-orthogonality-summary', 'admin-route-mode-note',
    'admin-repos-list', 'admin-repos-empty', 'admin-enroll-repo-input', 'admin-enroll-repo-btn',
    'admin-authorize-github-btn', 'admin-enroll-status', 'admin-settings-project-select',
    'admin-settings-project-name', 'admin-save-project-btn', 'admin-project-settings-status',
    'admin-assign-project-select', 'admin-assign-member-select', 'admin-assign-seat-btn',
    'admin-revoke-seat-btn', 'admin-more-billing-members-btn', 'admin-seat-assign-status',
    'admin-members-list', 'admin-refresh-members-btn', 'admin-next-members-btn', 'admin-members-status',
    'admin-invite-recipient', 'admin-invite-btn', 'admin-refresh-invitations-btn',
    'admin-more-invitations-btn', 'admin-invitation-copy-box', 'admin-invitation-link',
    'admin-copy-invitation-btn', 'admin-invitations-list', 'admin-invitations-status',
    'admin-delegation-box', 'admin-delegation-note', 'admin-delegation-meta',
    'admin-delegation-list', 'admin-delegation-invites-list', 'admin-delegate-account',
    'admin-delegate-action-note', 'admin-grant-admin-btn', 'admin-invite-admin-btn',
    'admin-revoke-admin-btn', 'admin-transfer-owner-btn', 'admin-delegation-status',
    'admin-template-source-project', 'admin-template-target-org', 'admin-template-target-project',
    'admin-export-template-btn', 'admin-preview-template-btn', 'admin-import-template-btn',
    'admin-template-status', 'admin-template-audit-list',
    'admin-overage-status', 'admin-overage-receipt', 'admin-overage-cap-usd',
    'admin-overage-terms-check', 'admin-overages-enable-btn', 'admin-overages-update-btn',
    'admin-overages-revoke-btn', 'admin-overage-save-status', 'admin-overage-ledger-list',
    'admin-resource-cards', 'admin-limit-metric', 'admin-limit-cap', 'admin-limit-warn',
    'admin-limit-crit', 'admin-limit-notify', 'admin-save-limit-btn', 'admin-reset-limit-btn',
    'admin-refresh-limits-btn', 'admin-limit-save-status', 'admin-resource-alerts',
    'admin-billing-status', 'admin-pending-order-box', 'admin-pending-order-summary',
    'admin-cancel-order-btn', 'admin-billing-portal-btn', 'admin-add-capacity-link', 'admin-billing-detail',
    'admin-devices-status', 'admin-devices-list', 'admin-refresh-devices-btn',
    'admin-recovery-contact-summary', 'admin-recovery-contact-input',
    'admin-set-recovery-contact-btn', 'admin-clear-recovery-contact-btn',
    'admin-refresh-recovery-btn', 'admin-recovery-status',
  ];
  for (const id of ids) {
    const tag = id.endsWith('-select') || id === 'admin-limit-metric' ? 'select' : id.endsWith('-btn') ? 'button' : 'div';
    doc.register(new MockElement(tag, id));
  }
  return doc;
}

const TEST_PROFILE = {
  contractVersion: 1,
  apiOrigin: 'https://api.decapodlabs.ai',
  onboardingPrefix: 'https://api.decapodlabs.ai/functions/v1/decapod-onboarding',
  authBaseUrl: 'https://api.decapodlabs.ai/auth',
  projectOrigin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
  publishableKey: 'sb_publishable_test_fixture',
  authProviders: { github: true, google: true, gitlab: false },
  liveSaleEnabled: true,
};

Deno.test('#71 cloud-flow discovery rejects malformed config fail-closed, handles provider outages, and correlation/Retry-After stay safe', async () => {
  // 1. Malformed JSON or untrusted project_origin on primary fails closed without silent fallback
  let fallbackCalled = false;
  const malformedRes = await flow.discoverRuntimeStatus((url: string) => {
    if (url.startsWith('https://goyxpcmxetztjlrrcwew.supabase.co/')) fallbackCalled = true;
    return Promise.resolve(new Response('<html>502 Bad Gateway', {
      status: 200,
      headers: { 'x-request-id': 'req_bad_cfg_01' },
    }));
  });
  assertEq(malformedRes.status, 'invalid', 'malformed 200 config returns invalid');
  assertEq(malformedRes.profile, null, 'malformed config returns null profile');
  assertEq(malformedRes.correlationId, 'req_bad_cfg_01', 'safe correlation ref extracted');
  assertEq(fallbackCalled, false, 'malformed 200 config from primary does NOT silently fall back');

  // 2. Untrusted project_origin in JSON fails closed
  const untrustedRes = await flow.discoverRuntimeStatus(() =>
    Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: 'https://evil.example',
      publishable_key: 'sb_publishable_test',
    }), { status: 200 }))
  );
  assertEq(untrustedRes.status, 'invalid', 'untrusted project_origin rejected as invalid');

  // 3. 429 rate-limited discovery preserves retryAfterSec + correlationId
  const rateLimitRes = await flow.discoverRuntimeStatus(() =>
    Promise.resolve(new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '12', 'cf-ray': 'abc123-SLC' },
    }))
  );
  assertEq(rateLimitRes.status, 'rate_limited', '429 discovery status');
  assertEq(rateLimitRes.retryAfterSec, 12, 'Retry-After seconds parsed');
  assertEq(rateLimitRes.correlationId, 'abc123-SLC', 'cf-ray correlation ref parsed');

  // 4. Provider outage on /auth/providers falls back safely to onboarding /auth
  const provOutage = await flow.discoverRuntimeStatus((url: string) => {
    if (url.includes('/config')) {
      return Promise.resolve(new Response(JSON.stringify({
        version: 1,
        project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
        publishable_key: 'sb_publishable_test',
        auth_providers: { github: true, google: false, gitlab: false },
      }), { status: 200 }));
    }
    return Promise.resolve(new Response('unavailable', { status: 503 }));
  });
  assertEq(provOutage.status, 'ok', 'primary config survives /auth/providers 503');
  assertEq(provOutage.profile.authProvidersDegraded, true, 'authProvidersDegraded flagged');
  assertEq(provOutage.profile.authBaseUrl, 'https://api.decapodlabs.ai/functions/v1/decapod-onboarding/auth', 'falls back to onboarding auth');

  // 5. extractCorrelationRef strips JWTs and secrets
  assertEq(flow.extractCorrelationRef(null, null, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), null, 'JWT never returned as correlation ref');
  assertEq(flow.extractCorrelationRef(null, null, 'ghp_1234567890abcdef'), null, 'GitHub token never returned as correlation ref');
  assertEq(flow.extractCorrelationRef(null, null, 'req-safe-71_ok'), 'req-safe-71_ok', 'opaque correlation ID preserved');

  // 6. Bounded poller stops immediately on 403 and honors Retry-After on 429
  let attempts403 = 0;
  let threw403 = false;
  try {
    await flow.createBoundedPoller({
      maxAttempts: 5,
      intervalMs: 0,
      sleepFn: () => Promise.resolve(),
      checkFn: () => {
        attempts403++;
        const e: any = new Error('admin_required');
        e.status = 403;
        return Promise.reject(e);
      },
    });
  } catch (e: any) {
    threw403 = e.status === 403;
  }
  assert(threw403 && attempts403 === 1, 'poller aborts immediately on 403 without 5 retries');

  const sleeps: number[] = [];
  let attempts429 = 0;
  const pollerRes = await flow.createBoundedPoller({
    maxAttempts: 3,
    intervalMs: 100,
    sleepFn: (ms: number) => { sleeps.push(ms); return Promise.resolve(); },
    checkFn: () => {
      attempts429++;
      if (attempts429 === 1) {
        const e: any = new Error('rate_limited');
        e.status = 429;
        e.retryAfterMs = 4000;
        return Promise.reject(e);
      }
      return Promise.resolve({ status: 'pending_fulfillment' });
    },
  });
  assertEq(pollerRes.outcome, 'pending_timeout', 'bounded poller ends at pending_timeout');
  assertEq(sleeps[0], 4000, 'poller honors 429 Retry-After delay');
});

Deno.test('#71 Pricing handles paused/unreachable backend, 429, malformed config, and stale readiness without false ready state', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');
  const prevStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const prev = {
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    history: (globalThis as any).history,
    fetch: (globalThis as any).fetch,
  };
  const navigations: string[] = [];
  try {
    // 1. Paused / unreachable backend (503) without ?repo= shows degraded banner & keeps buttons disabled
    const doc1 = createPricingDom();
    const storage1 = makeStorage();
    (globalThis as any).document = doc1;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage1, configurable: true, writable: true });
    (globalThis as any).history = { replaceState: () => {} };
    (globalThis as any).location = { origin: 'https://decapodlabs.ai', pathname: '/pricing', search: '', hash: '', assign: (u: string) => navigations.push(u) };
    (globalThis as any).fetch = () => Promise.resolve(new Response('paused', { status: 503, headers: { 'x-request-id': 'req_paused_503' } }));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));
    assertEq(doc1.getElementById('cloud-pay-cta')!.disabled, true, 'Pay CTA stays disabled on 503');
    assertEq(doc1.getElementById('pricing-repo-banner')!.hidden, false, 'Degraded banner shown on 503 even without ?repo=');
    assert(doc1.getElementById('pricing-repo-note')!.textContent.includes('req_paused_503'), 'Correlation ref shown on 503');

    // 2. Malformed config (200 HTML) keeps CTAs locked and reports malformed config
    const doc2 = createPricingDom();
    (globalThis as any).document = doc2;
    Object.defineProperty(globalThis, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
    (globalThis as any).location = { origin: 'https://decapodlabs.ai', pathname: '/pricing', search: '?repo=DecapodLabs%2Fdecapod', hash: '', assign: (u: string) => navigations.push(u) };
    (globalThis as any).fetch = () => Promise.resolve(new Response('not-json', { status: 200 }));
    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));
    assertEq(doc2.getElementById('cloud-pay-cta')!.disabled, true, 'Pay CTA disabled on malformed config');
    assert(doc2.getElementById('pricing-repo-note')!.textContent.includes('Malformed'), 'Malformed config banner shown');

    // 3. Stale readiness (>300s) when Pay clicked and re-probe returns 429 stops navigation and preserves repo intent
    const doc3 = createPricingDom();
    const storage3 = makeStorage();
    (globalThis as any).document = doc3;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage3, configurable: true, writable: true });
    (globalThis as any).location = { origin: 'https://decapodlabs.ai', pathname: '/pricing', search: '?repo=DecapodLabs%2Fdecapod', hash: '', assign: (u: string) => navigations.push(u) };
    let callCount = 0;
    const realDateNow = Date.now;
    let fakeNow = 1795490000000;
    Date.now = () => fakeNow;
    try {
      (globalThis as any).fetch = () => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(new Response(JSON.stringify({
            version: 1,
            project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
            publishable_key: 'sb_publishable_test',
            auth_providers: { github: true, google: false, gitlab: false },
            live_sale_enabled: true,
            billing_enabled: true,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('rate limited', { status: 429, headers: { 'retry-after': '15', 'x-request-id': 'req_stale_429' } }));
      };
      new Function(pricingSource)();
      await new Promise(r => setTimeout(r, 15));
      assertEq(doc3.getElementById('cloud-pay-cta')!.disabled, false, 'CTA initially enabled when live_sale_enabled=true');
      fakeNow += 400_000; // Advance >300s so discoveredAt becomes stale
      doc3.getElementById('cloud-pay-cta')!.click();
      await new Promise(r => setTimeout(r, 20));
      assertEq(navigations.length, 0, 'Stale readiness failing re-probe blocks navigation');
      assertEq(doc3.getElementById('cloud-pay-cta')!.disabled, true, 'CTA locked after failed stale re-probe');
      assertEq(storage3.getItem('decapod:pending-repo-intent'), 'DecapodLabs/decapod', 'Repo intent preserved');
      assert(doc3.getElementById('pricing-repo-note')!.textContent.includes('req_stale_429'), 'Correlation ref displayed on stale re-probe failure');
    } finally {
      Date.now = realDateNow;
    }
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }
});

Deno.test('#71 Signup handles 5xx/timeout, 429 Retry-After, 403 denied, provider outage, malformed config, and lost checkout ack safely', async () => {
  const now = Math.floor(Date.now() / 1000);
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgId = '20000000-0000-4000-8000-000000000002';

  // 1. Malformed config on discovery fails closed with zero session calls
  {
    const doc = createSignupDom();
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: makeStorage(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      fetch: () => Promise.resolve(new Response('not-json', { status: 200, headers: { 'x-request-id': 'req_sig_bad' } })),
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().authenticated, false, 'malformed config stays unauthenticated');
    assert(doc.getElementById('signup-status')!.textContent.includes('malformed config'), 'malformed config explained');
    assert(doc.getElementById('signup-status')!.textContent.includes('req_sig_bad'), 'correlation ref shown');
  }

  // 2. Backend 503 HTML page during authenticated load shows SERVICE UNAVAILABLE + retry + correlation ref, no ready state
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-ok', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: () => Promise.resolve(new Response('<html>503 Service Unavailable</html>', { status: 503, headers: { 'x-request-id': 'req_edge_503' } })),
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().backendAuthorized, false, 'no false ready state on 503');
    assertEq(doc.getElementById('step-ready')!.hidden, true, 'ready panel hidden on 503');
    assertEq(doc.getElementById('step-state')!.hidden, false, 'actionable state panel shown on 503');
    assertEq(doc.getElementById('state-kicker')!.textContent, 'SERVICE UNAVAILABLE', 'service unavailable kicker');
    assertEq(doc.getElementById('state-retry-btn')!.hidden, false, 'retry button shown');
    assert(doc.getElementById('state-detail')!.textContent.includes('req_edge_503'), 'correlation ref surfaced');
  }

  // 3. Lost checkout acknowledgement (504 network timeout + 429 Retry-After) keeps request_id & warns against duplicate payment
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-ok', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
    }));
    let checkoutMode: 'timeout' | 'rate_limit' = 'timeout';
    const seenCheckoutReqIds: string[] = [];
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId, status: 'active',
            organizations: [{ id: 'DecapodLabs', cloud_org_id: orgId, admin: true }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'entitlement_required', backend_authorized: false, organization_id: orgId }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-quote')) {
          return Promise.resolve(new Response(JSON.stringify({
            order_id: 'ord_lost_ack_1', quote_id: 'quo_lost_ack_1', amount: 2500, quantity: 1, cadence: 'month',
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-checkout')) {
          seenCheckoutReqIds.push(body.request_id);
          if (checkoutMode === 'timeout') {
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            return Promise.reject(err);
          }
          return Promise.resolve(new Response(JSON.stringify({ error: { code: 'rate_limited' } }), {
            status: 429,
            headers: { 'retry-after': '9', 'x-request-id': 'req_chk_429' },
          }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    await ctrl.requestQuote();
    await ctrl.startCheckout();
    assert(doc.getElementById('signup-status')!.textContent.includes('Do not submit a duplicate payment'), 'lost checkout ack warns against duplicate payment');
    assert(doc.getElementById('signup-status')!.textContent.includes(seenCheckoutReqIds[0]), 'correlation ref includes stable checkout request_id');

    checkoutMode = 'rate_limit';
    await ctrl.startCheckout();
    assertEq(seenCheckoutReqIds[0], seenCheckoutReqIds[1], '429 retry reuses identical idempotency request_id');
    assert(doc.getElementById('signup-status')!.textContent.includes('Wait 9s'), '429 Retry-After wait shown');
    assert(doc.getElementById('signup-status')!.textContent.includes('req_chk_429'), '429 server correlation ref shown');
  }

  // 4. 403 access_denied during checkout-returned status check stops immediately (no polling loop)
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-ok', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
    }));
    let statusCalls = 0;
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod&checkout=returned' },
      history: { replaceState: () => {} },
      sleepFn: () => Promise.resolve(),
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId, status: 'active',
            organizations: [{ id: 'DecapodLabs', cloud_org_id: orgId, admin: true }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          statusCalls++;
          return Promise.resolve(new Response(JSON.stringify({ error: { code: 'forbidden' } }), {
            status: 403,
            headers: { 'x-request-id': 'req_403_deny' },
          }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(statusCalls, 1, '403 stops immediately without polling');
    assertEq(doc.getElementById('state-kicker')!.textContent, 'ACCESS DENIED', '403 shows ACCESS DENIED');
    assert(doc.getElementById('state-detail')!.textContent.includes('req_403_deny'), '403 shows correlation ref');
  }
});

Deno.test('#71 Admin handles 503 unavailable, 429 Retry-After, 401/403 revocation, and malformed config without false denial or access', async () => {
  const now = Math.floor(Date.now() / 1000);
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgId = '20000000-0000-4000-8000-000000000002';

  // 1. 503 on organization verification shows SERVICE UNAVAILABLE (not false AUTHORIZATION DENIED) & hides workspace
  for (const mode of ['503', '429'] as const) {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-admin', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
    }));
    let registerCalls = 0;
    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          registerCalls++;
          if (registerCalls === 1) {
            return Promise.resolve(new Response(JSON.stringify({
              account_id: accountId, status: 'active',
              organizations: [{ id: 'DecapodLabs', cloud_org_id: orgId, scm_owner_slug: 'DecapodLabs', admin: true }],
              projects: [],
            }), { status: 200 }));
          }
          return mode === '503'
            ? Promise.resolve(new Response('backend paused', { status: 503, headers: { 'x-request-id': 'req_adm_503' } }))
            : Promise.resolve(new Response('slow down', { status: 429, headers: { 'retry-after': '11', 'x-request-id': 'req_adm_429' } }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, `workspace hidden on ${mode}`);
    assertEq(doc.getElementById('admin-denied-panel')!.hidden, false, `denied/status panel shown on ${mode}`);
    if (mode === '503') {
      assertEq(doc.getElementById('admin-denied-kicker')!.textContent, 'SERVICE UNAVAILABLE', '503 shows SERVICE UNAVAILABLE');
      assert(doc.getElementById('admin-denied-detail')!.textContent.includes('req_adm_503'), '503 shows correlation ref');
    } else {
      assertEq(doc.getElementById('admin-denied-kicker')!.textContent, 'RATE LIMITED (429)', '429 shows RATE LIMITED');
      assert(doc.getElementById('admin-status')!.textContent.includes('Wait 11s'), '429 shows Retry-After');
      assert(doc.getElementById('admin-denied-detail')!.textContent.includes('req_adm_429'), '429 shows correlation ref');
    }
  }
});

Deno.test('#71 Synthetic readiness probe separates static web, auth/API, Pages Admin, and billing posture cleanly under healthy and degraded mocks', async () => {
  const validHtml = (extra = '') =>
    `<!doctype html><html lang="en"><head><meta name="referrer" content="no-referrer"><meta name="decapod-flow-contract" content="1"><meta name="decapod-asset-release" content="20261124-p3">${extra}<script src="/cloud-flow.js"></script></head><body><section id="proofs">UNDER WRAPS</section></body></html>`;

  // 1. Healthy mock -> overall healthy, zero paid traffic, under_wraps_disabled
  const healthyReport = await runSyntheticReadiness({
    nowMs: () => 100,
    fetchFn: ((input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://decapodlabs.ai/' || url.startsWith('https://decapodlabs.ai/pricing/')) {
        return Promise.resolve(new Response(validHtml(), { status: 200 }));
      }
      if (url.startsWith('https://decapodlabs.ai/signup/') || url.startsWith('https://decapodlabs.ai/admin/')) {
        return Promise.resolve(new Response(validHtml('<meta name="robots" content="noindex,nofollow">'), { status: 200 }));
      }
      if (url === 'https://api.decapodlabs.ai/auth/providers') {
        return Promise.resolve(new Response(JSON.stringify({ version: 1, auth_providers: { github: true, google: false } }), {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'decapod-cloud-contract-version': '1.0',
            'referrer-policy': 'no-referrer',
            'x-content-type-options': 'nosniff',
            'cf-ray': 'ray_prov_1',
          },
        }));
      }
      if (url.startsWith('https://api.decapodlabs.ai/functions/v1/decapod-onboarding/config')) {
        return Promise.resolve(new Response(JSON.stringify({
          version: 1,
          project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
          publishable_key: 'sb_publishable_test',
          live_sale_enabled: false,
          billing_enabled: false,
        }), {
          status: 200,
          headers: { 'cache-control': 'no-store', 'decapod-cloud-contract-version': '1.0', 'x-request-id': 'req_cfg_1' },
        }));
      }
      if (url === 'https://decapod-cloud-admin.pages.dev/') {
        return Promise.resolve(new Response('<html>admin</html>', {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'; connect-src https://goyxpcmxetztjlrrcwew.supabase.co",
          },
        }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as typeof fetch,
  });
  assertEq(healthyReport.overall_status, 'healthy', 'healthy synthetic report');
  assertEq(healthyReport.paid_traffic_generated, false, 'zero paid traffic');
  assertEq(healthyReport.credentials_stored, false, 'zero credentials stored');
  assertEq(healthyReport.planes.billing_entitlement_posture.posture, 'under_wraps_disabled', 'under wraps billing posture');

  // 2. Plane isolation: /auth/providers 503 marks api_auth_discovery unavailable while github_pages_web & cloudflare_pages_admin remain healthy
  const partialOutage = await runSyntheticReadiness({
    nowMs: () => 100,
    fetchFn: ((input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://api.decapodlabs.ai/auth/providers') {
        return Promise.resolve(new Response('paused', { status: 503, headers: { 'cf-ray': 'ray_outage_503' } }));
      }
      if (url === 'https://decapodlabs.ai/' || url.startsWith('https://decapodlabs.ai/pricing/')) {
        return Promise.resolve(new Response(validHtml(), { status: 200 }));
      }
      if (url.startsWith('https://decapodlabs.ai/signup/') || url.startsWith('https://decapodlabs.ai/admin/')) {
        return Promise.resolve(new Response(validHtml('<meta name="robots" content="noindex,nofollow">'), { status: 200 }));
      }
      if (url.startsWith('https://api.decapodlabs.ai/functions/v1/decapod-onboarding/config')) {
        return Promise.resolve(new Response(JSON.stringify({
          version: 1,
          project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
          publishable_key: 'sb_publishable_test',
          live_sale_enabled: false,
          billing_enabled: false,
        }), { status: 200, headers: { 'cache-control': 'no-store', 'decapod-cloud-contract-version': '1.0' } }));
      }
      if (url === 'https://decapod-cloud-admin.pages.dev/') {
        return Promise.resolve(new Response('<html>admin</html>', {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'; connect-src https://goyxpcmxetztjlrrcwew.supabase.co",
          },
        }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }) as typeof fetch,
  });
  assertEq(partialOutage.planes.github_pages_web.status, 'healthy', 'static web stays healthy');
  assertEq(partialOutage.planes.cloudflare_pages_admin.status, 'healthy', 'pages admin stays healthy');
  assertEq(partialOutage.planes.api_auth_discovery.status, 'unavailable', 'api_auth_discovery isolated as unavailable');
  assertEq(partialOutage.overall_status, 'unavailable', 'overall status reflects api outage');
});

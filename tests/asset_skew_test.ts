// Offline tests for Phase 1 Issue #70:
// Browser asset release coherence, HTML/JS skew, API contract skew,
// discovery staleness, deep-link scrubbing, multi-tab skew, and trusted origin pinning.
import '../cloud-flow.js';
import '../signup/signup.js';
import '../admin/admin.js';

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('assertion_failed: ' + msg);
};
const assertEq = (actual: unknown, expected: unknown, msg: string) => {
  if (actual !== expected) {
    throw new Error(`assertion_failed (${msg}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
  style = {
    props: new Map<string, string>(),
    setProperty(k: string, v: string) { this.props.set(k, v); }
  };
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

  constructor(tag = 'div', id = '') {
    this.tagName = tag;
    this.id = id;
  }
  get textContent(): string {
    return this._text + this.children.map(c => c.textContent).join('');
  }
  set textContent(val: string) {
    this._text = String(val);
    this.children = [];
  }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  appendChild(child: MockElement) { this.children.push(child); return child; }
  replaceChildren(...nodes: MockElement[]) {
    this._text = '';
    this.children = [...nodes];
  }
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
  register(el: MockElement) {
    if (el.id) this.elements.set(el.id, el);
    return el;
  }
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

function createMockBroadcastBus() {
  const channels = new Set<any>();
  const sentMessages: any[] = [];
  class MockBroadcastChannel {
    name: string;
    onmessage: ((ev: { data: any }) => void) | null = null;
    closed = false;
    constructor(name: string) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data: any) {
      if (this.closed) return;
      sentMessages.push(data);
      for (const peer of channels) {
        if (peer !== this && !peer.closed && peer.name === this.name && typeof peer.onmessage === 'function') {
          peer.onmessage({ data });
        }
      }
    }
    close() {
      this.closed = true;
      channels.delete(this);
    }
  }
  return { MockBroadcastChannel, sentMessages };
}

function createPricingDom(omitIds: string[] = []) {
  const doc = new MockDocument();
  const skip = new Set(omitIds);
  const reg = (tag: string, id: string) => {
    if (skip.has(id)) return null;
    return doc.register(new MockElement(tag, id));
  };
  const repoInput = reg('input', 'repo-count');
  if (repoInput) { repoInput.value = '2'; repoInput.min = '1'; repoInput.max = '10'; }
  const seatInput = reg('input', 'seat-count');
  if (seatInput) { seatInput.value = '5'; seatInput.min = '1'; seatInput.max = '25'; }
  const cloudBtn = reg('button', 'cloud-pay-cta');
  if (cloudBtn) cloudBtn.disabled = true;
  const previewBtn = reg('button', 'preview-checkout');
  if (previewBtn) previewBtn.disabled = true;
  const banner = reg('div', 'pricing-repo-banner');
  if (banner) banner.hidden = true;
  reg('strong', 'pricing-repo-slug');
  reg('span', 'pricing-repo-note');
  reg('div', 'annual-savings');
  for (const id of ['repo-count-value', 'seat-count-value', 'assignment-count', 'assignment-formula', 'repo-discount', 'contributor-discount', 'combined-discount', 'annual-volume', 'annual-discount']) {
    reg('span', id);
  }
  return doc;
}

function createSignupDom(omitIds: string[] = []) {
  const doc = new MockDocument();
  const skip = new Set(omitIds);
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
    'step-ready', 'ready-summary', 'ready-another-btn'
  ];
  for (const id of ids) {
    if (skip.has(id)) continue;
    const tag = id.endsWith('-select') ? 'select' : id.endsWith('-btn') ? 'button' : 'div';
    doc.register(new MockElement(tag, id));
  }
  if (doc.getElementById('billing-cadence')) doc.getElementById('billing-cadence')!.value = 'month';
  if (doc.getElementById('seat-quantity')) doc.getElementById('seat-quantity')!.value = '1';
  return doc;
}

function createAdminDom(omitIds: string[] = []) {
  const doc = new MockDocument();
  const skip = new Set(omitIds);
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
    if (skip.has(id)) continue;
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

Deno.test('HTML entrypoints share coherent asset release tags, contract metadata, and zero persistent-cache/SW code', async () => {
  const release = flow.ASSET_RELEASE;
  assert(typeof release === 'string' && release.length > 0, 'ASSET_RELEASE defined');
  assertEq(flow.CONTRACT_VERSION, 1, 'CONTRACT_VERSION is 1');

  const docs: [string, string[]][] = [
    ['pricing.html', [`cloud-flow.js?v=${release}`, `pricing.js?v=${release}`]],
    ['pricing/index.html', [`/cloud-flow.js?v=${release}`, `/pricing.js?v=${release}`]],
    ['signup/index.html', [`/cloud-flow.js?v=${release}`, `/signup/signup.js?v=${release}`]],
    ['admin/index.html', [`/cloud-flow.js?v=${release}`, `/admin/admin.js?v=${release}`]],
  ];

  for (const [path, scripts] of docs) {
    const html = await Deno.readTextFile(path);
    assert(html.includes('<meta name="decapod-flow-contract" content="1">'), 'contract meta in ' + path);
    assert(html.includes(`<meta name="decapod-asset-release" content="${release}">`), 'release meta in ' + path);
    assert(html.includes('<meta name="referrer" content="no-referrer">'), 'no-referrer meta in ' + path);
    for (const scriptSrc of scripts) {
      assert(html.includes(`src="${scriptSrc}"`), `coherent script ${scriptSrc} in ${path}`);
    }
  }

  for (const jsPath of ['cloud-flow.js', 'pricing.js', 'signup/signup.js', 'admin/admin.js']) {
    const src = await Deno.readTextFile(jsPath);
    assert(!/\blocalStorage\b/.test(src), 'zero localStorage usage in ' + jsPath);
    assert(!/\bserviceWorker\b/.test(src), 'zero serviceWorker registration in ' + jsPath);
    assert(!/\bcaches\b/.test(src), 'zero CacheStorage usage in ' + jsPath);
  }
});

Deno.test('Old HTML / New JS: compatible legacy HTML progresses safely while missing DOM anchors or unsupported contract meta fail closed', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');

  // 1. Legacy HTML (no decapod-flow-contract meta, all DOM IDs present) progresses cleanly
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      fetch: () => Promise.resolve(new Response('{}', { status: 500 })),
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, false, 'legacy signup HTML compatible');
    assertEq(doc.getElementById('auth-github')!.disabled, false, 'GitHub auth button active in compatible legacy HTML');
  }

  // 2. HTML with unsupported contract version ("2") fails closed on Pricing, Signup, and Admin with zero fetch calls
  {
    const doc = createPricingDom();
    doc.setMeta('decapod-flow-contract', '2');
    let fetchCalls = 0;
    const prev = {
      document: (globalThis as any).document,
      location: (globalThis as any).location,
      sessionStorage: (globalThis as any).sessionStorage,
      history: (globalThis as any).history,
      fetch: (globalThis as any).fetch,
    };
    try {
      (globalThis as any).document = doc;
      (globalThis as any).sessionStorage = makeStorage();
      (globalThis as any).history = { replaceState: () => {} };
      (globalThis as any).location = { origin: 'https://decapodlabs.ai', pathname: '/pricing', search: '?repo=DecapodLabs%2Fdecapod', hash: '' };
      (globalThis as any).fetch = () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); };
      new Function(pricingSource)();
      await new Promise(r => setTimeout(r, 10));
      assertEq(fetchCalls, 0, 'Pricing with unsupported HTML contract makes zero fetch calls');
      assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pricing CTA stays disabled on HTML contract mismatch');
      assertEq(doc.getElementById('preview-checkout')!.disabled, true, 'Pricing preview CTA stays disabled on HTML contract mismatch');
    } finally {
      Object.assign(globalThis, prev);
    }
  }

  {
    const doc = createSignupDom();
    doc.setMeta('decapod-flow-contract', '2');
    const storage = makeStorage();
    const scrubbed: string[] = [];
    let fetchCalls = 0;
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/signup', search: '?repo=DecapodLabs%2Fdecapod', hash: '#access_token=bad', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod#access_token=bad' },
      history: { replaceState: (_s: any, _t: string, u: string) => scrubbed.push(u) },
      fetch: () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, true, 'Signup fails closed on HTML contract=2');
    assertEq(fetchCalls, 0, 'Signup makes zero API calls on HTML skew');
    assertEq(doc.getElementById('auth-github')!.disabled, true, 'Signup auth disabled on HTML skew');
    assertEq(doc.getElementById('checkout-btn')!.disabled, true, 'Signup checkout disabled on HTML skew');
    assertEq(scrubbed[0], '/signup', 'Signup still scrubs URL params on HTML skew');
  }

  // 3. Old skewed HTML missing required security DOM anchor (#checkout-btn / #admin-workspace) fails closed
  {
    const doc = createSignupDom(['checkout-btn']);
    let fetchCalls = 0;
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: makeStorage(),
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/signup', search: '', hash: '', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      fetch: () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, true, 'Signup fails closed when required DOM anchor missing');
    assertEq(fetchCalls, 0, 'Signup makes zero API calls when DOM anchor missing');
  }

  {
    const doc = createAdminDom(['admin-workspace']);
    let fetchCalls = 0;
    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: makeStorage(),
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
      history: { replaceState: () => {} },
      fetch: () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, true, 'Admin fails closed when required DOM anchor missing');
    assertEq(fetchCalls, 0, 'Admin makes zero API calls when DOM anchor missing');
    assertEq(doc.getElementById('admin-auth-github')!.disabled, true, 'Admin auth disabled when DOM anchor missing');
  }
});

Deno.test('New HTML / Old JS: missing CONTRACT_VERSION, missing methods, or breaking v2 flow fails closed across Pricing, Signup, and Admin', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');
  // Simulate pre-hardening cloud-flow.js lacking CONTRACT_VERSION and new coherence helpers
  const oldFlow: Record<string, unknown> = { ...flow };
  delete oldFlow.CONTRACT_VERSION;
  delete oldFlow.checkPageCoherence;

  // 1. Pricing with old DecapodCloudFlow stays disabled, scrubs URL, and makes zero fetch calls
  {
    const doc = createPricingDom();
    doc.setMeta('decapod-flow-contract', '1');
    const scrubbed: string[] = [];
    let fetchCalls = 0;
    const prev = {
      DecapodCloudFlow: (globalThis as any).DecapodCloudFlow,
      document: (globalThis as any).document,
      location: (globalThis as any).location,
      sessionStorage: (globalThis as any).sessionStorage,
      history: (globalThis as any).history,
      fetch: (globalThis as any).fetch,
    };
    try {
      (globalThis as any).DecapodCloudFlow = oldFlow;
      (globalThis as any).document = doc;
      (globalThis as any).sessionStorage = makeStorage();
      (globalThis as any).history = { replaceState: (_s: any, _t: string, u: string) => scrubbed.push(u) };
      (globalThis as any).location = {
        origin: 'https://decapodlabs.ai',
        pathname: '/pricing',
        search: '?repo=DecapodLabs%2Fdecapod',
        hash: '#access_token=bad',
      };
      (globalThis as any).fetch = () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); };

      new Function(pricingSource)();
      await new Promise(r => setTimeout(r, 10));
      assertEq(fetchCalls, 0, 'Pricing with old cloud-flow.js makes zero fetch calls');
      assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pricing CTA stays disabled on old cloud-flow.js');
      assertEq(scrubbed[0], '/pricing', 'Pricing still scrubs repo & hostile hash on old cloud-flow.js');
    } finally {
      Object.assign(globalThis, prev);
    }
  }

  // 2. Signup with old flow or breaking v2 flow fails closed
  for (const skewedFlow of [oldFlow, { ...flow, CONTRACT_VERSION: 2 }, null]) {
    const doc = createSignupDom();
    doc.setMeta('decapod-flow-contract', '1');
    const scrubbed: string[] = [];
    let fetchCalls = 0;
    const ctrl = signupApp.createSignupController({
      flow: skewedFlow,
      document: doc,
      sessionStorage: makeStorage(),
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/signup', search: '?code=abc', hash: '', href: 'https://decapodlabs.ai/signup?code=abc' },
      history: { replaceState: (_s: any, _t: string, u: string) => scrubbed.push(u) },
      fetch: () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, true, 'Signup fails closed on skewed flow');
    assertEq(ctrl.getState().authenticated, false, 'Signup never authenticates on skewed flow');
    assertEq(fetchCalls, 0, 'Signup makes zero API calls on skewed flow');
    assertEq(doc.getElementById('auth-github')!.disabled, true, 'Signup GitHub auth disabled');
    assertEq(doc.getElementById('checkout-btn')!.disabled, true, 'Signup checkout disabled');
    assertEq(scrubbed[0], '/signup', 'Signup scrubs callback query on skewed flow');
  }

  // 3. Admin with old flow or null flow fails closed
  for (const skewedFlow of [oldFlow, { ...flow, CONTRACT_VERSION: 2 }, null]) {
    const doc = createAdminDom();
    doc.setMeta('decapod-flow-contract', '1');
    const scrubbed: string[] = [];
    let fetchCalls = 0;
    const ctrl = adminApp.createAdminController({
      flow: skewedFlow,
      document: doc,
      sessionStorage: makeStorage(),
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', pathname: '/admin/DecapodLabs', search: '?code=abc', hash: '', href: 'https://decapodlabs.ai/admin/DecapodLabs?code=abc' },
      history: { replaceState: (_s: any, _t: string, u: string) => scrubbed.push(u) },
      fetch: () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().skewBlocked, true, 'Admin fails closed on skewed flow');
    assertEq(ctrl.getState().authenticated, false, 'Admin never authenticates on skewed flow');
    assertEq(fetchCalls, 0, 'Admin makes zero API calls on skewed flow');
    assertEq(doc.getElementById('admin-auth-github')!.disabled, true, 'Admin GitHub auth disabled');
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'Admin workspace locked');
    assertEq(scrubbed[0], '/admin/', 'Admin scrubs URL on skewed flow');
  }
});

Deno.test('Discovery & API skew: cache:no-store enforced, /auth/providers skew reconciled conservatively, and v2 contract refuses silent fallback', async () => {
  // 1. Stale /config says google:true while /auth/providers says google:false -> reconciled conservatively
  const seenInits: { url: string; cache?: string; credentials?: string; redirect?: string }[] = [];
  const reconciled = await flow.discoverRuntimeConfig((url: string, init: RequestInit) => {
    seenInits.push({ url, cache: init.cache, credentials: init.credentials, redirect: init.redirect });
    if (url.includes('/functions/v1/decapod-onboarding/config')) {
      return Promise.resolve(new Response(JSON.stringify({
        version: 1,
        schema: 'dactyl_api',
        project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
        publishable_key: 'sb_publishable_test',
        auth_providers: { github: true, google: true, gitlab: false },
      }), { status: 200, headers: { 'decapod-cloud-contract-version': '1.0' } }));
    }
    if (url.endsWith('/auth/providers')) {
      return Promise.resolve(new Response(JSON.stringify({
        version: 1,
        auth_providers: { github: true, google: false, gitlab: false },
      }), { status: 200, headers: { 'decapod-cloud-contract-version': '1.0' } }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  assert(reconciled !== null, 'reconciled discovery succeeds');
  assertEq(reconciled.authProviders.github, true, 'github remains enabled when both agree');
  assertEq(reconciled.authProviders.google, false, 'stale config google=true overridden conservatively by /auth/providers google=false');
  assert(seenInits.length === 2 && seenInits.every(x => x.cache === 'no-store' && x.credentials === 'omit' && x.redirect === 'error'), 'discovery enforces cache:no-store, credentials:omit, redirect:error');

  // 2. Contract version 2.0 header on api.decapodlabs.ai refuses silent fallback to supabase.co
  let fallbackCalled = false;
  const headerMismatch = await flow.discoverRuntimeConfig((url: string) => {
    if (url.startsWith('https://goyxpcmxetztjlrrcwew.supabase.co/')) fallbackCalled = true;
    return Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
      publishable_key: 'sb_publishable_test',
    }), { status: 200, headers: { 'decapod-cloud-contract-version': '2.0' } }));
  });
  assertEq(headerMismatch, null, 'rejects 2.0 contract header');
  assertEq(fallbackCalled, false, 'does NOT silently fall back to supabase.co on contract mismatch');

  // 3. Payload version: 2 on /config refuses silent fallback
  fallbackCalled = false;
  const payloadMismatch = await flow.discoverRuntimeConfig((url: string) => {
    if (url.startsWith('https://goyxpcmxetztjlrrcwew.supabase.co/')) fallbackCalled = true;
    return Promise.resolve(new Response(JSON.stringify({
      version: 2,
      project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
      publishable_key: 'sb_publishable_test',
    }), { status: 200 }));
  });
  assertEq(payloadMismatch, null, 'rejects payload version 2');
  assertEq(fallbackCalled, false, 'does NOT silently fall back on payload version 2');

  // 4. Mid-session API contract 2.0 header on Admin invalidates session and locks workspace
  const now = Math.floor(Date.now() / 1000);
  const doc = createAdminDom();
  const storage = makeStorage();
  storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-ok',
    expires_at: now + 3600,
    origin: TEST_PROFILE.projectOrigin,
    contract_version: 1,
  }));
  const fetchCaches: (string | undefined)[] = [];
  const ctrl = adminApp.createAdminController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
    history: { replaceState: () => {} },
    fetch: (_input: string, init: RequestInit) => {
      fetchCaches.push(init.cache);
      return Promise.resolve(new Response(JSON.stringify({ id: '10000000-0000-4000-8000-000000000001', identities: [] }), {
        status: 200,
        headers: { 'decapod-cloud-contract-version': '2.0' },
      }));
    },
    navigateFn: () => {},
  });
  await ctrl.init();
  assertEq(fetchCaches[0], 'no-store', 'apiRequest enforces cache: no-store');
  assertEq(ctrl.getState().skewBlocked, true, 'mid-session API contract 2.0 sets skewBlocked');
  assertEq(ctrl.getState().authenticated, false, 'mid-session API contract 2.0 invalidates session');
  assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace stays hidden on API contract skew');
});

Deno.test('Multi-tab version skew and cross-tab sign-out via BroadcastChannel without persistent cache', async () => {
  const { MockBroadcastChannel, sentMessages } = createMockBroadcastBus();
  const now = Math.floor(Date.now() / 1000);
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgUuid = '20000000-0000-4000-8000-000000000002';

  const makeAdminFetch = () => (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') {
      return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
    }
    if (url.pathname.endsWith('/account-register')) {
      return Promise.resolve(new Response(JSON.stringify({
        account_id: accountId,
        status: 'registered',
        organizations: [{ id: 'org:a', cloud_org_id: orgUuid, scm_provider: 'github', scm_owner_slug: 'OrgA', admin: true }],
        projects: [],
      }), { status: 200 }));
    }
    if (url.pathname.endsWith('/device-keys')) {
      return Promise.resolve(new Response(JSON.stringify({ version: 1, status: 'keys', account_id: accountId, device_keys: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  };

  // Tab 1 and Tab 2 both authenticated on Admin
  const doc1 = createAdminDom();
  const storage1 = makeStorage();
  storage1.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-tab-1', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
  }));
  const ctrl1 = adminApp.createAdminController({
    document: doc1,
    sessionStorage: storage1,
    broadcastChannel: MockBroadcastChannel,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
    history: { replaceState: () => {} },
    fetch: makeAdminFetch(),
    navigateFn: () => {},
  });

  const doc2 = createAdminDom();
  const storage2 = makeStorage();
  storage2.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-tab-2', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
  }));
  const ctrl2 = adminApp.createAdminController({
    document: doc2,
    sessionStorage: storage2,
    broadcastChannel: MockBroadcastChannel,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
    history: { replaceState: () => {} },
    fetch: makeAdminFetch(),
    navigateFn: () => {},
  });

  await ctrl1.init();
  await ctrl2.init();
  assertEq(ctrl1.getState().authenticated, true, 'Tab 1 authenticated');
  assertEq(ctrl2.getState().authenticated, true, 'Tab 2 authenticated');

  // Sign out in Tab 1 -> Tab 2 immediately deauthorizes without transmitting tokens or PII
  ctrl1.signOut();
  assertEq(ctrl1.getState().authenticated, false, 'Tab 1 signed out');
  assertEq(ctrl2.getState().authenticated, false, 'Tab 2 deauthorized by cross-tab broadcast');
  assertEq(doc2.getElementById('admin-workspace')!.hidden, true, 'Tab 2 workspace locked immediately');
  for (const msg of sentMessages) {
    const serialized = JSON.stringify(msg);
    assert(!serialized.includes('jwt-tab'), 'no JWT leaked in BroadcastChannel message');
    assert(!serialized.includes(accountId), 'no account ID leaked in BroadcastChannel message');
  }

  // Tab 3 announces breaking v2 release -> locks Signup controller immediately
  const sDoc = createSignupDom();
  const sStorage = makeStorage();
  sStorage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-signup', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin, contract_version: 1,
  }));
  const sCtrl = signupApp.createSignupController({
    document: sDoc,
    sessionStorage: sStorage,
    broadcastChannel: MockBroadcastChannel,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', pathname: '/signup', search: '', hash: '', href: 'https://decapodlabs.ai/signup' },
    history: { replaceState: () => {} },
    fetch: (input: string) => {
      const url = new URL(input);
      if (url.pathname === '/auth/v1/user') {
        return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ account_id: accountId, status: 'registered', organizations: [], projects: [] }), { status: 200 }));
    },
    navigateFn: () => {},
  });
  await sCtrl.init();
  assertEq(sCtrl.getState().authenticated, true, 'Signup tab initially authenticated');

  const v2Peer = new MockBroadcastChannel('decapod-cloud-coherence');
  v2Peer.postMessage({ tabId: 'tab-v2', type: 'tab_hello', contractVersion: 2, assetRelease: '20261201-v2' });
  assertEq(sCtrl.getState().skewBlocked, true, 'Signup tab locks on sibling v2 tab announcement');
  assertEq(sCtrl.getState().authenticated, false, 'Signup tab clears session on breaking skew');
  assertEq(sDoc.getElementById('auth-github')!.disabled, true, 'Signup auth disabled on multi-tab skew');

  ctrl1.close();
  ctrl2.close();
  sCtrl.close();
  v2Peer.close();
});

Deno.test('Deep links (?repo= scrubbing on /pricing, token/session hygiene) leave zero tokens/secrets/PII in URL or persistent cache', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');
  const prevStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const prev = {
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    history: (globalThis as any).history,
    fetch: (globalThis as any).fetch,
  };

  // 1. Valid ?repo= with harmless #preview-heading scrubs ?repo= via replaceState and survives async discovery
  try {
    const doc = createPricingDom();
    const storage = makeStorage();
    const scrubbed: string[] = [];
    const navigations: string[] = [];
    (globalThis as any).document = doc;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
    (globalThis as any).history = {
      replaceState: (_s: any, _t: string, url: string) => {
        scrubbed.push(url);
        const parsed = new URL(url, 'https://decapodlabs.ai');
        (globalThis as any).location.pathname = parsed.pathname;
        (globalThis as any).location.search = parsed.search;
        (globalThis as any).location.hash = parsed.hash;
      },
    };
    (globalThis as any).location = {
      origin: 'https://decapodlabs.ai',
      pathname: '/pricing/',
      search: '?repo=DecapodLabs%2Fdecapod&utm_source=docs',
      hash: '#preview-heading',
      assign: (u: string) => navigations.push(u),
    };
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
      publishable_key: 'sb_publishable_test',
      auth_providers: { github: true, google: false, gitlab: false },
      live_sale_enabled: true,
      billing_enabled: true,
    }), { status: 200 }));

    new Function(pricingSource)();
    assertEq(scrubbed[0], '/pricing/?utm_source=docs#preview-heading', 'scrubs ?repo= while preserving safe query & anchor');
    await new Promise(r => setTimeout(r, 15));
    assertEq(doc.getElementById('pricing-repo-banner')!.hidden, false, 'banner remains visible after discovery resolves');
    assertEq(doc.getElementById('pricing-repo-slug')!.textContent, 'Target repository intent: DecapodLabs/decapod', 'validatedRepoSlug preserved after replaceState scrub');
    assertEq(storage.getItem('decapod:pending-repo-intent'), 'DecapodLabs/decapod', 'repo intent retained in per-tab sessionStorage');

    // Clicking Pay hands off with repo=DecapodLabs/decapod in return_to/signup URL
    doc.getElementById('cloud-pay-cta')!.click();
    await new Promise(r => setTimeout(r, 10));
    assertEq(navigations.length, 1, 'Pay click navigates via /auth');
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }

  // 2. Hostile fragment tokens on /pricing are scrubbed and suppress repo intent
  try {
    const doc = createPricingDom();
    const storage = makeStorage();
    const scrubbed: string[] = [];
    (globalThis as any).document = doc;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
    (globalThis as any).history = { replaceState: (_s: any, _t: string, url: string) => scrubbed.push(url) };
    (globalThis as any).location = {
      origin: 'https://decapodlabs.ai',
      pathname: '/pricing',
      search: '?repo=DecapodLabs%2Fdecapod',
      hash: '#access_token=secret123&provider_token=gho_secret',
    };
    (globalThis as any).fetch = () => Promise.resolve(new Response('{}', { status: 503 }));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 10));
    assertEq(scrubbed[0], '/pricing', 'hostile fragment and ?repo= scrubbed completely');
    assertEq(storage.getItem('decapod:pending-repo-intent'), null, 'pending-repo-intent cleared when hostile token present');
    assertEq(doc.getElementById('pricing-repo-slug')!.textContent, 'Hostile URL token parameter ignored', 'safe banner rejects hostile URL token');
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }

  // 3. Session record with mismatched contract_version is rejected by validateSessionRecord
  const now = Math.floor(Date.now() / 1000);
  assertEq(flow.validateSessionRecord({
    access_token: 'jwt-1',
    expires_at: now + 3600,
    origin: TEST_PROFILE.projectOrigin,
    contract_version: 2,
  }, TEST_PROFILE.projectOrigin, now), false, 'rejects session record with contract_version=2');
});

Deno.test('Trusted origin pinning rejects untrusted discovery, auth, initialProfile, API, and checkout origins', async () => {
  // 1. normalizeDiscoveryProfile rejects untrusted apiOrigin, authBaseUrl, project_origin, schema
  assertEq(flow.normalizeDiscoveryProfile({
    version: 1,
    project_origin: 'https://evil.example',
    publishable_key: 'sb_publishable_test',
  }, 'https://api.decapodlabs.ai', 'https://api.decapodlabs.ai/auth'), null, 'rejects untrusted project_origin');

  assertEq(flow.normalizeDiscoveryProfile({
    version: 1,
    project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
    publishable_key: 'sb_publishable_test',
  }, 'https://evil.example', 'https://api.decapodlabs.ai/auth'), null, 'rejects untrusted apiOrigin');

  assertEq(flow.normalizeDiscoveryProfile({
    version: 1,
    project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
    publishable_key: 'sb_publishable_test',
  }, 'https://api.decapodlabs.ai', 'https://evil.example/auth'), null, 'rejects untrusted authBaseUrl');

  assertEq(flow.normalizeDiscoveryProfile({
    version: 1,
    schema: 'other_api',
    project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
    publishable_key: 'sb_publishable_test',
  }, 'https://api.decapodlabs.ai', 'https://api.decapodlabs.ai/auth'), null, 'rejects unexpected schema');

  // 2. Untrusted initialProfile rejected by Signup & Admin controllers
  let calls = 0;
  const badProfile = { ...TEST_PROFILE, projectOrigin: 'https://evil.example' };
  const sCtrl = signupApp.createSignupController({
    document: createSignupDom(),
    sessionStorage: makeStorage(),
    initialProfile: badProfile,
    location: { origin: 'https://decapodlabs.ai', pathname: '/signup', search: '', hash: '', href: 'https://decapodlabs.ai/signup' },
    history: { replaceState: () => {} },
    fetch: () => { calls++; return Promise.resolve(new Response('{}', { status: 200 })); },
  });
  await sCtrl.init();
  assertEq(sCtrl.getState().skewBlocked, true, 'Signup rejects untrusted initialProfile');
  assertEq(calls, 0, 'Signup makes zero fetch calls for untrusted initialProfile');

  const aCtrl = adminApp.createAdminController({
    document: createAdminDom(),
    sessionStorage: makeStorage(),
    initialProfile: badProfile,
    location: { origin: 'https://decapodlabs.ai', pathname: '/admin/', search: '', hash: '', href: 'https://decapodlabs.ai/admin/' },
    history: { replaceState: () => {} },
    fetch: () => { calls++; return Promise.resolve(new Response('{}', { status: 200 })); },
  });
  await aCtrl.init();
  assertEq(aCtrl.getState().skewBlocked, true, 'Admin rejects untrusted initialProfile');
  assertEq(calls, 0, 'Admin makes zero fetch calls for untrusted initialProfile');

  // 3. Checkout & auth origin pins reject lookalikes
  assertEq(flow.isAllowedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_123'), true, 'allows checkout.stripe.com');
  assertEq(flow.isAllowedCheckoutUrl('https://checkout.stripe.com.attacker.tld/c/pay/cs_123'), false, 'rejects lookalike Stripe host');
  assertEq(flow.isTrustedAuthUrl('https://api.decapodlabs.ai/auth'), true, 'allows canonical auth');
  assertEq(flow.isTrustedAuthUrl('https://api.decapodlabs.ai.evil.tld/auth'), false, 'rejects lookalike auth host');
});

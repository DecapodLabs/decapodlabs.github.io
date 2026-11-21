// Offline unit tests for Website #54 (/pricing) and #56 (/signup).
// Uses classic script loading + lightweight DOM/storage/fetch mocks with zero network I/O.
import '../cloud-flow.js';
import '../signup/signup.js';

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
assert(flow && signupApp, 'browser globals exported');

// Minimal safe DOM mock that records child elements and textContent without HTML parsing.
class MockElement {
  id = '';
  tagName: string;
  children: MockElement[] = [];
  dataset: Record<string, string> = {};
  hidden = false;
  disabled = false;
  value = '';
  min = '1';
  max = '25';
  type = 'text';
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
  onclick: ((ev?: any) => void) | null = null;
  onchange: ((ev?: any) => void) | null = null;
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
    if (this.disabled) return;
    if (this.onclick) this.onclick({});
    for (const fn of this.listeners.get('click') ?? []) fn({});
  }
}

class MockDocument {
  elements = new Map<string, MockElement>();
  selectorLists = new Map<string, MockElement[]>();
  register(el: MockElement) {
    if (el.id) this.elements.set(el.id, el);
    return el;
  }
  getElementById(id: string) { return this.elements.get(id) ?? null; }
  createElement(tag: string) { return new MockElement(tag); }
  createTextNode(text: string) { const el = new MockElement('#text'); el.textContent = text; return el; }
  querySelectorAll(sel: string) { return this.selectorLists.get(sel) ?? []; }
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

function createSignupDom() {
  const doc = new MockDocument();
  const ids = [
    'signup-app', 'signup-repo-banner', 'signup-repo-banner-title', 'signup-repo-banner-note',
    'signup-status', 'account-bar', 'account-summary',
    'auth-gate', 'auth-github', 'auth-google', 'cancel-auth-btn', 'auth-provider-note',
    'step-identity', 'identity-heading', 'identity-message', 'identity-link-actions',
    'link-github-btn', 'identity-quarantine-actions', 'confirm-provider-btn', 'revoke-provider-btn',
    'step-org-repo', 'org-repo-copy', 'repo-input', 'verify-repo-btn', 'org-repo-hint',
    'step-state', 'state-kicker', 'state-heading', 'state-message', 'state-detail',
    'state-retry-btn', 'state-change-repo-btn',
    'step-checkout', 'checkout-target-label', 'billing-closed-notice', 'billing-quote-controls',
    'billing-cadence', 'seat-quantity', 'quote-btn', 'quote-summary', 'quote-amount',
    'quote-details', 'quote-commitment', 'checkout-btn', 'checkout-back-btn',
    'step-ready', 'ready-summary', 'ready-another-btn'
  ];
  for (const id of ids) {
    const tag = id.endsWith('-select') ? 'select' : id.endsWith('-btn') ? 'button' : 'div';
    doc.register(new MockElement(tag, id));
  }
  doc.getElementById('billing-cadence')!.value = 'month';
  doc.getElementById('seat-quantity')!.value = '1';
  return doc;
}

const TEST_PROFILE = {
  apiOrigin: 'https://api.decapodlabs.ai',
  onboardingPrefix: 'https://api.decapodlabs.ai/functions/v1/decapod-onboarding',
  authBaseUrl: 'https://api.decapodlabs.ai/auth',
  projectOrigin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
  publishableKey: 'sb_publishable_test_fixture',
  authProviders: { github: true, google: true, gitlab: false },
  liveSaleEnabled: true,
};

Deno.test('?repo= parsing accepts valid slugs and rejects XSS, traversal, and hostile inputs', () => {
  assertEq(flow.parseRepoSlug('DecapodLabs/decapod')?.slug, 'DecapodLabs/decapod', 'standard slug');
  assertEq(flow.parseRepoSlug('DecapodLabs/.github')?.slug, 'DecapodLabs/.github', 'dot repo');
  assertEq(flow.parseRepoSlug('my_org/my.repo-1')?.slug, 'my_org/my.repo-1', 'mixed chars');

  const decoded = flow.parseRepoSearch('?repo=DecapodLabs%2Fdecapod');
  assertEq(decoded.status, 'valid', 'encoded repo param');
  assertEq(decoded.slug, 'DecapodLabs/decapod', 'decoded repo slug');

  assertEq(flow.parseRepoSearch('').status, 'absent', 'absent repo param');

  const hostileInputs = [
    '<script>alert(1)</script>',
    'org/<img src=x onerror=alert(1)>',
    '../secret',
    'org/..',
    'org/.',
    'org/a..b',
    'org/repo/extra',
    'org/repo?redirect=https://evil.example',
    'org/repo#frag',
    'https://github.com/org/repo',
    'javascript:alert(1)',
    'org/repo%20space',
    'org/repo.git',
    '',
    'singleword',
    'a/'.repeat(120),
  ];
  for (const bad of hostileInputs) {
    assertEq(flow.parseRepoSlug(bad), null, 'reject slug: ' + bad);
    const res = flow.parseRepoSearch('?repo=' + encodeURIComponent(bad));
    assertEq(res.status, 'invalid', 'reject query repo: ' + bad);
    assertEq(res.slug, null, 'null slug on reject');
  }
  assertEq(flow.parseRepoSearch('?repo=a/b&repo=c/d').status, 'invalid', 'reject duplicate repo');
});

Deno.test('hostile return URLs, untrusted auth/checkout URLs, and URL tokens are rejected', () => {
  assertEq(
    flow.sanitizeReturnUrl('https://decapodlabs.ai/signup', 'https://decapodlabs.ai'),
    'https://decapodlabs.ai/signup',
    'same-origin https signup'
  );
  const hostileReturns = [
    'https://evil.example/signup',
    'https://decapodlabs.ai.evil.example/signup',
    'http://decapodlabs.ai/signup',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/signup',
    'https://user:pass@decapodlabs.ai/signup',
    'https://decapodlabs.ai/signup#access_token=leak',
    'https://decapodlabs.ai/admin',
  ];
  for (const bad of hostileReturns) {
    assertEq(flow.sanitizeReturnUrl(bad, 'https://decapodlabs.ai'), null, 'reject return: ' + bad);
  }
  assertEq(flow.parseSafeReturnParam('?return_to=https%3A%2F%2Fevil.example%2Fx', 'https://decapodlabs.ai').status, 'rejected', 'reject hostile return param');

  assert(flow.isTrustedAuthUrl('https://api.decapodlabs.ai/auth'), 'canonical auth allowed');
  assert(!flow.isTrustedAuthUrl('https://evil.example/auth'), 'external auth rejected');
  assert(flow.isAllowedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'), 'stripe checkout allowed');
  assert(!flow.isAllowedCheckoutUrl('https://checkout.stripe.com.evil.example/pay'), 'lookalike checkout rejected');
  assert(!flow.isAllowedCheckoutUrl('http://checkout.stripe.com/pay'), 'insecure checkout rejected');
  assert(flow.hasHostileFragmentTokens('#access_token=abc&token_type=bearer'), 'detect hash access_token');
  assert(flow.hasHostileFragmentTokens('#provider_token=gho_xyz'), 'detect hash provider_token');

  const authHref = flow.buildAuthAuthorizeUrl({
    provider: 'github',
    returnTo: 'https://decapodlabs.ai/signup?login_nonce=' + 'a'.repeat(43),
    codeChallenge: 'b'.repeat(43),
    expectedOrigin: 'https://decapodlabs.ai',
  });
  const authUrl = new URL(authHref);
  assertEq(authUrl.origin + authUrl.pathname, 'https://api.decapodlabs.ai/auth', 'uses canonical /auth');
  assertEq(authUrl.searchParams.get('code_challenge_method'), 's256', 'PKCE s256');
});

Deno.test('Pricing preserves UNDER WRAPS disabled state when billing is not live, and hands off via /auth when enabled', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');
  const doc = new MockDocument();
  const repoInput = doc.register(new MockElement('input', 'repo-count'));
  repoInput.value = '2'; repoInput.min = '1'; repoInput.max = '10';
  const seatInput = doc.register(new MockElement('input', 'seat-count'));
  seatInput.value = '5'; seatInput.min = '1'; seatInput.max = '25';
  const cloudBtn = doc.register(new MockElement('button', 'cloud-pay-cta'));
  cloudBtn.disabled = true;
  const previewBtn = doc.register(new MockElement('button', 'preview-checkout'));
  previewBtn.disabled = true;
  const banner = doc.register(new MockElement('div', 'pricing-repo-banner'));
  banner.hidden = true;
  doc.register(new MockElement('strong', 'pricing-repo-slug'));
  doc.register(new MockElement('span', 'pricing-repo-note'));
  doc.register(new MockElement('div', 'annual-savings'));
  for (const id of ['repo-count-value','seat-count-value','assignment-count','assignment-formula','repo-discount','contributor-discount','combined-discount','annual-volume','annual-discount']) {
    doc.register(new MockElement('span', id));
  }

  const navigations: string[] = [];
  const storage = makeStorage();
  const prevGlobals = {
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    sessionStorage: (globalThis as any).sessionStorage,
    history: (globalThis as any).history,
    fetch: (globalThis as any).fetch,
  };

  try {
    (globalThis as any).document = doc;
    (globalThis as any).sessionStorage = storage;
    (globalThis as any).history = { replaceState: () => {} };
    (globalThis as any).location = {
      origin: 'https://decapodlabs.ai',
      pathname: '/pricing',
      search: '?repo=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
      assign: (u: string) => navigations.push(u),
    };
    // Case 1: Server discovery reports billing/live sale disabled -> Pay stays disabled.
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
      publishable_key: 'sb_publishable_test',
      auth_providers: { github: true, google: false, gitlab: false },
    }), { status: 200 }));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 10));

    assertEq(cloudBtn.disabled, true, 'cloud Pay stays disabled while Under Wraps');
    assertEq(previewBtn.disabled, true, 'preview Pay stays disabled while Under Wraps');
    assertEq(banner.hidden, false, 'invalid repo notice displayed safely');
    assert(!doc.getElementById('pricing-repo-slug')!.textContent.includes('<script>'), 'hostile repo never echoed');
    assertEq(navigations.length, 0, 'no checkout navigation when disabled');

    // Case 2: Server discovery enables live sale + valid ?repo= -> clicking Pay routes via /auth PKCE.
    (globalThis as any).location.search = '?repo=DecapodLabs%2Fdecapod';
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
      publishable_key: 'sb_publishable_test',
      auth_providers: { github: true, google: false, gitlab: false },
      live_sale_enabled: true,
      billing_enabled: true,
    }), { status: 200 }));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));

    assertEq(cloudBtn.disabled, false, 'cloud Pay enabled when server live_sale_enabled=true');
    assertEq(doc.getElementById('pricing-repo-slug')!.textContent, 'Target repository intent: DecapodLabs/decapod', 'valid repo displayed');
    cloudBtn.click();
    await new Promise(r => setTimeout(r, 15));
    assertEq(navigations.length, 1, 'Pay click navigated to auth');
    const dest = new URL(navigations[0]);
    assertEq(dest.origin, 'https://api.decapodlabs.ai', 'routes through api.decapodlabs.ai');
    assert(dest.pathname.endsWith('/auth'), 'hits /auth gate, never Stripe Checkout directly');
    assertEq(dest.searchParams.get('code_challenge_method'), 's256', 'PKCE enabled');
    assert(dest.searchParams.get('return_to')!.startsWith('https://decapodlabs.ai/signup'), 'returns to same-origin /signup');
  } finally {
    Object.assign(globalThis, prevGlobals);
  }
});

Deno.test('Signup enforces auth gate before confidential APIs and scrubs hostile URL tokens', async () => {
  const doc = createSignupDom();
  const storage = makeStorage();
  const calls: string[] = [];
  const navigations: string[] = [];
  const scrubbed: string[] = [];

  const ctrl = signupApp.createSignupController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: {
      origin: 'https://decapodlabs.ai',
      href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod&return_to=https%3A%2F%2Fevil.example#access_token=leak123',
      assign: (u: string) => navigations.push(u),
    },
    history: { replaceState: (_s: any, _t: string, url: string) => scrubbed.push(url) },
    fetch: (input: string) => { calls.push(input); return Promise.resolve(new Response('{}', { status: 500 })); },
    navigateFn: (u: string) => navigations.push(u),
  });

  await ctrl.init();
  assertEq(scrubbed[0], '/signup', 'URL query and fragment tokens scrubbed immediately');
  assertEq(calls.length, 0, 'zero confidential backend API calls prior to auth');
  assertEq(ctrl.getState().authenticated, false, 'fragment token never grants session');
  assertEq(doc.getElementById('auth-gate')!.hidden, false, 'auth gate visible');
  assertEq(doc.getElementById('step-org-repo')!.hidden, true, 'org/repo locked');
  assertEq(doc.getElementById('step-checkout')!.hidden, true, 'checkout locked');

  // Unauthenticated click on Google starts PKCE via https://api.decapodlabs.ai/auth
  doc.getElementById('auth-google')!.click();
  await new Promise(r => setTimeout(r, 10));
  assertEq(navigations.length, 1, 'Google sign-in initiated');
  const authUrl = new URL(navigations[0]);
  assertEq(authUrl.origin + authUrl.pathname, 'https://api.decapodlabs.ai/auth', 'PKCE auth endpoint');
  assertEq(authUrl.searchParams.get('provider'), 'google', 'Google provider selected');
});

Deno.test('Signup handles Google->GitHub step-up, org_already_enrolled, admin_approval_required, pending_fulfillment, and ready', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgId = '20000000-0000-4000-8000-000000000002';
  const now = Math.floor(Date.now() / 1000);

  // 1. Google-authenticated user with no GitHub link -> code_host_link_required
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'valid-jwt-token',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      fetch: (input: string, init: RequestInit) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'google', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          const body = JSON.parse(String(init.body));
          if (body.operation === 'account') {
            return Promise.resolve(new Response(JSON.stringify({ account_id: accountId, status: 'code_host_link_required', organizations: [], projects: [] }), { status: 200 }));
          }
        }
        return Promise.resolve(new Response(JSON.stringify({ error: { code: 'unexpected' } }), { status: 500 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('step-identity')!.hidden, false, 'GitHub link step-up shown');
    assertEq(doc.getElementById('identity-link-actions')!.hidden, false, 'link button shown');
    assertEq(doc.getElementById('step-checkout')!.hidden, true, 'checkout blocked until GitHub linked');
  }

  // 2. organization_already_enrolled fails closed with no Checkout
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    const nonce = 'n'.repeat(43);
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow', JSON.stringify({
      version: 1, kind: 'sign_in', provider: 'github', verifier: 'v'.repeat(43),
      nonce, expires: now + 600, phase: 'pending', project: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod&code=authcode&login_nonce=' + nonce },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/token') {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 'jwt-gh', expires_in: 3600, provider_token: 'gho_mem' }), { status: 200 }));
        }
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({ account_id: accountId, status: 'registered', organizations: [], projects: [] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/repository-enroll')) {
          return Promise.resolve(new Response(JSON.stringify({ error: { code: 'organization_already_enrolled' } }), { status: 409 }));
        }
        if (url.origin === 'https://api.github.com') {
          return Promise.resolve(new Response('[]', { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    await ctrl.verifyRepo();
    assertEq(doc.getElementById('step-state')!.dataset.stateKind, 'organization_already_enrolled', 'surfaces organization_already_enrolled');
    assertEq(doc.getElementById('step-checkout')!.hidden, true, 'Checkout blocked when org already enrolled');
  }

  // 3. Checkout return -> bounded pending_fulfillment poll -> ready (backend_authorized=true)
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    let statusCalls = 0;
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      sleepFn: () => Promise.resolve(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod&checkout=returned' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: true }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          statusCalls++;
          if (statusCalls < 3) {
            return Promise.resolve(new Response(JSON.stringify({
              account_id: accountId,
              project_id: 'DecapodLabs/decapod',
              status: 'pending_fulfillment',
              backend_authorized: false,
            }), { status: 200 }));
          }
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            project_id: 'DecapodLabs/decapod',
            status: 'active',
            backend_authorized: true,
            admin: true,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(statusCalls, 3, 'bounded poller checked until backend_authorized=true');
    assertEq(doc.getElementById('step-ready')!.hidden, false, 'ready card visible after server confirmation');
    assert(doc.getElementById('ready-summary')!.textContent.includes('DecapodLabs/decapod'), 'ready summary displays repo');
  }

  // 4. Server-quoted checkout invokes billing-quote then billing-checkout and rejects non-Stripe URLs
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const navigations: string[] = [];
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: (input: string, init: RequestInit) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: true }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            project_id: 'DecapodLabs/decapod',
            organization_id: orgId,
            status: 'entitlement_required',
            backend_authorized: false,
            admin: true,
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', quantity: 0 }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-quote')) {
          const b = JSON.parse(String(init.body));
          assertEq(b.cadence, 'month', 'cadence forwarded');
          assertEq(b.allocations[0].capacity, 1, 'seat count forwarded');
          return Promise.resolve(new Response(JSON.stringify({
            order_id: 'ord-1',
            quote_id: 'qt-1',
            quantity: 1,
            amount: 1234,
            unit_cents: 1234,
            total_discount_pct: 0,
            cadence: 'month',
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-checkout')) {
          return Promise.resolve(new Response(JSON.stringify({
            status: 'checkout_ready',
            checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_ok',
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: (u: string) => navigations.push(u),
    });
    await ctrl.init();
    assertEq(doc.getElementById('step-checkout')!.hidden, false, 'checkout panel shown for admin with entitlement_required');
    assertEq(doc.getElementById('checkout-btn')!.disabled, true, 'checkout disabled before server quote');
    await ctrl.requestQuote();
    assertEq(doc.getElementById('checkout-btn')!.disabled, false, 'checkout enabled after server quote');
    assertEq(doc.getElementById('quote-amount')!.textContent, '$12.34', 'renders server quote amount');
    await ctrl.startCheckout();
    assertEq(navigations[0], 'https://checkout.stripe.com/c/pay/cs_test_ok', 'navigates to validated Stripe Checkout');
  }

  // 5. admin_approval_required fails closed for non-admin org member
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-member',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: false }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            project_id: 'DecapodLabs/decapod',
            status: 'admin_approval_required',
            backend_authorized: false,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('step-state')!.dataset.stateKind, 'admin_approval_required', 'surfaces admin_approval_required');
    assertEq(doc.getElementById('step-checkout')!.hidden, true, 'Checkout disabled on admin_approval_required');
  }

  // 6. billing_not_configured preserves UNDER WRAPS on /signup without constructing static Checkout links
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-admin',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: { ...TEST_PROFILE, liveSaleEnabled: false },
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: true }],
            projects: [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-status')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            project_id: 'DecapodLabs/decapod',
            organization_id: orgId,
            status: 'entitlement_required',
            backend_authorized: false,
            admin: true,
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ error: { code: 'billing_not_configured' } }), { status: 503 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('step-checkout')!.hidden, false, 'checkout container shown');
    assertEq(doc.getElementById('billing-closed-notice')!.hidden, false, 'UNDER WRAPS notice visible when billing disabled');
    assertEq(doc.getElementById('billing-quote-controls')!.hidden, true, 'quote controls hidden when billing disabled');
    assertEq(doc.getElementById('checkout-btn')!.disabled, true, 'checkout button stays disabled');
  }

  // 7. Bounded poller terminates cleanly after maxAttempts if fulfillment never finishes
  {
    let count = 0;
    const result = await flow.createBoundedPoller({
      maxAttempts: 3,
      intervalMs: 0,
      sleepFn: () => Promise.resolve(),
      checkFn: () => {
        count++;
        return Promise.resolve({ status: 'pending_fulfillment', backend_authorized: false });
      },
    });
    assertEq(count, 3, 'poller stopped at exact bounded limit');
    assertEq(result.outcome, 'pending_timeout', 'bounded timeout outcome');
  }

  // 8. Missing ?repo= shows GitHub org/repo selection after sign-in and provider_link_stepup_required locks checkout
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'provider_link_stepup_required',
            pending_providers: ['google'],
            organizations: [],
            projects: [],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('step-identity')!.hidden, false, 'quarantine step-up shown');
    assertEq(doc.getElementById('identity-quarantine-actions')!.hidden, false, 'confirm/revoke actions shown');
    assertEq(doc.getElementById('step-checkout')!.hidden, true, 'checkout blocked during quarantine');
  }
});

Deno.test('discoverRuntimeConfig uses trusted API fallback and signup accepts a single repository slug', async () => {
  const primaryProfile = await flow.discoverRuntimeConfig((url: string) => {
    if (url.startsWith('https://api.decapodlabs.ai/')) {
      return Promise.resolve(new Response(JSON.stringify({
        version: 1,
        project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
        publishable_key: 'sb_publishable_test',
        auth_providers: { github: true, google: true, gitlab: false },
      }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  assertEq(primaryProfile.apiOrigin, 'https://api.decapodlabs.ai', 'prefers api.decapodlabs.ai when healthy');
  assertEq(primaryProfile.authBaseUrl, 'https://api.decapodlabs.ai/auth', 'uses /auth when /auth/providers responds 200');
  assertEq(primaryProfile.liveSaleEnabled, false, 'fail-closed liveSaleEnabled when omitted');

  const fallbackProfile = await flow.discoverRuntimeConfig((url: string) => {
    if (url.startsWith('https://api.decapodlabs.ai/')) {
      return Promise.resolve(new Response('error code: 1014', { status: 403 }));
    }
    if (url.startsWith('https://goyxpcmxetztjlrrcwew.supabase.co/')) {
      return Promise.resolve(new Response(JSON.stringify({
        version: 1,
        project_origin: 'https://goyxpcmxetztjlrrcwew.supabase.co',
        publishable_key: 'sb_publishable_test',
        auth_providers: { github: true, google: false, gitlab: false },
      }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  assertEq(fallbackProfile.apiOrigin, 'https://goyxpcmxetztjlrrcwew.supabase.co', 'falls back to Edge origin when api subdomain returns 403');
  assertEq(fallbackProfile.authBaseUrl, 'https://goyxpcmxetztjlrrcwew.supabase.co/functions/v1/decapod-onboarding/auth', 'falls back to Edge /auth');

  // Without an inbound repo intent, show the single slug input without querying GitHub repositories.
  const doc = createSignupDom();
  const storage = makeStorage();
  const now = Math.floor(Date.now() / 1000);
  const nonce = 'k'.repeat(43);
  const accountId = '10000000-0000-4000-8000-000000000001';
  storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow', JSON.stringify({
    version: 1, kind: 'sign_in', provider: 'github', verifier: 'v'.repeat(43),
    nonce, expires: now + 600, phase: 'pending', project: TEST_PROFILE.projectOrigin,
  }));
  let githubEnumerationCalls = 0;
  const ctrl = signupApp.createSignupController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?code=c1&login_nonce=' + nonce },
    history: { replaceState: () => {} },
    fetch: (input: string) => {
      const url = new URL(input);
      if (url.pathname === '/auth/v1/token') {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'jwt-1', expires_in: 3600, provider_token: 'gho_abc' }), { status: 200 }));
      }
      if (url.pathname === '/auth/v1/user') {
        return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
      }
      if (url.pathname.endsWith('/account-register')) {
        return Promise.resolve(new Response(JSON.stringify({ account_id: accountId, status: 'registered', organizations: [], projects: [] }), { status: 200 }));
      }
      if (url.origin === 'https://api.github.com') {
        githubEnumerationCalls++;
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    },
    navigateFn: () => {},
  });
  await ctrl.init();
  assertEq(doc.getElementById('step-org-repo')!.hidden, false, 'single repository input shown after sign-in');
  assertEq(doc.getElementById('repo-input')!.value, '', 'manual entry blank without a handoff');
  assertEq(githubEnumerationCalls, 0, 'no GitHub repository enumeration');
  assertEq(doc.getElementById('account-bar')!.hidden, false, 'verified GitHub indicator shown');
  assertEq(doc.getElementById('account-summary')!.textContent, 'GitHub connected', 'no internal account identifier displayed');
  assertEq(doc.getElementById('signup-status')!.hidden, true, 'stale sign-in loading message hidden after verified enrollment');
  assert(!doc.getElementById('account-summary')!.textContent.includes(accountId), 'UUID not shown to customers');
});

Deno.test('Signup retains repository intent across GitHub reauthorization', async () => {
  const doc = createSignupDom();
  const storage = makeStorage();
  const accountId = '10000000-0000-4000-8000-000000000001';
  const now = Math.floor(Date.now() / 1000);
  const sessionKey = 'decapod-portal:' + TEST_PROFILE.projectOrigin + ':session';
  const flowKey = 'decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow';
  const navigations: string[] = [];
  const githubRequests: string[] = [];
  const fetchMock = (input: string) => {
    const url = new URL(input);
    if (url.origin === 'https://api.github.com') {
      githubRequests.push(input);
      return Promise.resolve(new Response('{}', { status: 500 }));
    }
    if (url.pathname === '/auth/v1/user') {
      return Promise.resolve(new Response(JSON.stringify({
        id: accountId,
        identities: [{ provider: 'github', user_id: accountId, id: '42' }],
      }), { status: 200 }));
    }
    if (url.pathname === '/auth/v1/token') {
      return Promise.resolve(new Response(JSON.stringify({
        access_token: 'jwt-gh-new', expires_in: 3600, provider_token: 'gho_in_memory',
      }), { status: 200 }));
    }
    if (url.pathname.endsWith('/account-register')) {
      return Promise.resolve(new Response(JSON.stringify({
        account_id: accountId, status: 'registered', organizations: [], projects: [],
      }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  storage.setItem(sessionKey, JSON.stringify({
    access_token: 'jwt-gh-old',
    expires_at: now + 3600,
    origin: TEST_PROFILE.projectOrigin,
  }));

  const ctrl = signupApp.createSignupController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdactyl' },
    history: { replaceState: () => {} },
    fetch: fetchMock,
    navigateFn: (url: string) => navigations.push(url),
  });
  await ctrl.init();
  assertEq(doc.getElementById('repo-input')!.value, 'DecapodLabs/dactyl', 'CLI handoff prefills the slug');
  await ctrl.verifyRepo();
  assertEq(navigations.length, 1, 'Verify starts GitHub reauthorization when the provider token is unavailable');
  assertEq(new URL(navigations[0]).pathname, '/auth/v1/authorize', 'trusted GitHub authorization path used');
  const pending = JSON.parse(storage.getItem(flowKey)!);

  const resumedDoc = createSignupDom();
  const returned = signupApp.createSignupController({
    document: resumedDoc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: {
      origin: 'https://decapodlabs.ai',
      href: 'https://decapodlabs.ai/signup?code=callback&login_nonce=' + pending.nonce,
    },
    history: { replaceState: () => {} },
    fetch: fetchMock,
    navigateFn: () => {},
  });
  await returned.init();
  assertEq(returned.getState().preselectedRepo, 'DecapodLabs/dactyl', 'repo intent restored from session on callback');
  assertEq(resumedDoc.getElementById('repo-input')!.value, 'DecapodLabs/dactyl', 'single input remains prefilled');
  assertEq(githubRequests.length, 0, 'no client-side repository enumeration');
});

Deno.test('static site documents, classic scripts, UNDER WRAPS posture, and public-repo confidentiality pass', async () => {
  const siteOrigin = 'https://site.invalid';
  const docIds = new Map<string, string[]>();
  const resolveTarget = (url: URL) => {
    if (url.pathname === '/') return 'index.html';
    if (url.pathname === '/pricing' || url.pathname === '/pricing/') return 'pricing/index.html';
    if (url.pathname === '/signup' || url.pathname === '/signup/') return 'signup/index.html';
    return decodeURIComponent(url.pathname.slice(1));
  };
  const getIds = async (path: string) => {
    if (!docIds.has(path)) {
      const html = await Deno.readTextFile(path);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
      assertEq(new Set(ids).size, ids.length, 'unique IDs in ' + path);
      docIds.set(path, ids);
    }
    return docIds.get(path)!;
  };
  const signupMarkup = await Deno.readTextFile('signup/index.html');
  assert(signupMarkup.includes('/assets/mascot.png'), 'Clack replaces the security callout');
  assert(signupMarkup.includes('alt="Clack, the Decapod Labs mascot"'), 'Clack is the accessible hero illustration');
  const signupStyles = await Deno.readTextFile('signup/signup.css');
  assert(!signupStyles.includes('.signup-guardrail-card'), 'removed callout has no remaining styling');
  assert(!signupStyles.includes('.signup-hero-mascot::before'), 'Clack PNG stands alone without badge or halo');
  assert(signupMarkup.includes('signup-verified'), 'GitHub verified chip present');
  assert(!signupMarkup.includes('FAIL-CLOSED AUTHORIZATION'), 'no extraneous security callout');
  assert(!signupMarkup.includes('site-footer-pinned'), 'signup footer cannot overlay form');
  assert(!signupMarkup.includes('sign-out-btn'), 'no signout control on checkout page');
  assert(!signupMarkup.includes('org-select') && !signupMarkup.includes('repo-select'), 'no redundant org/repo dropdowns');
  for (const docPath of ['index.html', 'offerings.html', 'pricing.html', 'pricing/index.html', 'signup/index.html', 'proof.html', 'tecr.html']) {
    const html = await Deno.readTextFile(docPath);
    assert(html.includes('lang="en"') && /<meta\s+name="viewport"/i.test(html), 'accessibility baseline: ' + docPath);
    await getIds(docPath);
    for (const m of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
      const url = new URL(m[1], new URL(docPath, siteOrigin + '/'));
      assert(!url.username && !url.password && ['https:', 'mailto:'].includes(url.protocol), 'safe protocol in ' + docPath);
      if (url.origin !== siteOrigin) continue;
      const target = resolveTarget(url);
      const info = await Deno.stat(target);
      assert(info.isFile && info.size > 0, 'existing local asset ' + target + ' from ' + docPath);
      if (url.hash) {
        const targetIds = await getIds(target);
        assert(targetIds.includes(decodeURIComponent(url.hash.slice(1))), 'valid fragment ' + url.hash + ' in ' + target);
      }
    }
  }
  for (const scriptPath of ['main.js', 'cloud-flow.js', 'pricing.js', 'signup/signup.js']) {
    new Function(await Deno.readTextFile(scriptPath));
  }
  for (const scriptPath of ['cloud-flow.js', 'pricing.js', 'signup/signup.js']) {
    const src = await Deno.readTextFile(scriptPath);
    assert(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(src), 'no unsafe DOM sink in ' + scriptPath);
  }
  for (const pricingDoc of ['pricing.html', 'pricing/index.html']) {
    const html = await Deno.readTextFile(pricingDoc);
    assert(html.includes('UNDER WRAPS'), 'UNDER WRAPS preserved in ' + pricingDoc);
    assert(/id="cloud-pay-cta"[^>]*\bdisabled\b/.test(html), 'cloud-pay-cta disabled by default in ' + pricingDoc);
    assert(/id="preview-checkout"[^>]*\bdisabled\b/.test(html), 'preview-checkout disabled by default in ' + pricingDoc);
  }
  const forbidden: [string, RegExp][] = [
    ['stripe_object_id', /\b(?:price|prod|acct|bpc)_[A-Za-z0-9]{10,}\b/],
    ['stripe_secret_key', /\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{8,}\b/],
    ['stripe_webhook_secret', /\bwhsec_[A-Za-z0-9]{8,}\b/],
    ['private_migration_file', /\b0\d{2}_[a-z0-9_]+\.sql\b/],
    ['private_rpc_name', /\bpropodus_[a-z_]+_v\d+\b/],
    ['private_schema_symbol', /\bpropodus\.[a-z_]+\b/],
    ['private_internal_path', /\binternal\/backend\b/],
  ];
  for (const file of [
    'pricing.html', 'pricing/index.html', 'pricing.js', 'pricing.css',
    'cloud-flow.js', 'signup/index.html', 'signup/signup.js', 'signup/signup.css',
    'tests/pricing_signup_test.ts',
    '.decapod/managed/specs/INTENT.md',
    '.decapod/managed/specs/ARCHITECTURE.md',
    '.decapod/managed/specs/INTERFACES.md',
    '.decapod/managed/specs/SECURITY.md',
  ]) {
    const content = await Deno.readTextFile(file);
    for (const [label, pattern] of forbidden) {
      assert(!pattern.test(content), 'confidentiality clean (' + label + ') in ' + file);
    }
  }
});

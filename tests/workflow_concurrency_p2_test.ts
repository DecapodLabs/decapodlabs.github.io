// Offline concurrency and workflow consistency tests for Phase 2 (#54, #55, #56):
// - #54 Pricing: stale cached pricing version vs manifest, cross-tab intent mismatch,
//   stale quote/mismatch recovery without trusting stale state, duplicate Pay suppression.
// - #55 Admin: monotonic request epoch & AbortController guards on org switches,
//   concurrent 409 revision conflicts, revocation during mutation, 401/403 fail-closed
//   state clearing, and discarding late responses arriving after sign-out.
// - #56 Signup + cloud-flow: duplicate checkout/enrollment/quote click suppression with
//   stable request_id, two-tab checkout/return coordination via BroadcastChannel,
//   browser Back/reload during checkout return, delayed stale response guards,
//   lost-ack/delayed-webhook bounded polling, and strict pending_timeout handling.
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

function createPricingDom() {
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
  for (const id of ['repo-count-value', 'seat-count-value', 'assignment-count', 'assignment-formula', 'repo-discount', 'contributor-discount', 'combined-discount', 'annual-volume', 'annual-discount']) {
    doc.register(new MockElement('span', id));
  }
  const monthBtn = new MockElement('button');
  monthBtn.dataset.billing = 'month';
  const yearBtn = new MockElement('button');
  yearBtn.dataset.billing = 'year';
  doc.selectorLists.set('[data-billing]', [monthBtn, yearBtn]);
  return { doc, monthBtn, yearBtn };
}

function createSignupDom() {
  const doc = new MockDocument();
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
    const tag = id.endsWith('-select') ? 'select' : id.endsWith('-btn') ? 'button' : 'div';
    doc.register(new MockElement(tag, id));
  }
  doc.getElementById('billing-cadence')!.value = 'month';
  doc.getElementById('seat-quantity')!.value = '1';
  return doc;
}

function createAdminDom() {
  const doc = new MockDocument();
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
  doc.getElementById('admin-limit-warn')!.value = '80';
  doc.getElementById('admin-limit-crit')!.value = '95';
  doc.getElementById('admin-limit-notify')!.value = '1';
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

Deno.test('#54 Pricing: stale cached pricing version vs manifest, cross-tab intent mismatch, stale quote recovery, and duplicate click lock', async () => {
  const pricingSource = await Deno.readTextFile('pricing.js');
  const prevStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const prev = {
    DecapodCloudFlow: (globalThis as any).DecapodCloudFlow,
    DecapodMockBroadcastChannel: (globalThis as any).DecapodMockBroadcastChannel,
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    history: (globalThis as any).history,
    fetch: (globalThis as any).fetch,
  };

  // 1. Stale HTML manifest (20261124-p1) vs current pricing.js (20261124-p2) fails closed
  try {
    const { doc } = createPricingDom();
    doc.setMeta('decapod-flow-contract', '1');
    doc.setMeta('decapod-asset-release', '20261124-p1');
    let fetchCalls = 0;
    (globalThis as any).document = doc;
    Object.defineProperty(globalThis, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
    (globalThis as any).history = { replaceState: () => {} };
    (globalThis as any).location = { origin: 'https://decapodlabs.ai', pathname: '/pricing', search: '?repo=DecapodLabs%2Fdecapod', hash: '' };
    (globalThis as any).fetch = () => { fetchCalls++; return Promise.resolve(new Response('{}', { status: 200 })); };

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));
    assertEq(fetchCalls, 0, 'stale manifest makes zero discovery fetch calls');
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pay disabled on stale manifest');
    assert(doc.getElementById('pricing-repo-slug')!.textContent.includes('skew'), 'stale manifest notice rendered');
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }

  // 2. Stale cached sessionStorage pricing meta cleared & never trusted when server discovery fails or disables sale
  try {
    const { doc } = createPricingDom();
    doc.setMeta('decapod-flow-contract', '1');
    doc.setMeta('decapod-asset-release', flow.ASSET_RELEASE);
    const storage = makeStorage();
    storage.setItem('decapod:pricing-meta', JSON.stringify({
      asset_release: '20261124-p1',
      contract_version: 1,
      quote_id: 'qt-stale-cached',
      live_sale_enabled: true,
      project_origin: TEST_PROFILE.projectOrigin,
    }));
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow', JSON.stringify({ version: 1, nonce: 'old' }));
    (globalThis as any).document = doc;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
    (globalThis as any).history = { replaceState: () => {} };
    (globalThis as any).location = {
      origin: 'https://decapodlabs.ai',
      pathname: '/pricing',
      search: '?repo=DecapodLabs%2Fdecapod&error=stale_quote',
      hash: '',
    };
    // Server config fails (network outage) -> must NEVER trust cached live_sale_enabled=true
    (globalThis as any).fetch = () => Promise.reject(new Error('network_down'));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pay stays disabled when server discovery fails despite stale cache');
    assertEq(storage.getItem('decapod:pricing-meta'), null, 'stale pricing-meta cleared');
    assertEq(storage.getItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow'), null, 'stale flow record cleared');
    assert(doc.getElementById('pricing-repo-note')!.textContent.includes('stale_quote'), 'safe recovery notice shown for stale_quote');
    assertEq(storage.getItem('decapod:pending-repo-intent'), 'DecapodLabs/decapod', 'sanitized repo intent preserved across recovery');
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }

  // 3. Cross-tab intent mismatch disables Pay until reconciled + duplicate Pay click lock suppresses double navigation
  try {
    const { doc, yearBtn, monthBtn } = createPricingDom();
    doc.setMeta('decapod-flow-contract', '1');
    doc.setMeta('decapod-asset-release', flow.ASSET_RELEASE);
    const storage = makeStorage();
    const { MockBroadcastChannel } = createMockBroadcastBus();
    const navigations: string[] = [];
    (globalThis as any).DecapodMockBroadcastChannel = MockBroadcastChannel;
    (globalThis as any).document = doc;
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
    (globalThis as any).history = { replaceState: () => {} };
    (globalThis as any).location = {
      origin: 'https://decapodlabs.ai',
      pathname: '/pricing',
      search: '?repo=OrgA%2Frepo-a',
      hash: '',
      assign: (u: string) => navigations.push(u),
    };
    (globalThis as any).fetch = () => Promise.resolve(new Response(JSON.stringify({
      version: 1,
      project_origin: TEST_PROFILE.projectOrigin,
      publishable_key: 'sb_publishable_test',
      auth_providers: { github: true, google: false, gitlab: false },
      live_sale_enabled: true,
      billing_enabled: true,
      pricing_version: '2026-11-24.1',
    }), { status: 200 }));

    new Function(pricingSource)();
    await new Promise(r => setTimeout(r, 15));
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, false, 'Pay enabled initially');

    const peer = new MockBroadcastChannel('decapod-cloud-coherence');
    // Sibling tab selects a different repo -> mismatch locks Pay
    peer.postMessage({
      tabId: 'tab-b',
      type: 'intent_sync',
      page: 'pricing',
      repo: 'OrgB/repo-b',
      billing: 'month',
      contractVersion: 1,
      assetRelease: flow.ASSET_RELEASE,
    });
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pay disabled on cross-tab repo intent mismatch');
    assert(doc.getElementById('pricing-repo-slug')!.textContent.includes('Cross-tab repository intent mismatch'), 'mismatch banner displayed');

    // Sibling tab reconciles back to OrgA/repo-a with annual billing -> billing mismatch
    peer.postMessage({
      tabId: 'tab-b',
      type: 'intent_sync',
      page: 'pricing',
      repo: 'OrgA/repo-a',
      billing: 'year',
      contractVersion: 1,
      assetRelease: flow.ASSET_RELEASE,
    });
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, true, 'Pay disabled on cross-tab billing cadence mismatch');

    // Selecting annual billing in Tab A clears billing mismatch
    yearBtn.click();
    assertEq(doc.getElementById('cloud-pay-cta')!.disabled, false, 'Pay re-enabled once billing intent reconciled');

    // Switch back to monthly on both
    peer.postMessage({
      tabId: 'tab-b',
      type: 'intent_sync',
      page: 'pricing',
      repo: 'OrgA/repo-a',
      billing: 'month',
      contractVersion: 1,
      assetRelease: flow.ASSET_RELEASE,
    });
    monthBtn.click();

    // Double click Pay rapidly -> only ONE auth navigation occurs
    doc.getElementById('cloud-pay-cta')!.click();
    doc.getElementById('cloud-pay-cta')!.click();
    await new Promise(r => setTimeout(r, 20));
    assertEq(navigations.length, 1, 'duplicate Pay click suppressed to single navigation');
    peer.close();
  } finally {
    Object.assign(globalThis, prev);
    if (prevStorageDesc) Object.defineProperty(globalThis, 'sessionStorage', prevStorageDesc);
  }
});

Deno.test('#55 Admin: AbortController org-switch guards, concurrent 409 revision conflicts, 403 revocation, and post-signout late response discard', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const targetMember = '50000000-0000-4000-8000-000000000005';
  const orgAUuid = '20000000-0000-4000-8000-000000000002';
  const orgBUuid = '30000000-0000-4000-8000-000000000003';
  const now = Math.floor(Date.now() / 1000);

  // 1. Org switch aborts pending OrgA AbortSignals + 409 revision conflicts refresh authoritative revisions
  {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-admin',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));

    let orgAMembersSignal: AbortSignal | null | undefined;
    let resolveSlowOrgAMembers: ((res: Response) => void) | null = null;
    let orgBAdminRevision = 4;
    let orgBRecoveryRevision = 6;
    let orgBLimitRevision = 2;
    let orgBOverageRevision = 3;
    const seenAdminRevs: number[] = [];
    const seenRecoveryRevs: number[] = [];
    const seenLimitRevs: number[] = [];
    const seenOverageRevs: number[] = [];
    let forceAdminConflict = true;
    let forceRecoveryConflict = true;
    let forceLimitConflict = true;
    let forceOverageConflict = true;

    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/OrgA' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
      fetch: (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};

        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          if (body.operation === 'account') {
            return Promise.resolve(new Response(JSON.stringify({
              account_id: accountId,
              status: 'registered',
              organizations: [
                { id: 'org:a', cloud_org_id: orgAUuid, scm_provider: 'github', scm_owner_slug: 'OrgA', admin: true },
                { id: 'org:b', cloud_org_id: orgBUuid, scm_provider: 'github', scm_owner_slug: 'OrgB', admin: true },
              ],
              projects: [],
            }), { status: 200 }));
          }
          if (body.operation === 'members') {
            if (body.organization_id === 'org:a') {
              orgAMembersSignal = init?.signal;
              return new Promise<Response>(resolve => { resolveSlowOrgAMembers = resolve; });
            }
            return Promise.resolve(new Response(JSON.stringify({ members: [{ slot: 1, account_id: accountId, role: 'owner', providers: ['github'], assigned_projects: [] }], next: null }), { status: 200 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ invitations: [], next: null }), { status: 200 }));
        }
        if (url.pathname.endsWith('/org-admins')) {
          if (body.operation === 'list') {
            return Promise.resolve(new Response(JSON.stringify({
              admin_revision: orgBAdminRevision,
              authority_generation: 1,
              primary_owner_account_id: accountId,
              actor_role: 'owner',
              admins: [{ account_id: accountId, role: 'owner' }],
              pending_invitations: [],
            }), { status: 200 }));
          }
          seenAdminRevs.push(body.expected_revision);
          if (forceAdminConflict) {
            forceAdminConflict = false;
            orgBAdminRevision = 5;
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'revision_conflict' } }), { status: 409 }));
          }
          orgBAdminRevision++;
          return Promise.resolve(new Response(JSON.stringify({ status: 'granted', admin_revision: orgBAdminRevision }), { status: 200 }));
        }
        if (url.pathname.endsWith('/org-recovery')) {
          if (body.operation === 'get_recovery_contact' || body.operation === 'status') {
            return Promise.resolve(new Response(JSON.stringify({ contact_account_id: null, revision: orgBRecoveryRevision }), { status: 200 }));
          }
          seenRecoveryRevs.push(body.expected_revision);
          if (forceRecoveryConflict) {
            forceRecoveryConflict = false;
            orgBRecoveryRevision = 7;
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'revision_conflict' } }), { status: 409 }));
          }
          orgBRecoveryRevision++;
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', revision: orgBRecoveryRevision }), { status: 200 }));
        }
        if (url.pathname.endsWith('/resource-limits')) {
          if (body.action === 'status') {
            return Promise.resolve(new Response(JSON.stringify({
              status: 'ok',
              paid_overages: { opted_in: false, revision: orgBOverageRevision },
              metrics: [{ metric: 1, key: 'egress_bytes', category: 'network_transfer', unit: 'bytes', window: 'month', used: 0, remaining: 100, effective_limit: 100, operating_limit: null, warning_pct: 80, critical_pct: 95, notify_flags: 1, alert_state: 'ok', revision: orgBLimitRevision }],
              alerts: [],
            }), { status: 200 }));
          }
          seenLimitRevs.push(body.expected_revision);
          if (forceLimitConflict) {
            forceLimitConflict = false;
            orgBLimitRevision = 9;
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'revision_conflict' } }), { status: 409 }));
          }
          orgBLimitRevision++;
          return Promise.resolve(new Response(JSON.stringify({
            status: 'ok',
            paid_overages: { opted_in: false, revision: orgBOverageRevision },
            metrics: [{ metric: 1, key: 'egress_bytes', category: 'network_transfer', unit: 'bytes', window: 'month', used: 0, remaining: 500, effective_limit: 500, operating_limit: 500, warning_pct: 80, critical_pct: 95, notify_flags: 1, alert_state: 'ok', revision: orgBLimitRevision }],
            alerts: [],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-overage-policy')) {
          seenOverageRevs.push(body.expected_revision);
          if (forceOverageConflict) {
            forceOverageConflict = false;
            orgBOverageRevision = 8;
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'revision_conflict' } }), { status: 409 }));
          }
          orgBOverageRevision++;
          return Promise.resolve(new Response(JSON.stringify({
            status: 'ok',
            paid_overages: { opted_in: true, monthly_spend_cap_cents: 5000, spent_cents: 0, remaining_spend_cents: 5000, revision: orgBOverageRevision },
            metrics: [{ metric: 1, key: 'egress_bytes', category: 'network_transfer', unit: 'bytes', window: 'month', used: 0, remaining: 100, effective_limit: 100, operating_limit: null, warning_pct: 80, critical_pct: 95, notify_flags: 1, alert_state: 'ok', revision: orgBLimitRevision }],
            alerts: [],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/device-keys')) {
          return Promise.resolve(new Response(JSON.stringify({ version: 1, status: 'keys', account_id: accountId, device_keys: [] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ quantity: 0, capacities: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    });

    const initP = ctrl.init();
    await new Promise(r => setTimeout(r, 25));
    assert(orgAMembersSignal && !orgAMembersSignal.aborted, 'OrgA signal active before switch');

    // Switch to OrgB while OrgA members fetch is pending
    await ctrl.switchOrganization(orgBUuid);
    assert(orgAMembersSignal!.aborted, 'OrgA AbortSignal aborted immediately on org switch');

    // Resolve OrgA late anyway -> discarded
    resolveSlowOrgAMembers!(new Response(JSON.stringify({
      members: [{ slot: 99, account_id: '99999999-0000-4000-8000-000000000099', role: 'member', providers: ['github'], assigned_projects: ['OrgA/secret'] }],
      next: null,
    }), { status: 200 }));
    await initP;
    assert(!doc.getElementById('admin-members-list')!.textContent.includes('OrgA/secret'), 'late OrgA response discarded');

    // 409 on org-admins grant -> reloads rev 5, explicit retry uses rev 5
    doc.getElementById('admin-delegate-account')!.value = targetMember;
    await doc.getElementById('admin-grant-admin-btn')!.click();
    assertEq(seenAdminRevs[0], 4, 'first admin grant used rev 4');
    assertEq(ctrl.getState().adminRevision, 5, '409 re-fetched authoritative adminRevision=5');
    assert(doc.getElementById('admin-delegation-status')!.textContent.includes('conflict'), 'admin conflict status surfaced');
    await doc.getElementById('admin-grant-admin-btn')!.click();
    assertEq(seenAdminRevs[1], 5, 'retry after 409 uses refreshed rev 5');

    // 409 on org-recovery -> reloads rev 7, explicit retry uses rev 7
    doc.getElementById('admin-recovery-contact-input')!.value = targetMember;
    await doc.getElementById('admin-set-recovery-contact-btn')!.click();
    assertEq(seenRecoveryRevs[0], 6, 'first recovery update used rev 6');
    assertEq(ctrl.getState().recoveryRevision, 7, '409 re-fetched authoritative recoveryRevision=7');
    await doc.getElementById('admin-set-recovery-contact-btn')!.click();
    assertEq(seenRecoveryRevs[1], 7, 'retry after 409 uses refreshed rev 7');

    // 409 on resource-limits -> reloads rev 9, explicit retry uses rev 9
    doc.getElementById('admin-limit-cap')!.value = '500';
    await doc.getElementById('admin-save-limit-btn')!.click();
    assertEq(seenLimitRevs[0], 2, 'first limit update used rev 2');
    await doc.getElementById('admin-save-limit-btn')!.click();
    assertEq(seenLimitRevs[1], 9, 'retry after 409 uses refreshed limit rev 9');

    // 409 on billing-overage-policy -> reloads rev 8, explicit retry uses rev 8
    doc.getElementById('admin-overage-cap-usd')!.value = '50.00';
    doc.getElementById('admin-overage-terms-check')!.checked = true;
    await doc.getElementById('admin-overages-enable-btn')!.click();
    assertEq(seenOverageRevs[0], 3, 'first overage enable used rev 3');
    await doc.getElementById('admin-overages-enable-btn')!.click();
    assertEq(seenOverageRevs[1], 8, 'retry after 409 uses refreshed overage rev 8');

    ctrl.close();
  }

  // 2. Revocation (403) during in-flight org-admins mutation removes org & clears projections + late responses after sign-out are discarded
  {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-admin',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));

    let resolveSlowAccount: ((res: Response) => void) | null = null;
    let accountDelayed = false;

    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/OrgA' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
      fetch: (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          if (body.operation === 'account' && accountDelayed) {
            return new Promise<Response>(resolve => { resolveSlowAccount = resolve; });
          }
          if (body.operation === 'account') {
            return Promise.resolve(new Response(JSON.stringify({
              account_id: accountId,
              status: 'registered',
              organizations: [
                { id: 'org:a', cloud_org_id: orgAUuid, scm_provider: 'github', scm_owner_slug: 'OrgA', admin: true },
                { id: 'org:b', cloud_org_id: orgBUuid, scm_provider: 'github', scm_owner_slug: 'OrgB', admin: true },
              ],
              projects: [],
            }), { status: 200 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ members: [], invitations: [], next: null }), { status: 200 }));
        }
        if (url.pathname.endsWith('/org-admins')) {
          if (body.operation === 'grant') {
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'admin_required' } }), { status: 403 }));
          }
          return Promise.resolve(new Response(JSON.stringify({ admin_revision: 1, admins: [], pending_invitations: [] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/device-keys')) {
          return Promise.resolve(new Response(JSON.stringify({ version: 1, status: 'keys', account_id: accountId, device_keys: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok', metrics: [], alerts: [], capacities: [] }), { status: 200 }));
      },
    });

    await ctrl.init();
    doc.getElementById('admin-delegate-account')!.value = targetMember;
    doc.getElementById('admin-overage-cap-usd')!.value = '99.00';
    await doc.getElementById('admin-grant-admin-btn')!.click();

    // 403 during org-admins grant must close workspace, clear inputs, and remove OrgA from adminOrgIds
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace hidden immediately on 403 during org-admins grant');
    assertEq(doc.getElementById('admin-denied-panel')!.hidden, false, 'denied panel shown');
    assertEq(doc.getElementById('admin-delegate-account')!.value, '', 'sensitive delegate input cleared on 403');
    assertEq(doc.getElementById('admin-overage-cap-usd')!.value, '', 'overage cap input cleared on 403');
    assert(!ctrl.getState().adminOrgIds.includes(orgAUuid), 'revoked OrgA removed from adminOrgIds');
    assert(ctrl.getState().adminOrgIds.includes(orgBUuid), 'remaining authorized OrgB preserved');

    // Now trigger a refresh that stays in-flight, sign out, and resolve the late account-register response
    accountDelayed = true;
    const refreshP = doc.getElementById('admin-refresh-btn')!.click();
    await new Promise(r => setTimeout(r, 15));
    ctrl.signOut();
    assertEq(ctrl.getState().authenticated, false, 'signed out immediately');

    resolveSlowAccount!(new Response(JSON.stringify({
      account_id: accountId,
      status: 'registered',
      organizations: [{ id: 'org:b', cloud_org_id: orgBUuid, scm_provider: 'github', scm_owner_slug: 'OrgB', admin: true }],
      projects: [],
    }), { status: 200 }));
    await refreshP;
    await new Promise(r => setTimeout(r, 15));

    assertEq(ctrl.getState().authenticated, false, 'late response after sign-out does not restore session');
    assertEq(ctrl.getState().activeOrg, null, 'late response after sign-out does not restore activeOrg');
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace remains hidden after late response');
    assertEq(doc.getElementById('admin-account-bar')!.hidden, true, 'account bar remains hidden after late response');
    ctrl.close();
  }
});

Deno.test('#56 Signup + cloud-flow: duplicate click suppression with stable request_id, two-tab coordination, Back/reload, stale response guard, and strict pending_timeout', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgId = '20000000-0000-4000-8000-000000000002';
  const now = Math.floor(Date.now() / 1000);

  // 1. Duplicate enrollment, quote, and checkout click suppression + stable request_id across transient retry
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));

    const enrollReqIds: string[] = [];
    const checkoutReqIds: string[] = [];
    let resolveEnroll: ((r: Response) => void) | null = null;
    let failFirstEnroll = true;
    let resolveCheckout: ((r: Response) => void) | null = null;
    let failFirstCheckout = true;
    let enrollDone = false;
    const navigations: string[] = [];

    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      navigateFn: (u: string) => navigations.push(u),
      fetch: (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: true }],
            projects: enrollDone ? [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }] : [],
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/repository-enroll')) {
          enrollReqIds.push(body.request_id);
          return new Promise<Response>(resolve => { resolveEnroll = resolve; });
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
          checkoutReqIds.push(body.request_id);
          return new Promise<Response>(resolve => { resolveCheckout = resolve; });
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });

    // Simulate login with provider token via storage? Actually beginAuth isn't needed if we inject token via PKCE callback,
    // or test duplicate verifyRepo without token? We need inMemoryProviderToken for repository-enroll!
    // Let's initialize via PKCE callback so inMemoryProviderToken is populated cleanly.
    const nonce = 'z'.repeat(43);
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':flow', JSON.stringify({
      version: 1, kind: 'sign_in', provider: 'github', verifier: 'v'.repeat(43),
      nonce, expires: now + 600, phase: 'pending', project: TEST_PROFILE.projectOrigin,
    }));
    const ctrl2 = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?code=c1&login_nonce=' + nonce },
      history: { replaceState: () => {} },
      navigateFn: (u: string) => navigations.push(u),
      fetch: (input: string, init?: RequestInit) => {
        const url = new URL(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.pathname === '/auth/v1/token') {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 'jwt-gh', expires_in: 3600, provider_token: 'gho_mem' }), { status: 200 }));
        }
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId, id: '42' }] }), { status: 200 }));
        }
        if (url.pathname.endsWith('/account-register')) {
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId,
            status: 'registered',
            organizations: [{ id: orgId, admin: true }],
            projects: enrollDone ? [{ project_id: 'DecapodLabs/decapod', name: 'DecapodLabs/decapod', organization_id: orgId }] : [],
          }), { status: 200 }));
        }
        if (url.origin === 'https://api.github.com') {
          return Promise.resolve(new Response('[]', { status: 200 }));
        }
        if (url.pathname.endsWith('/repository-enroll')) {
          enrollReqIds.push(body.request_id);
          return new Promise<Response>(resolve => { resolveEnroll = resolve; });
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
          checkoutReqIds.push(body.request_id);
          return new Promise<Response>(resolve => { resolveCheckout = resolve; });
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });
    ctrl.close();
    await ctrl2.init();

    doc.getElementById('repo-input')!.value = 'DecapodLabs/decapod';
    // Double-click verifyRepo while in-flight -> only ONE repository-enroll request
    const e1 = ctrl2.verifyRepo();
    const e2 = ctrl2.verifyRepo();
    await new Promise(r => setTimeout(r, 10));
    assertEq(enrollReqIds.length, 1, 'duplicate enroll click suppressed');
    assert(typeof enrollReqIds[0] === 'string' && enrollReqIds[0].length > 10, 'enroll sends request_id');

    // Transient 503 on first enroll -> retry reuses exact same request_id
    if (failFirstEnroll) {
      failFirstEnroll = false;
      resolveEnroll!(new Response(JSON.stringify({ error: { code: 'service_unavailable' } }), { status: 503 }));
    }
    await Promise.all([e1, e2]);
    const eRetry = ctrl2.verifyRepo();
    await new Promise(r => setTimeout(r, 10));
    assertEq(enrollReqIds.length, 2, 'second enroll attempt sent after failure');
    assertEq(enrollReqIds[1], enrollReqIds[0], 'enroll retry reuses exact same stable request_id');
    enrollDone = true;
    resolveEnroll!(new Response(JSON.stringify({ status: 'repository_enrolled', organization_id: orgId, project_id: 'DecapodLabs/decapod' }), { status: 200 }));
    await eRetry;

    await ctrl2.requestQuote();

    // Double-click checkout -> only ONE billing-checkout request with stable request_id
    const c1 = ctrl2.startCheckout();
    const c2 = ctrl2.startCheckout();
    await new Promise(r => setTimeout(r, 10));
    assertEq(checkoutReqIds.length, 1, 'duplicate checkout click suppressed');
    assert(typeof checkoutReqIds[0] === 'string' && checkoutReqIds[0].length > 10, 'checkout sends stable request_id');

    if (failFirstCheckout) {
      failFirstCheckout = false;
      resolveCheckout!(new Response(JSON.stringify({ error: { code: 'service_unavailable' } }), { status: 503 }));
    }
    await Promise.all([c1, c2]);

    const cRetry = ctrl2.startCheckout();
    await new Promise(r => setTimeout(r, 10));
    assertEq(checkoutReqIds.length, 2, 'checkout retry allowed after failure');
    assertEq(checkoutReqIds[1], checkoutReqIds[0], 'checkout retry reuses exact same stable request_id');
    resolveCheckout!(new Response(JSON.stringify({ status: 'checkout_ready', checkout_url: 'https://checkout.stripe.com/c/pay/cs_ok' }), { status: 200 }));
    await cRetry;
    assertEq(navigations.length, 1, 'single checkout navigation');
    ctrl2.close();
  }

  // 2. Two-tab checkout/return coordination via BroadcastChannel + authoritative reconciliation
  {
    const { MockBroadcastChannel, sentMessages } = createMockBroadcastBus();
    const doc1 = createSignupDom();
    const doc2 = createSignupDom();
    const storage1 = makeStorage();
    const storage2 = makeStorage();
    storage1.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-tab-1', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));
    storage2.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-tab-2', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));

    let serverAuthorized = false;
    let tab1StatusCalls = 0;

    const makeFetch = (isTab1: boolean) => (input: string) => {
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
        if (isTab1) tab1StatusCalls++;
        return Promise.resolve(new Response(JSON.stringify(
          serverAuthorized
            ? { account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'active', backend_authorized: true, admin: true }
            : { account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'entitlement_required', backend_authorized: false, admin: true }
        ), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-manage')) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok', quantity: 0 }), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-quote')) {
        return Promise.resolve(new Response(JSON.stringify({
          order_id: 'ord-2', quote_id: 'qt-2', quantity: 1, amount: 1234, unit_cents: 1234, total_discount_pct: 0, cadence: 'month',
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-checkout')) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'checkout_ready', checkout_url: 'https://checkout.stripe.com/c/pay/cs_2' }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    };

    const ctrl1 = signupApp.createSignupController({
      document: doc1,
      sessionStorage: storage1,
      broadcastChannel: MockBroadcastChannel,
      initialProfile: TEST_PROFILE,
      sleepFn: () => Promise.resolve(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: makeFetch(true),
      navigateFn: () => {},
    });
    const ctrl2 = signupApp.createSignupController({
      document: doc2,
      sessionStorage: storage2,
      broadcastChannel: MockBroadcastChannel,
      initialProfile: TEST_PROFILE,
      sleepFn: () => Promise.resolve(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      fetch: makeFetch(false),
      navigateFn: () => {},
    });

    await ctrl1.init();
    await ctrl2.init();
    await ctrl1.requestQuote();
    await ctrl2.requestQuote();

    // Tab 1 starts checkout -> Tab 2 suppresses duplicate checkout immediately
    await ctrl1.startCheckout();
    assertEq(ctrl2.getState().siblingCheckoutActive, true, 'Tab 2 detects active checkout in Tab 1');
    assertEq(doc2.getElementById('checkout-btn')!.disabled, true, 'Tab 2 checkout button disabled while Tab 1 in checkout');

    // Spoofed fulfillment_status broadcast when server is NOT authorized must NOT authorize Tab 1
    const rogue = new MockBroadcastChannel('decapod-cloud-coherence');
    const beforeCalls = tab1StatusCalls;
    rogue.postMessage({
      tabId: 'rogue',
      type: 'fulfillment_status',
      projectOrigin: TEST_PROFILE.projectOrigin,
      projectId: 'DecapodLabs/decapod',
      state: 'ready',
      contractVersion: 1,
    });
    await new Promise(r => setTimeout(r, 15));
    assert(tab1StatusCalls > beforeCalls, 'Tab 1 re-queried authoritative server instead of trusting broadcast');
    assertEq(ctrl1.getState().backendAuthorized, false, 'broadcast alone never sets backendAuthorized=true');

    // Now server settles, Tab 2 completes return -> Tab 1 reconciles to backendAuthorized=true
    serverAuthorized = true;
    rogue.postMessage({
      tabId: 'tab-return',
      type: 'checkout_returned',
      projectOrigin: TEST_PROFILE.projectOrigin,
      projectId: 'DecapodLabs/decapod',
      contractVersion: 1,
    });
    await new Promise(r => setTimeout(r, 20));
    assertEq(ctrl1.getState().backendAuthorized, true, 'Tab 1 reconciles authoritatively to backendAuthorized=true');

    for (const m of sentMessages) {
      assert(!JSON.stringify(m).includes('jwt-tab'), 'no JWT leaked in coherence broadcasts');
    }
    rogue.close();
    ctrl1.close();
    ctrl2.close();
  }

  // 3. Reload after ?checkout=returned (URL scrubbed) + Browser Back from Stripe + delayed stale response after repo change
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));
    // Simulate prior ?checkout=returned already scrubbed from URL while checkout_pending remained in sessionStorage
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':checkout_pending', JSON.stringify({
      organization_id: orgId,
      project_id: 'DecapodLabs/decapod',
      repo: 'DecapodLabs/decapod',
      returned: true,
      started_at: now - 30,
    }));

    let pollAttempt = 0;
    const ctrlReload = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      sleepFn: () => Promise.resolve(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
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
          pollAttempt++;
          if (pollAttempt === 1) {
            // Simulate lost acknowledgement / transient 503 on first check
            return Promise.resolve(new Response(JSON.stringify({ error: { code: 'service_unavailable' } }), { status: 503 }));
          }
          if (pollAttempt === 2) {
            return Promise.resolve(new Response(JSON.stringify({ status: 'pending_fulfillment', backend_authorized: false }), { status: 200 }));
          }
          return Promise.resolve(new Response(JSON.stringify({
            account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'active', backend_authorized: true, admin: true,
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });
    await ctrlReload.init();
    assertEq(pollAttempt, 3, 'reload resumed checkout_pending poll and survived transient 503 lost-ack');
    assertEq(ctrlReload.getState().backendAuthorized, true, 'settled cleanly after delayed webhook');
    ctrlReload.close();

    // Browser Back from Stripe without paying (returned: false, server returns entitlement_required)
    const docBack = createSignupDom();
    const storageBack = makeStorage();
    storageBack.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));
    storageBack.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':checkout_pending', JSON.stringify({
      organization_id: orgId,
      project_id: 'DecapodLabs/decapod',
      repo: 'DecapodLabs/decapod',
      returned: false,
      started_at: now - 20,
    }));
    const ctrlBack = signupApp.createSignupController({
      document: docBack,
      sessionStorage: storageBack,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
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
            account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'entitlement_required', backend_authorized: false, admin: true,
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', quantity: 0 }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });
    await ctrlBack.init();
    assertEq(docBack.getElementById('step-checkout')!.hidden, false, 'Browser Back returns to fresh checkout panel');
    assertEq(ctrlBack.getState().backendAuthorized, false, 'Browser Back never grants access');
    assertEq(storageBack.getItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':checkout_pending'), null, 'aborted checkout_pending cleared on Back');
    ctrlBack.close();
  }

  // 4. Strict pending_timeout handling (never falsely reports backend_authorized=true) + delayed stale quote after repo change
  {
    const doc = createSignupDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));
    let resolveSlowQuote: ((r: Response) => void) | null = null;
    let quoteSignal: AbortSignal | null | undefined;

    const ctrl = signupApp.createSignupController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      sleepFn: () => Promise.resolve(),
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
      fetch: (input: string, init?: RequestInit) => {
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
            account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'pending_fulfillment', backend_authorized: false,
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', quantity: 0 }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-quote')) {
          quoteSignal = init?.signal;
          return new Promise<Response>(resolve => { resolveSlowQuote = resolve; });
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });

    await ctrl.init();
    assertEq(doc.getElementById('step-state')!.dataset.stateKind, 'pending_timeout', 'pending_timeout state kind set');
    assertEq(doc.getElementById('step-ready')!.hidden, true, 'step-ready stays hidden on pending_timeout');
    assertEq(doc.getElementById('state-retry-btn')!.hidden, false, 'retry button visible on pending_timeout');
    assertEq(ctrl.getState().backendAuthorized, false, 'backendAuthorized remains false on pending_timeout');
    assert(!doc.getElementById('signup-status')!.textContent.includes('backend_authorized=true'), 'status never reports backend_authorized=true on pending_timeout');

    // Now test delayed stale quote discarded when user switches back to repo picker
    // (Use a second controller directly on entitlement_required -> requestQuote -> click checkout-back-btn)
    const docQ = createSignupDom();
    const storageQ = makeStorage();
    storageQ.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-gh', expires_at: now + 3600, origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrlQ = signupApp.createSignupController({
      document: docQ,
      sessionStorage: storageQ,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/signup?repo=DecapodLabs%2Fdecapod' },
      history: { replaceState: () => {} },
      navigateFn: () => {},
      fetch: (input: string, init?: RequestInit) => {
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
            account_id: accountId, project_id: 'DecapodLabs/decapod', organization_id: orgId, status: 'entitlement_required', backend_authorized: false, admin: true,
          }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-manage')) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', quantity: 0 }), { status: 200 }));
        }
        if (url.pathname.endsWith('/billing-quote')) {
          quoteSignal = init?.signal;
          return new Promise<Response>(resolve => { resolveSlowQuote = resolve; });
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      },
    });
    await ctrlQ.init();
    const quoteP = ctrlQ.requestQuote();
    await new Promise(r => setTimeout(r, 10));
    docQ.getElementById('checkout-back-btn')!.click();
    await new Promise(r => setTimeout(r, 10));
    assert(quoteSignal && quoteSignal.aborted, 'in-flight quote AbortSignal aborted when switching repo');
    resolveSlowQuote!(new Response(JSON.stringify({
      order_id: 'ord-stale', quote_id: 'qt-stale', quantity: 1, amount: 9999, unit_cents: 9999, total_discount_pct: 0, cadence: 'month',
    }), { status: 200 }));
    await quoteP;
    assertEq(docQ.getElementById('quote-summary')!.hidden, true, 'delayed stale quote does not reopen quote summary');
    assertEq(docQ.getElementById('checkout-btn')!.disabled, true, 'checkout stays disabled after repo change');

    ctrl.close();
    ctrlQ.close();
  }
});

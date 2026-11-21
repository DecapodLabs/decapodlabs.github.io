// Offline unit and integration tests for Website #55 (/admin/<org> organization-scoped Admin UI).
// Uses classic script loading + lightweight DOM/storage/fetch mocks with zero network I/O.
import '../cloud-flow.js';
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
const adminApp = (globalThis as any).DecapodAdminApp;
assert(flow && adminApp, 'browser globals exported');

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
  type = 'text';
  className = '';
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
  click() {
    if (this.disabled) return undefined;
    if (this.onclick) return this.onclick({});
    return undefined;
  }
}

class MockDocument {
  elements = new Map<string, MockElement>();
  register(el: MockElement) {
    if (el.id) this.elements.set(el.id, el);
    return el;
  }
  getElementById(id: string) { return this.elements.get(id) ?? null; }
  createElement(tag: string) { return new MockElement(tag); }
  createTextNode(text: string) { const el = new MockElement('#text'); el.textContent = text; return el; }
}

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
  };
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
    'admin-cancel-order-btn', 'admin-billing-portal-btn', 'admin-add-capacity-link',
    'admin-billing-detail', 'admin-refresh-devices-btn', 'admin-devices-status', 'admin-devices-list',
    'admin-recovery-contact-summary', 'admin-recovery-contact-input',
    'admin-set-recovery-contact-btn', 'admin-clear-recovery-contact-btn',
    'admin-refresh-recovery-btn', 'admin-recovery-status'
  ];
  for (const id of ids) {
    const tag = id.endsWith('-select') || id.endsWith('-metric') || id.endsWith('-org') || id.endsWith('-project')
      ? 'select'
      : id.endsWith('-btn')
        ? 'button'
        : 'div';
    doc.register(new MockElement(tag, id));
  }
  doc.getElementById('admin-limit-warn')!.value = '80';
  doc.getElementById('admin-limit-crit')!.value = '95';
  doc.getElementById('admin-limit-notify')!.value = '1';
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

Deno.test('/admin/<org> path parsing accepts valid slugs/UUIDs and rejects XSS, traversal, and malformed routes', () => {
  const pathCase = flow.parseAdminRoute('/admin/DecapodLabs', '');
  assertEq(pathCase.status, 'valid', 'subpath org valid');
  assertEq(pathCase.org, 'DecapodLabs', 'subpath org extracted');
  assertEq(pathCase.source, 'path', 'subpath source');

  const trailingCase = flow.parseAdminRoute('/admin/my_org.1/', '');
  assertEq(trailingCase.status, 'valid', 'trailing slash subpath valid');
  assertEq(trailingCase.org, 'my_org.1', 'trailing slash trimmed');

  const uuid = '20000000-0000-4000-8000-000000000002';
  const uuidCase = flow.parseAdminRoute('/admin/' + uuid, '');
  assertEq(uuidCase.status, 'valid', 'UUID subpath valid');
  assertEq(uuidCase.isUuid, true, 'UUID detected');

  const queryCase = flow.parseAdminRoute('/admin/', '?org=DecapodLabs');
  assertEq(queryCase.status, 'valid', 'query fallback valid');
  assertEq(queryCase.source, 'query', 'query source');
  assertEq(queryCase.org, 'DecapodLabs', 'query org extracted');

  assertEq(flow.parseAdminRoute('/admin/', '').status, 'absent', 'root admin absent');
  assertEq(flow.parseAdminRoute('/admin', '').status, 'absent', 'no-slash admin absent');

  const badRoutes: [string, string][] = [
    ['/admin/<script>alert(1)</script>', ''],
    ['/admin/%3Cscript%3Ealert(1)%3C%2Fscript%3E', ''],
    ['/admin/..', ''],
    ['/admin/.', ''],
    ['/admin/%2e%2e', ''],
    ['/admin/a..b', ''],
    ['/admin/org%2Frepo', ''],
    ['/admin/org%5csecret', ''],
    ['/admin/DecapodLabs/extra', ''],
    ['/admin/DecapodLabs.git', ''],
    ['/admin//DecapodLabs', ''],
    ['/admin/OrgA', '?org=OrgB'],
    ['/admin/', '?org=a&org=b'],
    ['/admin/', '?org=javascript:alert(1)'],
    ['/admin/', '?org=../etc/passwd'],
    ['/other/DecapodLabs', ''],
  ];
  for (const [p, s] of badRoutes) {
    const res = flow.parseAdminRoute(p, s);
    assertEq(res.status, 'invalid', `reject malformed route ${p}${s}`);
    assertEq(res.org, null, `null org on rejected route ${p}${s}`);
  }

  assertEq(flow.buildAdminBrowserPath('/admin/', 'DecapodLabs'), '/admin/?org=DecapodLabs', 'GitHub Pages static-safe path');
  assertEq(flow.buildAdminBrowserPath('/admin/OrgA', 'OrgB'), '/admin/OrgB', 'subpath mode preserves clean URL');
});

Deno.test('admin return URL sanitizer and auth gate fail closed with zero API calls and scrub URL tokens', async () => {
  assertEq(
    flow.sanitizeAdminReturnUrl('https://decapodlabs.ai/admin/DecapodLabs', 'https://decapodlabs.ai'),
    'https://decapodlabs.ai/admin/DecapodLabs',
    'same-origin /admin/<org> allowed'
  );
  for (const bad of [
    'https://evil.example/admin/DecapodLabs',
    'https://decapodlabs.ai.evil.example/admin/',
    'http://decapodlabs.ai/admin/',
    'https://user:pass@decapodlabs.ai/admin/',
    'https://decapodlabs.ai/admin/#access_token=leak',
    'https://decapodlabs.ai/admin/..',
    'https://decapodlabs.ai/admin/a/b',
    'https://decapodlabs.ai/signup',
  ]) {
    assertEq(flow.sanitizeAdminReturnUrl(bad, 'https://decapodlabs.ai'), null, 'reject admin return: ' + bad);
  }

  const doc = createAdminDom();
  const storage = makeStorage();
  const apiCalls: string[] = [];
  const navigations: string[] = [];
  const scrubbed: string[] = [];

  const ctrl = adminApp.createAdminController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: {
      origin: 'https://decapodlabs.ai',
      href: 'https://decapodlabs.ai/admin/DecapodLabs?return_to=https%3A%2F%2Fevil.example#access_token=hostile&provider_token=gho_leak',
      assign: (u: string) => navigations.push(u),
    },
    history: { replaceState: (_s: any, _t: string, url: string) => scrubbed.push(url) },
    fetch: (input: string) => {
      apiCalls.push(input);
      return Promise.resolve(new Response('{}', { status: 500 }));
    },
    navigateFn: (u: string) => navigations.push(u),
  });

  await ctrl.init();
  assertEq(scrubbed[0], '/admin/DecapodLabs', 'query and fragment scrubbed cleanly');
  assertEq(apiCalls.length, 0, 'zero admin/backend API calls while unauthenticated');
  assertEq(ctrl.getState().authenticated, false, 'fragment tokens never authenticate');
  assertEq(doc.getElementById('admin-auth-gate')!.hidden, false, 'auth gate visible');
  assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'admin workspace locked');
  assertEq(doc.getElementById('admin-account-bar')!.hidden, true, 'account bar hidden');

  doc.getElementById('admin-auth-github')!.click();
  await new Promise(r => setTimeout(r, 15));
  assertEq(navigations.length, 1, 'PKCE login navigated');
  const authUrl = new URL(navigations[0]);
  assertEq(authUrl.origin + authUrl.pathname, 'https://api.decapodlabs.ai/auth', 'uses api.decapodlabs.ai/auth');
  assertEq(authUrl.searchParams.get('code_challenge_method'), 's256', 'PKCE S256');
  assertEq(new URL(authUrl.searchParams.get('return_to')!).pathname, '/admin/', 'returns cleanly to /admin/');
});

Deno.test('unaffiliated, non-admin, and ambiguous org paths fail closed without calling org-scoped APIs', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgAdminUuid = '20000000-0000-4000-8000-000000000002';
  const orgMemberUuid = '30000000-0000-4000-8000-000000000003';
  const now = Math.floor(Date.now() / 1000);

  const orgsFixture = [
    { id: 'org:1', cloud_org_id: orgAdminUuid, scm_provider: 'github', scm_owner_slug: 'AdminOrg', admin: true },
    { id: 'org:2', cloud_org_id: orgMemberUuid, scm_provider: 'github', scm_owner_slug: 'MemberOnlyOrg', admin: false },
  ];

  // Pure resolver checks
  assertEq(flow.resolveAdminOrganization(orgsFixture, 'adminorg').status, 'authorized', 'case-insensitive slug resolves');
  assertEq(flow.resolveAdminOrganization(orgsFixture, 'adminorg').org.cloud_org_id, orgAdminUuid, 'resolves to canonical UUID');
  assertEq(flow.resolveAdminOrganization(orgsFixture, 'MemberOnlyOrg').reason, 'admin_required', 'non-admin member denied');
  assertEq(flow.resolveAdminOrganization(orgsFixture, 'UnaffiliatedOrg').reason, 'organization_access_denied', 'unaffiliated org denied');
  assertEq(flow.listAdminOrganizations(orgsFixture).length, 1, 'org switcher excludes non-admin orgs');

  const ambiguous = [
    { id: 'org:1', cloud_org_id: orgAdminUuid, scm_owner_slug: 'SameSlug', admin: true },
    { id: 'org:2', cloud_org_id: orgMemberUuid, scm_owner_slug: 'SameSlug', admin: true },
  ];
  assertEq(flow.resolveAdminOrganization(ambiguous, 'SameSlug').reason, 'ambiguous_organization', 'ambiguous slug fails closed');

  // Controller denial for unaffiliated /admin/SecretOrg
  const doc = createAdminDom();
  const storage = makeStorage();
  storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-user',
    expires_at: now + 3600,
    origin: TEST_PROFILE.projectOrigin,
  }));
  const calledPaths: string[] = [];
  const ctrl = adminApp.createAdminController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/SecretOrg' },
    history: { replaceState: () => {} },
    fetch: (input: string) => {
      const url = new URL(input);
      calledPaths.push(url.pathname);
      if (url.pathname === '/auth/v1/user') {
        return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
      }
      if (url.pathname.endsWith('/account-register')) {
        return Promise.resolve(new Response(JSON.stringify({
          account_id: accountId,
          status: 'registered',
          organizations: orgsFixture,
          projects: [],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 500 }));
    },
    navigateFn: () => {},
  });
  await ctrl.init();
  assertEq(doc.getElementById('admin-denied-panel')!.hidden, false, 'denied panel shown for unaffiliated org');
  assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace stays hidden on denial');
  assertEq(doc.getElementById('admin-open-authorized-org-btn')!.hidden, false, 'user can jump to their own authorized org');
  assert(!calledPaths.some(p => p.includes('billing') || p.includes('resource-limits') || p.includes('org-admins')), 'zero org-scoped API calls for denied org');
});

Deno.test('multi-org switcher isolates org scope, stale async replies, and supports zero-seat Admin operations', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgAUuid = '20000000-0000-4000-8000-000000000002';
  const orgBUuid = '30000000-0000-4000-8000-000000000003';
  const deviceId = '40000000-0000-4000-8000-000000000004';
  const now = Math.floor(Date.now() / 1000);

  const doc = createAdminDom();
  const storage = makeStorage();
  storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
    access_token: 'jwt-admin',
    expires_at: now + 3600,
    origin: TEST_PROFILE.projectOrigin,
  }));

  const calls: { path: string; body: any }[] = [];
  const navigations: string[] = [];
  let resolveSlowOrgAMembers: ((res: Response) => void) | null = null;

  const ctrl = adminApp.createAdminController({
    document: doc,
    sessionStorage: storage,
    initialProfile: TEST_PROFILE,
    location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/OrgA' },
    history: { replaceState: () => {} },
    navigateFn: (u: string) => navigations.push(u),
    fetch: (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ path: url.pathname, body });

      if (url.pathname === '/auth/v1/user') {
        return Promise.resolve(new Response(JSON.stringify({
          id: accountId,
          identities: [{ provider: 'github', user_id: accountId, id: '42' }],
        }), { status: 200 }));
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
            projects: [
              { project_id: 'OrgA/repo-a', name: 'OrgA/repo-a' },
              { project_id: 'OrgB/repo-b', name: 'OrgB/repo-b' },
            ],
          }), { status: 200 }));
        }
        if (body.operation === 'members') {
          if (body.organization_id === 'org:a') {
            return new Promise<Response>(resolve => {
              resolveSlowOrgAMembers = resolve;
            });
          }
          return Promise.resolve(new Response(JSON.stringify({
            status: 'members',
            account_id: accountId,
            organization_id: body.organization_id,
            members: [{ slot: 1, account_id: accountId, role: 'owner', providers: ['github'], assigned_projects: [] }],
            next: null,
          }), { status: 200 }));
        }
        if (body.operation === 'invitations') {
          return Promise.resolve(new Response(JSON.stringify({ invitations: [], next: null }), { status: 200 }));
        }
      }
      if (url.pathname.endsWith('/account-status')) {
        const isA = body.project_id === 'OrgA/repo-a';
        return Promise.resolve(new Response(JSON.stringify({
          account_id: accountId,
          project_id: body.project_id,
          organization_id: isA ? 'org:a' : 'org:b',
          cloud_org_id: isA ? orgAUuid : orgBUuid,
          status: 'entitlement_required',
          backend_authorized: false,
          repo_assigned: false,
          admin: true,
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-manage')) {
        return Promise.resolve(new Response(JSON.stringify({
          quantity: 1,
          cadence: 'month',
          capacities: [{ project_id: body.organization_id === 'org:a' ? 'OrgA/repo-a' : 'OrgB/repo-b', capacity: 1, assigned: 0 }],
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-portal')) {
        return Promise.resolve(new Response(JSON.stringify({ portal_url: 'https://billing.stripe.com/p/session/test_ok' }), { status: 200 }));
      }
      if (url.pathname.endsWith('/org-admins')) {
        return Promise.resolve(new Response(JSON.stringify({
          admin_revision: 3,
          authority_generation: 2,
          primary_owner_account_id: accountId,
          actor_role: 'owner',
          admins: [{ account_id: accountId, role: 'owner' }],
          pending_invitations: [],
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/policy-templates')) {
        if (body.operation === 'export') {
          return Promise.resolve(new Response(JSON.stringify({ template: { template_version: 1, policy_config: { max_delegated_tier: 2 } } }), { status: 200 }));
        }
        if (body.operation === 'preview') {
          return Promise.resolve(new Response(JSON.stringify({ status: 'preview_ready' }), { status: 200 }));
        }
        if (body.operation === 'import') {
          return Promise.resolve(new Response(JSON.stringify({ status: 'imported' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ audit_entries: [] }), { status: 200 }));
      }
      if (url.pathname.endsWith('/org-recovery')) {
        return Promise.resolve(new Response(JSON.stringify({ contact_account_id: body.contact_account_id || null, revision: 1 }), { status: 200 }));
      }
      if (url.pathname.endsWith('/billing-overage-policy')) {
        return Promise.resolve(new Response(JSON.stringify({
          status: 'ok',
          window_month: '2026-11',
          paid_overages: {
            opted_in: true,
            monthly_spend_cap_cents: body.monthly_spend_cap_cents || 7500,
            spent_cents: 0,
            remaining_spend_cents: body.monthly_spend_cap_cents || 7500,
            spend_cap_status: 'within_cap',
            consent_receipt_id: 'rcpt-1',
            revision: 3,
          },
          metrics: [{ metric: 1, key: 'egress_bytes', category: 'network_transfer', unit: 'bytes', window: 'month', used: 1024, remaining: 4096, effective_limit: 5120, operating_limit: null, warning_pct: 80, critical_pct: 95, notify_flags: 1, alert_state: 'ok', revision: 1 }],
          alerts: [],
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/resource-limits')) {
        return Promise.resolve(new Response(JSON.stringify({
          status: 'ok',
          window_month: '2026-11',
          paid_overages: {
            opted_in: true,
            monthly_spend_cap_cents: 5000,
            spent_cents: 4200,
            remaining_spend_cents: 800,
            spend_cap_status: 'warning',
            spend_utilization_pct: 84,
            revision: 2,
          },
          metrics: [{ metric: 1, key: 'egress_bytes', category: 'network_transfer', unit: 'bytes', window: 'month', used: 1024, remaining: 4096, effective_limit: 5120, operating_limit: null, warning_pct: 80, critical_pct: 95, notify_flags: 1, alert_state: 'ok', revision: 1 }],
          alerts: [],
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/device-keys')) {
        return Promise.resolve(new Response(JSON.stringify({
          version: 1,
          status: 'keys',
          account_id: accountId,
          device_keys: [{
            device_key_id: deviceId,
            account_id: accountId,
            jkt: 'j'.repeat(43),
            label: 'MacBook Pro',
            enrolled_aal: 'aal2',
            enrolled_at: '2026-11-21T10:00:00Z',
            last_seen_at: '2026-11-21T12:00:00Z',
            revoked_at: null,
            status: 'active',
          }],
        }), { status: 200 }));
      }
      if (url.pathname.endsWith('/device-revoke')) {
        return Promise.resolve(new Response(JSON.stringify({ version: 1, status: 'device_revoked', device_key_id: deviceId }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    },
  });

  // Start OrgA load (members request intentionally held pending)
  const initPromise = ctrl.init();
  await new Promise(r => setTimeout(r, 30));
  assertEq(ctrl.getState().activeOrg.cloud_org_id, orgAUuid, 'OrgA bound by canonical cloud_org_id');
  assertEq(doc.getElementById('admin-repos-list')!.children.length, 1, 'OrgA sees only OrgA repo');
  assert(doc.getElementById('admin-repos-list')!.textContent.includes('No repo seat (governance data denied)'), 'zero-seat orthogonality visible');
  assert(doc.getElementById('admin-overage-status')!.textContent.includes('80%+ SPEND CAP WARNING'), '80% spend-cap warning rendered');

  // Switch to OrgB while OrgA members request is still pending!
  await ctrl.switchOrganization(orgBUuid);
  assertEq(ctrl.getState().activeOrg.cloud_org_id, orgBUuid, 'switched to OrgB canonical UUID');
  assertEq(doc.getElementById('admin-active-org-uuid')!.textContent, orgBUuid, 'OrgB UUID displayed');
  assertEq(doc.getElementById('admin-repos-list')!.children.length, 1, 'OrgB sees only OrgB repo');
  assert(doc.getElementById('admin-repos-list')!.textContent.includes('OrgB/repo-b'), 'OrgB repo displayed');
  assert(!doc.getElementById('admin-repos-list')!.textContent.includes('OrgA/repo-a'), 'zero OrgA leak in OrgB DOM');

  // Late response from OrgA arrives now — must be ignored by generation guard!
  resolveSlowOrgAMembers!(new Response(JSON.stringify({
    status: 'members',
    account_id: accountId,
    organization_id: 'org:a',
    members: [{ slot: 99, account_id: '99999999-0000-4000-8000-000000000099', role: 'member', providers: ['github'], assigned_projects: ['OrgA/secret'] }],
    next: null,
  }), { status: 200 }));
  await initPromise;
  await new Promise(r => setTimeout(r, 20));
  assert(!doc.getElementById('admin-members-list')!.textContent.includes('OrgA/secret'), 'stale OrgA response blocked from OrgB DOM');

  // Zero governance-data query/batch endpoints called by Admin UI
  assert(!calls.some(c => c.path.includes('cloud-query') || c.path.includes('cloud-batch') || c.path.includes('/decapod/')), 'zero repo task/event/evidence API calls');

  // Billing portal deep link verified against Stripe hosts
  await doc.getElementById('admin-billing-portal-btn')!.click();
  assertEq(navigations[0], 'https://billing.stripe.com/p/session/test_ok', 'Stripe Billing Portal deep-link allowed');

  // Exercise Wave 2 Admin operations (delegation grant, policy template export/preview/import,
  // recovery contact, resource limit update, overage spend-cap enable, device admin_revoke).
  const targetMember = '50000000-0000-4000-8000-000000000005';
  doc.getElementById('admin-delegate-account')!.value = targetMember;
  await doc.getElementById('admin-grant-admin-btn')!.click();
  assert(calls.some(c => c.path.endsWith('/org-admins') && c.body?.operation === 'grant' && c.body?.expected_revision === 3), 'org-admins grant with CAS revision');

  doc.getElementById('admin-template-source-project')!.value = 'OrgB/repo-b';
  doc.getElementById('admin-template-target-org')!.value = orgAUuid;
  doc.getElementById('admin-template-target-project')!.value = 'OrgA/repo-a';
  await doc.getElementById('admin-export-template-btn')!.click();
  await doc.getElementById('admin-preview-template-btn')!.click();
  await doc.getElementById('admin-import-template-btn')!.click();
  assert(calls.some(c => c.path.endsWith('/policy-templates') && c.body?.operation === 'export'), 'policy-templates export');
  assert(calls.some(c => c.path.endsWith('/policy-templates') && c.body?.operation === 'preview'), 'policy-templates preview');
  assert(calls.some(c => c.path.endsWith('/policy-templates') && c.body?.operation === 'import'), 'policy-templates import');

  doc.getElementById('admin-recovery-contact-input')!.value = targetMember;
  await doc.getElementById('admin-set-recovery-contact-btn')!.click();
  assert(calls.some(c => c.path.endsWith('/org-recovery') && c.body?.operation === 'set_recovery_contact'), 'org-recovery contact saved');

  doc.getElementById('admin-limit-cap')!.value = '8192';
  await doc.getElementById('admin-save-limit-btn')!.click();
  assert(calls.some(c => c.path.endsWith('/resource-limits') && c.body?.action === 'set_limit' && c.body?.operating_limit === 8192), 'resource-limits CAS update');

  doc.getElementById('admin-overage-cap-usd')!.value = '75.00';
  doc.getElementById('admin-overage-terms-check')!.checked = true;
  await doc.getElementById('admin-overages-enable-btn')!.click();
  assert(calls.some(c => c.path.endsWith('/billing-overage-policy') && c.body?.action === 'enable' && c.body?.monthly_spend_cap_cents === 7500), 'billing-overage-policy spend cap');

  const deviceRowBtn = doc.getElementById('admin-devices-list')!.children[0]?.children.find(c => c.tagName === 'button');
  assert(deviceRowBtn, 'device revoke button rendered');
  await deviceRowBtn!.click();
  assert(calls.some(c => c.path.endsWith('/device-revoke') && c.body?.action === 'admin_revoke' && c.body?.device_key_id === deviceId), 'device admin_revoke called');
});

Deno.test('revoked admin (403), expired token (401), and authenticated malformed route fail closed immediately', async () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const orgUuid = '20000000-0000-4000-8000-000000000002';
  const now = Math.floor(Date.now() / 1000);

  // 1. Mid-session 403 admin_required hides workspace immediately
  {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-revoked-later',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/OrgA' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
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
        if (url.pathname.endsWith('/billing-portal')) {
          return Promise.resolve(new Response(JSON.stringify({ error: { code: 'admin_required' } }), { status: 403 }));
        }
        if (url.pathname.endsWith('/device-keys')) {
          return Promise.resolve(new Response(JSON.stringify({ version: 1, status: 'keys', account_id: accountId, device_keys: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ invitations: [], members: [], admins: [], metrics: [], alerts: [] }), { status: 200 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('admin-workspace')!.hidden, false, 'workspace initially open');
    doc.getElementById('admin-billing-portal-btn')!.disabled = false;
    await doc.getElementById('admin-billing-portal-btn')!.click();
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace closed immediately on 403 admin_required');
    assertEq(doc.getElementById('admin-denied-panel')!.hidden, false, 'denied panel surfaced');
  }

  // 2. 401 invalid_token clears session and returns to auth gate
  {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-expired',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/OrgA' },
      history: { replaceState: () => {} },
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: { code: 'invalid_token' } }), { status: 401 })),
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(ctrl.getState().authenticated, false, '401 clears stored session');
    assertEq(doc.getElementById('admin-auth-gate')!.hidden, false, 'auth gate restored on 401');
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace stays locked');
  }

  // 3. Authenticated visit to malformed /admin/%3Cscript%3E fails closed
  {
    const doc = createAdminDom();
    const storage = makeStorage();
    storage.setItem('decapod-portal:' + TEST_PROFILE.projectOrigin + ':session', JSON.stringify({
      access_token: 'jwt-ok',
      expires_at: now + 3600,
      origin: TEST_PROFILE.projectOrigin,
    }));
    const ctrl = adminApp.createAdminController({
      document: doc,
      sessionStorage: storage,
      initialProfile: TEST_PROFILE,
      location: { origin: 'https://decapodlabs.ai', href: 'https://decapodlabs.ai/admin/%3Cscript%3E' },
      history: { replaceState: () => {} },
      fetch: (input: string) => {
        const url = new URL(input);
        if (url.pathname === '/auth/v1/user') {
          return Promise.resolve(new Response(JSON.stringify({ id: accountId, identities: [{ provider: 'github', user_id: accountId }] }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          account_id: accountId,
          status: 'registered',
          organizations: [{ id: 'org:a', cloud_org_id: orgUuid, scm_provider: 'github', scm_owner_slug: 'OrgA', admin: true }],
          projects: [],
        }), { status: 200 }));
      },
      navigateFn: () => {},
    });
    await ctrl.init();
    assertEq(doc.getElementById('admin-denied-panel')!.hidden, false, 'malformed route fails closed to denied panel');
    assertEq(doc.getElementById('admin-workspace')!.hidden, true, 'workspace stays locked on malformed route');
    assert(!doc.getElementById('admin-route-banner-title')!.textContent.includes('<script>'), 'hostile route never echoed');
  }
});

Deno.test('admin HTML/JS/CSS/docs pass static verification, zero unsafe DOM sinks, and public-repo confidentiality', async () => {
  const siteOrigin = 'https://site.invalid';
  const docIds = new Map<string, string[]>();
  const resolveTarget = (url: URL) => {
    if (url.pathname === '/') return 'index.html';
    if (url.pathname === '/pricing' || url.pathname === '/pricing/') return 'pricing/index.html';
    if (url.pathname === '/signup' || url.pathname === '/signup/') return 'signup/index.html';
    if (url.pathname === '/admin' || url.pathname === '/admin/') return 'admin/index.html';
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

  for (const docPath of ['index.html', 'offerings.html', 'pricing.html', 'pricing/index.html', 'signup/index.html', 'admin/index.html', 'proof.html', 'tecr.html']) {
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

  const adminHtml = await Deno.readTextFile('admin/index.html');
  assert(adminHtml.includes('noindex,nofollow'), 'admin noindex');
  assert(adminHtml.includes('no-referrer'), 'admin no-referrer');

  for (const scriptPath of ['main.js', 'cloud-flow.js', 'pricing.js', 'signup/signup.js', 'admin/admin.js']) {
    new Function(await Deno.readTextFile(scriptPath));
  }
  for (const scriptPath of ['cloud-flow.js', 'pricing.js', 'signup/signup.js', 'admin/admin.js']) {
    const src = await Deno.readTextFile(scriptPath);
    assert(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(src), 'no unsafe DOM sink in ' + scriptPath);
  }

  const forbidden: [string, RegExp][] = [
    ['stripe_object_id', new RegExp('\\b(?:price|prod|acct|bpc)_[A-Za-z0-9]{10,}\\b')],
    ['stripe_secret_key', new RegExp('\\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{8,}\\b')],
    ['stripe_webhook_secret', new RegExp('\\bwhsec_[A-Za-z0-9]{8,}\\b')],
    ['private_migration_file', new RegExp('\\b0\\d{2}_[a-z0-9_]+\\.sql\\b')],
    ['private_rpc_name', new RegExp('\\bpropodus_[a-z_]+_v\\d+\\b')],
    ['private_schema_symbol', new RegExp('\\bpropodus\\.[a-z_]+\\b')],
    ['private_internal_path', new RegExp('\\binternal\\/backend\\b')],
  ];
  for (const file of [
    'cloud-flow.js', 'admin/index.html', 'admin/admin.js', 'admin/admin.css',
    'docs/decisions/0010-admin-route-hosting.md', 'tests/admin_test.ts',
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

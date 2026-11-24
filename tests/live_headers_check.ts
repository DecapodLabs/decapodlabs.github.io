// Read-only live deployment verification for Issue #70.
// Performs GET requests only against deployed Decapod Cloud web and discovery endpoints.
// Zero state mutations, zero credentials, zero paid infrastructure.

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('live_check_failed: ' + msg);
};

async function fetchReadOnly(url: string) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

const pricing = await fetchReadOnly('https://decapodlabs.ai/pricing/');
assert(pricing.status === 200, 'pricing status 200');
assert(pricing.body.includes('UNDER WRAPS'), 'live pricing preserves UNDER WRAPS');
assert(pricing.body.includes('cloud-flow.js'), 'live pricing loads cloud-flow.js');

const signup = await fetchReadOnly('https://decapodlabs.ai/signup/');
assert(signup.status === 200, 'signup status 200');
assert(signup.body.includes('noindex,nofollow'), 'live signup has noindex,nofollow');
assert(signup.body.includes('no-referrer'), 'live signup has no-referrer');
assert(signup.body.includes('cloud-flow.js'), 'live signup loads cloud-flow.js');

const pagesAdmin = await fetchReadOnly('https://decapod-cloud-admin.pages.dev/');
assert(pagesAdmin.status === 200, 'decapod-cloud-admin.pages.dev status 200');
assert(pagesAdmin.headers.get('cache-control')?.includes('no-store'), 'pages admin cache-control no-store');
assert(pagesAdmin.headers.get('referrer-policy') === 'no-referrer', 'pages admin referrer-policy no-referrer');
assert(pagesAdmin.headers.get('x-content-type-options') === 'nosniff', 'pages admin nosniff');
const adminCsp = pagesAdmin.headers.get('content-security-policy') || '';
assert(adminCsp.includes("frame-ancestors 'none'") && adminCsp.includes('https://goyxpcmxetztjlrrcwew.supabase.co'), 'pages admin strict CSP & pinned connect-src');

const providers = await fetchReadOnly('https://api.decapodlabs.ai/auth/providers');
assert(providers.status === 200, '/auth/providers status 200');
assert(providers.headers.get('cache-control')?.includes('no-store'), '/auth/providers cache-control no-store');
assert(providers.headers.get('decapod-cloud-contract-version')?.startsWith('1.'), '/auth/providers contract version 1.x');
assert(providers.headers.get('referrer-policy') === 'no-referrer', '/auth/providers referrer-policy no-referrer');
assert(providers.headers.get('x-content-type-options') === 'nosniff', '/auth/providers nosniff');
const providersJson = JSON.parse(providers.body);
assert(providersJson.version === 1 && typeof providersJson.auth_providers === 'object', '/auth/providers JSON schema v1');

const config = await fetchReadOnly('https://api.decapodlabs.ai/functions/v1/decapod-onboarding/config?include_auth_providers=true');
assert(config.status === 200, '/config status 200');
assert(config.headers.get('cache-control')?.includes('no-store'), '/config cache-control no-store');
assert(config.headers.get('decapod-cloud-contract-version')?.startsWith('1.'), '/config contract version 1.x');
const configJson = JSON.parse(config.body);
assert(
  configJson.version === 1 &&
  configJson.project_origin === 'https://goyxpcmxetztjlrrcwew.supabase.co' &&
  typeof configJson.publishable_key === 'string' &&
  configJson.publishable_key.startsWith('sb_publishable_'),
  '/config trusted project_origin and publishable_key'
);

console.log(JSON.stringify({
  scope: 'live_readonly_headers',
  pricing_status: pricing.status,
  pricing_cache_control: pricing.headers.get('cache-control'),
  signup_status: signup.status,
  signup_cache_control: signup.headers.get('cache-control'),
  pages_admin_status: pagesAdmin.status,
  pages_admin_cache_control: pagesAdmin.headers.get('cache-control'),
  auth_providers_status: providers.status,
  auth_providers_cache_control: providers.headers.get('cache-control'),
  auth_providers_contract_version: providers.headers.get('decapod-cloud-contract-version'),
  auth_providers: providersJson.auth_providers,
  config_status: config.status,
  config_cache_control: config.headers.get('cache-control'),
  config_contract_version: config.headers.get('decapod-cloud-contract-version'),
  config_project_origin: configJson.project_origin,
  config_schema: configJson.schema ?? null,
}));

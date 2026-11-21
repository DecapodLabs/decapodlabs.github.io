// Local source qualification only: no network, account or payment authority.
import { verifyLaunch } from './check-launch.ts';
const origin = 'https://site.invalid';
const documents = new Map<string, string[]>();
function localTarget(reference: string, document: string): URL | null {
  const url = new URL(reference, new URL(document, origin + '/'));
  if (url.username || url.password || !['https:', 'mailto:'].includes(url.protocol)) throw Error('unsafe_document_reference');
  return url.origin === origin ? url : null;
}
function targetPath(url: URL): string {
  if (url.pathname === '/') return 'index.html';
  if (url.pathname === '/pricing' || url.pathname === '/pricing/') return 'pricing/index.html';
  if (url.pathname === '/signup' || url.pathname === '/signup/') return 'signup/index.html';
  return decodeURIComponent(url.pathname.slice(1));
}
function requireFragment(url: URL, ids: readonly string[]): void {
  if (url.hash && !ids.includes(decodeURIComponent(url.hash.slice(1)))) throw Error('missing_fragment_target');
}
// The same fragment can belong to a different document. Root-relative links
// resolve to index; fragment-only links resolve to the referring document.
const fixtureIds: Record<string, string[]> = {'index.html':['root'], 'pricing.html':['local'], 'pricing/index.html':['local'], 'signup/index.html':['main']};
for (const [reference, shouldPass] of [['/#root',true], ['#local',true], ['/#local',false], ['pricing.html#root',false], ['/pricing#local',true], ['/signup#main',true]] as const) {
  const url = localTarget(reference, 'pricing.html')!;
  let passed = true;
  try { requireFragment(url, fixtureIds[targetPath(url)]); }
  catch (error) { if (!(error instanceof Error) || error.message !== 'missing_fragment_target') throw error; passed = false; }
  if (passed !== shouldPass) throw Error('fragment_resolution_regression');
}
async function documentIds(path: string): Promise<string[]> {
  if (!documents.has(path)) {
    const html = await Deno.readTextFile(path);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
    if (new Set(ids).size !== ids.length) throw Error('duplicate_document_id');
    documents.set(path, ids);
  }
  return documents.get(path)!;
}
const htmlDocuments = ['index.html', 'offerings.html', 'pricing.html', 'pricing/index.html', 'signup/index.html', 'proof.html', 'tecr.html'];
let localAssets = 0, anchors = 0;
for (const document of htmlDocuments) {
  const html = await Deno.readTextFile(document);
  await documentIds(document);
  const references = [...html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)].map(x => x[1]);
  for (const reference of references) {
    const url = localTarget(reference, document);
    if (!url) continue;
    const path = targetPath(url);
    const info = await Deno.stat(path);
    if (!info.isFile || info.size === 0) throw Error('missing_or_empty_document_asset');
    localAssets++;
    if (url.hash) {
      requireFragment(url, await documentIds(path));
      anchors++;
    }
  }
  if (!html.includes('lang="en"') || !/<meta\s+name="viewport"/i.test(html)) throw Error('missing_document_accessibility_baseline');
}
// Compile classic browser scripts without executing browser effects or requiring
// a synthetic DOM.
const browserScripts = ['main.js', 'cloud-flow.js', 'pricing.js', 'signup/signup.js'];
for (const script of browserScripts) {
  new Function(await Deno.readTextFile(script));
}
// Enforce DOM injection hygiene and public-repo confidentiality across authored website files.
const forbiddenPatterns: [string, RegExp][] = [
  ['stripe_object_id', /\b(?:price|prod|acct|bpc)_[A-Za-z0-9]{10,}\b/],
  ['stripe_secret_key', /\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{8,}\b/],
  ['stripe_webhook_secret', /\bwhsec_[A-Za-z0-9]{8,}\b/],
  ['private_migration_file', /\b0\d{2}_[a-z0-9_]+\.sql\b/],
  ['private_rpc_name', /\bpropodus_[a-z_]+_v\d+\b/],
  ['private_schema_symbol', /\bpropodus\.[a-z_]+\b/],
  ['private_internal_path', /\binternal\/backend\b/],
];
const checkedSurfaceFiles = [
  'index.html', 'pricing.html', 'pricing/index.html', 'pricing.js', 'pricing.css',
  'cloud-flow.js', 'signup/index.html', 'signup/signup.js', 'signup/signup.css',
  'scripts/check-site.ts', 'tests/pricing_signup_test.ts',
];
for (const file of checkedSurfaceFiles) {
  const content = await Deno.readTextFile(file);
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(content)) throw Error('confidentiality_leak_' + label + '_in_' + file);
  }
}
for (const script of ['cloud-flow.js', 'pricing.js', 'signup/signup.js']) {
  const source = await Deno.readTextFile(script);
  if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(source)) {
    throw Error('unsafe_dom_sink_in_' + script);
  }
}
for (const pricingDoc of ['pricing.html', 'pricing/index.html']) {
  const html = await Deno.readTextFile(pricingDoc);
  if (!html.includes('UNDER WRAPS') || !html.includes('id="cloud-pay-cta"') || !html.includes('id="preview-checkout"')) {
    throw Error('pricing_under_wraps_contract_broken_' + pricingDoc);
  }
  if (!/id="cloud-pay-cta"[^>]*\bdisabled\b/.test(html) || !/id="preview-checkout"[^>]*\bdisabled\b/.test(html)) {
    throw Error('pricing_pay_cta_must_default_disabled_' + pricingDoc);
  }
}
if (!localAssets || !anchors) throw Error('unexpected_document_shape');
await verifyLaunch();
console.log(JSON.stringify({scope:'static_source',documents:htmlDocuments.length,local_assets:localAssets,fragment_links:anchors,javascript_compiled:true,fragment_resolution_controls:6,confidentiality_checked:checkedSurfaceFiles.length,hosted_purchase_verified:false}));

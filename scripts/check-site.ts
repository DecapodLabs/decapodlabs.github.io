// Local source qualification only: no network, account or payment authority.
let localAssets = 0, anchors = 0;
const documents = ['index.html', 'offerings.html', 'pricing.html'];
const publicSources = new Map<string, string>();
for (const document of documents) {
const html = await Deno.readTextFile(document);
publicSources.set(document, html);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
if (new Set(ids).size !== ids.length) throw Error('duplicate_document_id');
const references = [...html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)].map(x => x[1]);
for (const reference of references) {
  const url = new URL(reference, 'https://site.invalid/');
  if (url.username || url.password || !['https:', 'mailto:'].includes(url.protocol)) throw Error('unsafe_document_reference');
  if (url.origin !== 'https://site.invalid') continue;
  if (url.pathname === '/' && url.hash) {
    if (!ids.includes(decodeURIComponent(url.hash.slice(1)))) throw Error('missing_fragment_target');
    anchors++; continue;
  }
  if (url.pathname === '/') continue;
  const path = '.' + decodeURIComponent(url.pathname);
  const info = await Deno.stat(path);
  if (!info.isFile || info.size === 0) throw Error('missing_or_empty_document_asset');
  if (/\.(?:css|js)$/i.test(path)) publicSources.set(path, await Deno.readTextFile(path));
  localAssets++;
}
if (!html.includes('lang="en"') || !/<meta\s+name="viewport"/i.test(html)) throw Error('missing_document_accessibility_baseline');
}
// Compile the actual script without executing browser effects or requiring a
// synthetic DOM. This catches JavaScript syntax failures without a new bundler.
for (const script of ['main.js', 'pricing.js']) {
  const source = await Deno.readTextFile(script);
  new Function(source);
  publicSources.set(script, source);
}
if (!localAssets || !anchors) throw Error('unexpected_document_shape');
// Known-sensitive shapes are rejected without printing matched content. This is
// a bounded source guard, not a complete secret-history or browser audit.
function checkPublic(source: string) {
  const sensitive = [
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}/,
    /\bwhsec_[A-Za-z0-9]{12,}/,
    /\b(?:acct|price|prod|bpc)_[A-Za-z0-9]{12,}/,
    /\b(?:sbp_[A-Za-z0-9]{24,}|sb_secret_[A-Za-z0-9_-]{12,})/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^\s/]+:[^\s/]+@/,
    /\/Users\/[^\s/]+\/(?:\.local|\.supabase|\.codex|src)\//,
  ];
  if (sensitive.some(pattern => pattern.test(source))) throw Error('sensitive_public_source');
  if (/https:\/\/(?:buy|checkout|billing)\.stripe\.com\b/i.test(source)) throw Error('active_purchase_destination');
}
function checkPreview(html: string, script: string) {
  checkPublic(html); checkPublic(script);
  if (/\$\s*\d/.test(html + script)) throw Error('premature_public_price');
  if (!/coming soon/i.test(html) || !html.includes('$X')) throw Error('missing_preview_availability');
  const controls = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)]
    .map(match => match[0]).filter(button => /coming soon/i.test(button));
  if (controls.length < 2 || controls.some(button => !/^<button\b[^>]*\sdisabled(?:\s|>|=)/i.test(button))) throw Error('purchase_control_enabled');
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(script)) throw Error('preview_network_effect');
  if (!html.includes('https://decapodlabs.github.io/decapod/quickstart.html')) throw Error('missing_quickstart_destination');
}
for (const source of publicSources.values()) checkPublic(source);
const preview = publicSources.get('pricing.html')!;
const pricingScript = publicSources.get('pricing.js')!;
checkPreview(preview, pricingScript);
let rejected = 0;
function mustReject(check: () => void, expected: string) {
  try { check(); } catch (error) {
    if (error instanceof Error && error.message === expected) { rejected++; return; }
    throw error;
  }
  throw Error('negative_source_guard_failed');
}
// Deliberately generated synthetic shapes; no real account, credential or price.
for (const prefix of ['sk_' + 'live_', 'rk_' + 'test_', 'wh' + 'sec_', 'ac' + 'ct_', 'pri' + 'ce_']) {
  mustReject(() => checkPublic(prefix + 'x'.repeat(40)), 'sensitive_public_source');
}
mustReject(() => checkPreview(preview + '$' + '1', pricingScript), 'premature_public_price');
mustReject(() => checkPreview(preview.replace(/\sdisabled(?=[\s>])/g, ''), pricingScript), 'purchase_control_enabled');
mustReject(() => checkPublic('https://checkout' + '.stripe.com/c/fixture'), 'active_purchase_destination');
mustReject(() => checkPreview(preview, pricingScript + '\n' + 'fet' + 'ch("https://invalid.example/")'), 'preview_network_effect');
console.log(JSON.stringify({scope:'static_source',documents:documents.length,local_assets:localAssets,fragment_links:anchors,javascript_compiled:2,public_preview_guard:true,synthetic_rejections:rejected,hosted_purchase_verified:false}));

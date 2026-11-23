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
  const path = decodeURIComponent(url.pathname.slice(1));
  return url.pathname.endsWith('/') ? path + 'index.html' : path;
}
function requireFragment(url: URL, ids: readonly string[]): void {
  if (url.hash && !ids.includes(decodeURIComponent(url.hash.slice(1)))) throw Error('missing_fragment_target');
}
// The same fragment can belong to a different document. Root-relative links
// resolve to index; fragment-only links resolve to the referring document.
const fixtureIds: Record<string, string[]> = {'index.html':['root'], 'pricing.html':['local'], 'clack/index.html':['main']};
for (const [reference, shouldPass] of [['/#root',true], ['#local',true], ['/#local',false], ['pricing.html#root',false], ['/clack/#main',true]] as const) {
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
let localAssets = 0, anchors = 0;
const publicDocuments = ['index.html', 'offerings.html', 'pricing.html', 'proof.html', 'clack/index.html'];
for (const document of publicDocuments) {
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
// Compile the actual script without executing browser effects or requiring a
// synthetic DOM. This catches JavaScript syntax failures without a new bundler.
for (const script of ['main.js', 'pricing.js']) new Function(await Deno.readTextFile(script));
if (!localAssets || !anchors) throw Error('unexpected_document_shape');
await verifyLaunch();
console.log(JSON.stringify({scope:'static_source',documents:publicDocuments.length,local_assets:localAssets,fragment_links:anchors,javascript_compiled:true,fragment_resolution_controls:5,hosted_purchase_verified:false}));

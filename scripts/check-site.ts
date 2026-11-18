// Local source qualification only: no network, account or payment authority.
import { verifyLaunch } from './check-launch.ts';
let localAssets = 0, anchors = 0;
for (const document of ['index.html', 'offerings.html', 'pricing.html', 'proof.html']) {
const html = await Deno.readTextFile(document);
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
  localAssets++;
}
if (!html.includes('lang="en"') || !/<meta\s+name="viewport"/i.test(html)) throw Error('missing_document_accessibility_baseline');
}
// Compile the actual script without executing browser effects or requiring a
// synthetic DOM. This catches JavaScript syntax failures without a new bundler.
for (const script of ['main.js', 'pricing.js']) new Function(await Deno.readTextFile(script));
if (!localAssets || !anchors) throw Error('unexpected_document_shape');
await verifyLaunch();
console.log(JSON.stringify({scope:'static_source',documents:4,local_assets:localAssets,fragment_links:anchors,javascript_compiled:true,hosted_purchase_verified:false}));

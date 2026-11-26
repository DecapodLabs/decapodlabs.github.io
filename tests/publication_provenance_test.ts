// Read-only publication provenance test verifying signed Propodus Cloud web artifacts.
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('publication_provenance_failed: ' + msg);
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('Published Cloud web bundle matches signed cloud-app-manifest.json digests and provenance', async () => {
  const manifestRaw = await Deno.readTextFile('cloud-app-manifest.json');
  const manifest = JSON.parse(manifestRaw);

  assert(manifest.version === 1, 'manifest version === 1');
  assert(manifest.product === 'decapod-cloud-web', 'manifest product === decapod-cloud-web');
  assert(manifest.contract_version === 1, 'manifest contract_version === 1');
  assert(typeof manifest.asset_release === 'string' && manifest.asset_release === '20261126-brand', 'manifest asset_release');
  assert(typeof manifest.source_revision === 'string' && /^[a-f0-9]{40}$/.test(manifest.source_revision), 'source_revision 40-char git SHA');
  assert(manifest.source_clean === true, 'source_clean === true');
  assert(manifest.files && typeof manifest.files === 'object', 'manifest.files object present');

  const expectedPaths = [
    'shared/commercial-ui.css',
    'assets/fonts/Geist-Variable.woff2',
    'assets/fonts/GeistMono-Variable.woff2',
    'assets/fonts/OFL-LICENSE.txt',
    'pricing.html',
    'pricing/index.html',
    'pricing.css',
    'pricing.js',
    'cloud-flow.js',
    'signup/index.html',
    'signup/signup.css',
    'signup/signup.js',
    'admin/index.html',
    'admin/admin.css',
    'admin/admin.js',
    '404.html',
  ];
  for (const rel of expectedPaths) {
    const expectedHash = manifest.files[rel];
    assert(typeof expectedHash === 'string' && /^[a-f0-9]{64}$/.test(expectedHash), `valid sha256 entry for ${rel}`);
    const fileBytes = await Deno.readFile(rel);
    const actualHash = await sha256Hex(fileBytes);
    assert(actualHash === expectedHash, `sha256 mismatch for ${rel}: expected ${expectedHash}, got ${actualHash}`);
  }

  for (const htmlRel of ['pricing.html', 'pricing/index.html', 'signup/index.html', 'admin/index.html', '404.html']) {
    const html = await Deno.readTextFile(htmlRel);
    assert(html.includes(`<meta name="decapod-asset-release" content="${manifest.asset_release}">`), `${htmlRel} asset release tag mismatch`);
  }

  for (const pricingPath of ['pricing.html', 'pricing/index.html']) {
    const html = await Deno.readTextFile(pricingPath);
    assert(!/UNDER WRAPS|coming soon|opening soon|\$550/i.test(html), `${pricingPath} must not contain pre-launch placeholders or $550`);
    assert(html.includes('$50') && html.includes('$552'), `${pricingPath} must show real $50/$552 commercial pricing`);
    assert(html.includes('Decapod Local') && html.includes('Free forever'), `${pricingPath} must include Decapod Local Free forever option`);
  }

  for (const removedInternalPath of [
    'docs/asset-compatibility-matrix.md',
    'docs/availability-readiness-slos.md',
    'docs/decisions/0010-admin-route-hosting.md',
    'tests/live_headers_check.ts',
  ]) {
    let exists = true;
    try {
      await Deno.lstat(removedInternalPath);
    } catch {
      exists = false;
    }
    assert(!exists, `internal operational artifact must stay removed from public repo: ${removedInternalPath}`);
  }
});

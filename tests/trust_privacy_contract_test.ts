// Privacy & Trust Contract verification tests for /trust/index.html and all site HTML/JS assets.
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('trust_contract_assertion_failed: ' + msg);
};

async function collectFiles(dir: string, exts: string[], out: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name === '.git' || entry.name === '.decapod' || entry.name === 'node_modules' || entry.name === 'evidence') {
      continue;
    }
    const full = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      await collectFiles(full, exts, out);
    } else if (entry.isFile && exts.some(ext => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

Deno.test('Zero third-party analytics, tracking pixels, fingerprinting scripts, or ad/telemetry beacons across all HTML/JS assets', async () => {
  const assets = await collectFiles('.', ['.html', '.js']);
  assert(assets.length >= 10, `expected >= 10 HTML/JS assets, found ${assets.length}`);

  const forbiddenTrackers: [string, RegExp][] = [
    ['google_analytics_or_gtm', /(?:googletagmanager\.com|google-analytics\.com|gtag\(|ga\(['"]create)/i],
    ['plausible_or_fathom_or_umami', /(?:plausible\.io|usefathom\.com|umami\.is|matomo\.)/i],
    ['segment_mixpanel_amplitude_posthog', /(?:cdn\.segment\.com|mixpanel\.com|amplitude\.com|posthog\.com|app\.posthog)/i],
    ['meta_or_x_or_tiktok_pixel', /(?:connect\.facebook\.net|fbq\(|analytics\.tiktok\.com|static\.ads-twitter\.com|doubleclick\.net)/i],
    ['session_replay_sentry_hotjar', /(?:hotjar\.com|fullstory\.com|clarity\.ms|browser\.sentry-cdn\.com|datadoghq-browser-agent)/i],
    ['fingerprintjs', /(?:fingerprintjs|fpjs\.io|openfpcdn)/i],
    ['beacon_or_tracking_pixel', /(?:navigator\.sendBeacon|width=["']1["']\s+height=["']1["']|<img[^>]+1x1)/i],
  ];

  for (const file of assets) {
    const src = await Deno.readTextFile(file);
    for (const [label, pat] of forbiddenTrackers) {
      assert(!pat.test(src), `forbidden tracker (${label}) detected in ${file}`);
    }
    if (file.endsWith('.html')) {
      const scripts = [...src.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
      for (const s of scripts) {
        assert(
          s.startsWith('/') || (!s.startsWith('http://') && !s.startsWith('https://') && !s.startsWith('//')),
          `external third-party <script src> not allowed in ${file}: ${s}`,
        );
      }
    }
  }
});

Deno.test('/trust/index.html specifies versioned contract metadata, product scopes, relay transparency, 9 invariants, and incident accountability', async () => {
  const trustHtml = await Deno.readTextFile('trust/index.html');
  assert(trustHtml.includes('lang="en"') && /<meta\s+name="viewport"/i.test(trustHtml), 'accessibility baseline');
  assert(trustHtml.includes('name="decapod-trust-contract-version" content="1.0.1"'), 'contract version meta');
  assert(trustHtml.includes('name="decapod-trust-effective-date" content="2026-11-27"'), 'effective date meta');
  assert(trustHtml.includes('Contract Version') && trustHtml.includes('Effective Date'), 'visible contract version and effective date');
  assert(
    trustHtml.includes('Removing or weakening a guarantee requires explicit version increment and changelog entry; updates never silently broaden collection.'),
    'explicit change-control guarantee required',
  );

  for (const required of [
    'Local CLI',
    'Zero telemetry. Zero analytics.',
    'Decapod Cloud',
    'https://github.com',
    'https://api.github.com',
    'https://api.stripe.com',
    'https://api.decapodlabs.ai',
    'Dactyl',
    'Local SQLite = zero egress.',
    'Clack',
    'CLOUDFLARE WORKERS RELAY TRANSPARENCY',
    'Nine permanent trust invariants',
    'Purpose minimization',
    'Fail-closed boundaries',
    'Explicit lifecycle separation',
    'Default-OFF paid overages',
    'Effective immediately',
    'Identity sovereignty',
    'Zero cross-site tracking',
    'Strict key boundaries',
    'Verifiable artifacts',
    'INCIDENT ACCOUNTABILITY &amp; REVOCATION',
    'GitHub Security Advisories',
  ]) {
    assert(trustHtml.includes(required), `/trust/index.html missing required disclosure: ${required}`);
  }

  // Unique IDs check
  const ids = [...trustHtml.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  assert(new Set(ids).size === ids.length, 'duplicate ID in trust/index.html');
});

Deno.test('Site footers link cleanly to /trust/index.html across all pages', async () => {
  for (const page of [
    'index.html',
    'pricing.html',
    'pricing/index.html',
    'signup/index.html',
    'clack/index.html',
    'tecr.html',
    'admin/index.html',
    'trust/index.html',
  ]) {
    const html = await Deno.readTextFile(page);
    assert(html.includes('/trust/index.html'), `${page} footer must link to /trust/index.html`);
    assert(html.includes('Trust &amp; Privacy'), `${page} footer must label Trust & Privacy cleanly`);
  }
});

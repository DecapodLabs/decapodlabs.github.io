// Inspect served HTML and reporting headers independently of source checks.
const publicOrigin = 'https://decapodlabs.ai';
const reviewedRoutes = ['/', '/proof.html', '/trust/', '/pricing', '/signup/', '/admin/', '/tecr.html', '/decapod/', '/decapod/quickstart.html'];
const transportReport = 'https://a.nel.cloudflare.com/report/v4';

function isTransportReport(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = new URL(value);
  return !url.username && !url.password && url.origin + url.pathname === transportReport;
}

export function inspectDeliveredPrivacy(page: URL, html: string, headers: Headers) {
  if (/data-cf-beacon|cloudflareinsights\.com|\/cdn-cgi\/rum|navigator\.sendBeacon\s*\(/i.test(html)) {
    throw new Error('undeclared_browser_analytics');
  }
  const scripts = [...html.matchAll(/<script\b[^>]*?\s+src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)];
  for (const [, quoted, single, bare] of scripts) {
    const script = new URL(quoted ?? single ?? bare, page);
    if (script.origin !== page.origin || script.username || script.password) {
      throw new Error('undeclared_script_origin');
    }
  }
  const declared = headers.get('report-to');
  const named = headers.get('reporting-endpoints');
  const nel = headers.get('nel');
  if (named) throw new Error('undeclared_reporting_endpoints');
  if (/\breport-(?:uri|to)\b/i.test(headers.get('content-security-policy') ?? '')) {
    throw new Error('undeclared_csp_reporting');
  }
  if (declared) {
    const groups = JSON.parse('[' + declared + ']');
    if (groups.length !== 1 || groups[0].group !== 'cf-nel' ||
        !Array.isArray(groups[0].endpoints) || groups[0].endpoints.length !== 1 ||
        !isTransportReport(groups[0].endpoints[0].url)) {
      throw new Error('undeclared_reporting_destination');
    }
  }
  if (nel && (!declared || JSON.parse(nel).report_to !== 'cf-nel')) {
    throw new Error('unbound_network_error_reporting');
  }
  return { script_sources: scripts.length, cloudflare_transport_reporting: Boolean(nel) };
}

if (import.meta.main) {
  for (const path of reviewedRoutes) {
    const page = new URL(path, publicOrigin);
    page.searchParams.set('privacy-readback', String(Date.now()));
    for (const cache of ['cold-probe', 'warm-probe']) {
      const response = await fetch(page, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('unexpected_public_response:' + path + ':' + response.status);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      const signals = inspectDeliveredPrivacy(page, new TextDecoder().decode(body), response.headers);
      const digest = await crypto.subtle.digest('SHA-256', body);
      const sha256 = Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, '0')).join('');
      console.log(JSON.stringify({
        path, cache_probe: cache, status: response.status, fetched_at: new Date().toISOString(),
        sha256, response_cache_status: response.headers.get('cf-cache-status'), ...signals,
      }));
    }
  }
}

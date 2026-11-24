// Bounded read-only synthetic readiness probe for Issue #71.
// Strictly GET-only (credentials: "omit", redirect: "manual", cache: "no-store").
// Zero paid traffic, zero credentials stored, zero state mutations.

export type PlaneStatus = 'healthy' | 'degraded' | 'unavailable';

export interface ProbeThreshold {
  timeoutMs: number;
  warnLatencyMs: number;
  critLatencyMs: number;
}

export interface EndpointProbeResult {
  name: string;
  plane: 'github_pages_web' | 'api_auth_discovery' | 'cloudflare_pages_admin';
  url: string;
  ok: boolean;
  status: PlaneStatus;
  http_status: number;
  latency_ms: number;
  correlation_ref: string | null;
  contract_version: string | null;
  findings: string[];
}

export interface SyntheticReadinessReport {
  schema: 'decapod.synthetic-readiness.v1';
  mode: 'readonly_get';
  paid_traffic_generated: false;
  credentials_stored: false;
  checked_at_utc: string;
  overall_status: PlaneStatus;
  planes: {
    github_pages_web: { status: PlaneStatus; max_latency_ms: number; findings: string[] };
    api_auth_discovery: { status: PlaneStatus; max_latency_ms: number; auth_providers: Record<string, boolean> | null; findings: string[] };
    cloudflare_pages_admin: { status: PlaneStatus; max_latency_ms: number; findings: string[] };
    billing_entitlement_posture: {
      status: PlaneStatus;
      live_sale_enabled: boolean | null;
      billing_enabled: boolean | null;
      pricing_version: string | null;
      posture: 'under_wraps_disabled' | 'live_enabled' | 'unknown';
      findings: string[];
    };
  };
  probes: EndpointProbeResult[];
}

export const DEFAULT_THRESHOLDS: Record<EndpointProbeResult['plane'], ProbeThreshold> = {
  github_pages_web: { timeoutMs: 8000, warnLatencyMs: 1500, critLatencyMs: 5000 },
  api_auth_discovery: { timeoutMs: 6000, warnLatencyMs: 1500, critLatencyMs: 4000 },
  cloudflare_pages_admin: { timeoutMs: 6000, warnLatencyMs: 1500, critLatencyMs: 4000 },
};

const SAFE_CORR_RE = /^[A-Za-z0-9_.:-]{4,128}$/;

function safeCorrelationHeader(headers: Headers): string | null {
  for (const name of ['x-request-id', 'x-correlation-id', 'cf-ray']) {
    const val = headers.get(name)?.trim();
    if (val && SAFE_CORR_RE.test(val) && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(val)) {
      return val;
    }
  }
  return null;
}

function classifyLatency(latencyMs: number, t: ProbeThreshold): { status: PlaneStatus; finding?: string } {
  if (latencyMs > t.critLatencyMs) {
    return { status: 'degraded', finding: `latency_critical:${latencyMs}ms>${t.critLatencyMs}ms` };
  }
  if (latencyMs > t.warnLatencyMs) {
    return { status: 'degraded', finding: `latency_warning:${latencyMs}ms>${t.warnLatencyMs}ms` };
  }
  return { status: 'healthy' };
}

function worstStatus(statuses: PlaneStatus[]): PlaneStatus {
  if (statuses.includes('unavailable')) return 'unavailable';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
}

export async function runSyntheticReadiness(options: {
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  thresholds?: Record<EndpointProbeResult['plane'], ProbeThreshold>;
} = {}): Promise<SyntheticReadinessReport> {
  const fetcher = options.fetchFn ?? fetch;
  const nowMs = options.nowMs ?? (() => performance.now());
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;

  async function probeGet(
    name: string,
    plane: EndpointProbeResult['plane'],
    url: string,
  ): Promise<{ result: EndpointProbeResult; body: string; headers: Headers }> {
    const threshold = thresholds[plane];
    const started = nowMs();
    try {
      const res = await fetcher(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(threshold.timeoutMs) : undefined,
      });
      const body = await res.text();
      const latency = Math.max(0, Math.round(nowMs() - started));
      const findings: string[] = [];
      let status: PlaneStatus = 'healthy';
      if (res.status !== 200) {
        status = 'unavailable';
        findings.push(`http_status_${res.status}`);
      } else {
        const lat = classifyLatency(latency, threshold);
        status = lat.status;
        if (lat.finding) findings.push(lat.finding);
      }
      return {
        result: {
          name,
          plane,
          url,
          ok: res.status === 200,
          status,
          http_status: res.status,
          latency_ms: latency,
          correlation_ref: safeCorrelationHeader(res.headers),
          contract_version: res.headers.get('decapod-cloud-contract-version'),
          findings,
        },
        body,
        headers: res.headers,
      };
    } catch (err) {
      const latency = Math.max(0, Math.round(nowMs() - started));
      const label = err instanceof Error ? err.name : 'network_error';
      return {
        result: {
          name,
          plane,
          url,
          ok: false,
          status: 'unavailable',
          http_status: 0,
          latency_ms: latency,
          correlation_ref: null,
          contract_version: null,
          findings: [`probe_exception:${label}`],
        },
        body: '',
        headers: new Headers(),
      };
    }
  }

  const [home, pricing, signup, adminWeb, providers, config, pagesAdmin] = await Promise.all([
    probeGet('web_home', 'github_pages_web', 'https://decapodlabs.ai/'),
    probeGet('web_pricing', 'github_pages_web', 'https://decapodlabs.ai/pricing/'),
    probeGet('web_signup', 'github_pages_web', 'https://decapodlabs.ai/signup/'),
    probeGet('web_admin', 'github_pages_web', 'https://decapodlabs.ai/admin/'),
    probeGet('api_auth_providers', 'api_auth_discovery', 'https://api.decapodlabs.ai/auth/providers'),
    probeGet('api_onboarding_config', 'api_auth_discovery', 'https://api.decapodlabs.ai/functions/v1/decapod-onboarding/config?include_auth_providers=true'),
    probeGet('pages_admin_entry', 'cloudflare_pages_admin', 'https://decapod-cloud-admin.pages.dev/'),
  ]);

  // Validate GitHub Pages static web coherence
  const releaseTags = new Set<string>();
  if (home.result.ok && !home.body.includes('id="proofs"')) {
    home.result.status = 'unavailable';
    home.result.ok = false;
    home.result.findings.push('missing_proofs_anchor');
  }
  for (const [label, probe] of [['pricing', pricing], ['signup', signup], ['admin', adminWeb]] as const) {
    if (!probe.result.ok) continue;
    if (!probe.body.includes('cloud-flow.js')) {
      probe.result.status = 'unavailable';
      probe.result.ok = false;
      probe.result.findings.push(`${label}_missing_cloud_flow`);
    }
    if (!probe.body.includes('<meta name="decapod-flow-contract" content="1">')) {
      probe.result.status = 'unavailable';
      probe.result.ok = false;
      probe.result.findings.push(`${label}_missing_contract_meta`);
    }
    if (!probe.body.includes('<meta name="referrer" content="no-referrer">')) {
      probe.result.status = 'unavailable';
      probe.result.ok = false;
      probe.result.findings.push(`${label}_missing_no_referrer`);
    }
    const relMatch = probe.body.match(/<meta name="decapod-asset-release" content="([^"]+)">/);
    if (relMatch) {
      releaseTags.add(relMatch[1]);
    } else {
      probe.result.status = 'unavailable';
      probe.result.ok = false;
      probe.result.findings.push(`${label}_missing_asset_release`);
    }
  }
  if (signup.result.ok && !signup.body.includes('noindex,nofollow')) {
    signup.result.status = 'unavailable';
    signup.result.ok = false;
    signup.result.findings.push('signup_missing_noindex');
  }
  if (adminWeb.result.ok && !adminWeb.body.includes('noindex,nofollow')) {
    adminWeb.result.status = 'unavailable';
    adminWeb.result.ok = false;
    adminWeb.result.findings.push('admin_missing_noindex');
  }
  const webFindings = [...home.result.findings, ...pricing.result.findings, ...signup.result.findings, ...adminWeb.result.findings];
  if (releaseTags.size > 1) {
    webFindings.push(`incoherent_live_asset_releases:${[...releaseTags].join(',')}`);
  }
  const webStatus = worstStatus([
    home.result.status,
    pricing.result.status,
    signup.result.status,
    adminWeb.result.status,
    releaseTags.size > 1 ? 'degraded' : 'healthy',
  ]);

  // Validate Auth & Onboarding Discovery API
  let parsedProviders: Record<string, boolean> | null = null;
  let parsedConfig: Record<string, any> | null = null;
  if (providers.result.ok) {
    if (!providers.headers.get('cache-control')?.includes('no-store')) {
      providers.result.status = 'unavailable';
      providers.result.ok = false;
      providers.result.findings.push('providers_missing_no_store');
    }
    if (!providers.result.contract_version?.startsWith('1.')) {
      providers.result.status = 'unavailable';
      providers.result.ok = false;
      providers.result.findings.push('providers_contract_version_mismatch');
    }
    if (providers.headers.get('referrer-policy') !== 'no-referrer' || providers.headers.get('x-content-type-options') !== 'nosniff') {
      providers.result.status = 'unavailable';
      providers.result.ok = false;
      providers.result.findings.push('providers_missing_security_headers');
    }
    try {
      const json = JSON.parse(providers.body);
      if (json.version !== 1 || !json.auth_providers || typeof json.auth_providers !== 'object') {
        throw new Error('invalid_providers_schema');
      }
      parsedProviders = json.auth_providers;
    } catch {
      providers.result.status = 'unavailable';
      providers.result.ok = false;
      providers.result.findings.push('providers_malformed_json');
    }
  }
  if (config.result.ok) {
    if (!config.headers.get('cache-control')?.includes('no-store')) {
      config.result.status = 'unavailable';
      config.result.ok = false;
      config.result.findings.push('config_missing_no_store');
    }
    if (!config.result.contract_version?.startsWith('1.')) {
      config.result.status = 'unavailable';
      config.result.ok = false;
      config.result.findings.push('config_contract_version_mismatch');
    }
    try {
      const json = JSON.parse(config.body);
      if (
        json.version !== 1 ||
        json.project_origin !== 'https://goyxpcmxetztjlrrcwew.supabase.co' ||
        typeof json.publishable_key !== 'string' ||
        !json.publishable_key.startsWith('sb_publishable_')
      ) {
        throw new Error('invalid_config_schema');
      }
      parsedConfig = json;
    } catch {
      config.result.status = 'unavailable';
      config.result.ok = false;
      config.result.findings.push('config_malformed_or_untrusted');
    }
  }
  const apiStatus = worstStatus([providers.result.status, config.result.status]);
  const apiFindings = [...providers.result.findings, ...config.result.findings];

  // Validate Cloudflare Pages Admin
  if (pagesAdmin.result.ok) {
    if (!pagesAdmin.headers.get('cache-control')?.includes('no-store')) {
      pagesAdmin.result.status = 'unavailable';
      pagesAdmin.result.ok = false;
      pagesAdmin.result.findings.push('pages_admin_missing_no_store');
    }
    if (pagesAdmin.headers.get('referrer-policy') !== 'no-referrer' || pagesAdmin.headers.get('x-content-type-options') !== 'nosniff') {
      pagesAdmin.result.status = 'unavailable';
      pagesAdmin.result.ok = false;
      pagesAdmin.result.findings.push('pages_admin_missing_security_headers');
    }
    const csp = pagesAdmin.headers.get('content-security-policy') || '';
    if (!csp.includes("frame-ancestors 'none'") || !csp.includes('https://goyxpcmxetztjlrrcwew.supabase.co')) {
      pagesAdmin.result.status = 'unavailable';
      pagesAdmin.result.ok = false;
      pagesAdmin.result.findings.push('pages_admin_weak_csp');
    }
  }

  // Separate Billing / Entitlement Posture (read-only derivation from /config + /pricing)
  const billingFindings: string[] = [];
  let billingStatus: PlaneStatus = 'healthy';
  let liveSaleEnabled: boolean | null = null;
  let billingEnabled: boolean | null = null;
  let pricingVersion: string | null = null;
  let posture: 'under_wraps_disabled' | 'live_enabled' | 'unknown' = 'unknown';
  if (!parsedConfig) {
    billingStatus = 'unavailable';
    billingFindings.push('config_unavailable_cannot_verify_billing_posture');
  } else {
    liveSaleEnabled = parsedConfig.live_sale_enabled === true;
    billingEnabled = parsedConfig.billing_enabled === true;
    pricingVersion = typeof parsedConfig.pricing_version === 'string' ? parsedConfig.pricing_version : null;
    posture = liveSaleEnabled && billingEnabled ? 'live_enabled' : 'under_wraps_disabled';
    if (posture === 'under_wraps_disabled' && pricing.result.ok && !pricing.body.includes('UNDER WRAPS')) {
      billingStatus = 'unavailable';
      billingFindings.push('pricing_missing_under_wraps_while_disabled');
    }
  }

  const probes = [
    home.result,
    pricing.result,
    signup.result,
    adminWeb.result,
    providers.result,
    config.result,
    pagesAdmin.result,
  ];

  const overallStatus = worstStatus([webStatus, apiStatus, pagesAdmin.result.status, billingStatus]);

  return {
    schema: 'decapod.synthetic-readiness.v1',
    mode: 'readonly_get',
    paid_traffic_generated: false,
    credentials_stored: false,
    checked_at_utc: new Date().toISOString(),
    overall_status: overallStatus,
    planes: {
      github_pages_web: {
        status: webStatus,
        max_latency_ms: Math.max(home.result.latency_ms, pricing.result.latency_ms, signup.result.latency_ms, adminWeb.result.latency_ms),
        findings: webFindings,
      },
      api_auth_discovery: {
        status: apiStatus,
        max_latency_ms: Math.max(providers.result.latency_ms, config.result.latency_ms),
        auth_providers: parsedProviders,
        findings: apiFindings,
      },
      cloudflare_pages_admin: {
        status: pagesAdmin.result.status,
        max_latency_ms: pagesAdmin.result.latency_ms,
        findings: pagesAdmin.result.findings,
      },
      billing_entitlement_posture: {
        status: billingStatus,
        live_sale_enabled: liveSaleEnabled,
        billing_enabled: billingEnabled,
        pricing_version: pricingVersion,
        posture,
        findings: billingFindings,
      },
    },
    probes,
  };
}

if (import.meta.main) {
  const report = await runSyntheticReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (report.overall_status === 'unavailable') {
    Deno.exit(1);
  }
}

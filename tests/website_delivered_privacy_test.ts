import { inspectDeliveredPrivacy } from '../scripts/check-website-privacy.ts';

const page = new URL('https://decapodlabs.ai/trust/');
const source = '<!doctype html><html><script src="/main.js"></script></html>';
const transport = new Headers({
  'report-to': JSON.stringify({
    group: 'cf-nel',
    endpoints: [{ url: 'https://a.nel.cloudflare.com/report/v4?s=synthetic' }],
  }),
  nel: JSON.stringify({ report_to: 'cf-nel', success_fraction: 0 }),
});

function expectRefusal(body: string, headers: Headers, code: string) {
  try {
    inspectDeliveredPrivacy(page, body, headers);
  } catch (error) {
    if (error instanceof Error && error.message === code) return;
    throw error;
  }
  throw new Error('delivered_privacy_probe_failed_to_refuse:' + code);
}

Deno.test('delivered website permits same-origin scripts and declared failure reporting', () => {
  const publicPage = inspectDeliveredPrivacy(page, source, transport);
  if (publicPage.script_sources !== 1 || !publicPage.cloudflare_transport_reporting) {
    throw new Error('expected_declared_transport_boundary');
  }
});

Deno.test('clean source cannot hide a hosting-injected analytics script or reporting origin', () => {
  inspectDeliveredPrivacy(page, source, new Headers());
  expectRefusal(source + '<script defer data-cf-beacon="synthetic"></script>', new Headers(), 'undeclared_browser_analytics');
  expectRefusal(source + '<script src="//observer.invalid/runtime.js"></script>', new Headers(), 'undeclared_script_origin');
  const altered = new Headers(transport);
  altered.set('report-to', JSON.stringify({ group: 'cf-nel', endpoints: [{ url: 'https://observer.invalid/report' }] }));
  expectRefusal(source, altered, 'undeclared_reporting_destination');
});

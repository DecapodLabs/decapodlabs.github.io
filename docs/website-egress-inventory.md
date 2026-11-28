# Decapod Labs public website egress

The site repository owns public presentation. The Decapod manual and Propodus browser bundle retain their own source authorities. This review covers the public homepage, case study, Trust, Rework, manual, Pricing, Signup and Admin. The Clack site path is outside this change.

| Initiating action | Destination and payload category | Principal and owner | User control |
| --- | --- | --- | --- |
| Load a reviewed public page or play a featured video | HTTPS to `decapodlabs.ai` for HTML, fonts, scripts, images and media. Necessary HTTP request metadata reaches Cloudflare and GitHub Pages | Unauthenticated visitor. Cloudflare operates the edge, and GitHub Pages delivers published resources | Close the page or withhold the navigation or playback |
| Navigate to documentation, source, or the Waystead waitlist | HTTPS to the linked first-party documentation, GitHub or Whop. Ordinary request and referrer metadata follow the link’s policy | Unauthenticated visitor unless the destination establishes its own session. The linked service owns destination processing | Follow the link deliberately |
| Open the public Cloud entry page | HTTPS to the first-party API and public configuration endpoint. The request resolves available session and sign-in choices | Unauthenticated for discovery. Propodus owns the browser and API contract | Leaving the page ends discovery |
| Choose authentication, repository approval or a commercial action | HTTPS to declared Decapod Cloud API endpoints and the provider selected for the action. Payload categories include verified identity, authorization, and commercial terms | The authenticated human exercises scoped authority. Propodus, the identity provider, and the payment processor retain their respective operational records | Consent, cancellation, sign-out and authorization revocation apply at the corresponding service |
| A supported browser observes a network failure after receiving a Cloudflare NEL policy | `https://a.nel.cloudflare.com/report/v4`. The reporting policy may carry diagnostic details about the failed connection | The browser originates the report. Cloudflare owns diagnosis and its documented retention policy | Browser support and reporting settings determine emission. Cloudflare exposes a separate zone control |

Cloudflare automatically injected its Web Analytics beacon through an enabled RUM setting, independent of website source. The zone’s Configuration Rules phase now disables RUM at `decapodlabs.ai` for the reviewed site outside `/clack` and `/clack/*`. The rule changes only Web Analytics injection. NEL is a separately declared network diagnostic. Header readback establishes its presence and destination. Request representation and behavior remain subject to the browser’s reporting implementation.

## Release check

Run `deno test tests/website_delivered_privacy_test.ts` for the deterministic negative control, then `deno run --allow-net=decapodlabs.ai scripts/check-website-privacy.ts` on the published site. The latter uses independent cold and warm probes and reports URL paths, timestamps, response digests and declared network-reporting presence. It rejects edge-injected analytics and undeclared reporting. The output carries no raw payloads, script configuration or analytics identifiers. Use clean-state browser network observation as a separate check, and label header observation independently from browser report execution.

If a deployed check detects new instrumentation, inspect the delivered response and its hosting rules, compare against the same accepted source and artifact, fix the responsible control, and run the checks again. Preserve distinct source, service, and delivered evidence.

See the [Web Analytics Configuration Rule](https://developers.cloudflare.com/rules/configuration-rules/settings/#disable-real-user-monitoring-rum), [Network Error Logging](https://developers.cloudflare.com/network-error-logging/), and [Trust contract](https://decapodlabs.ai/trust/).

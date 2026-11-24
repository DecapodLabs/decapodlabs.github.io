// Offline provenance projection, reproducibility, redaction, and non-authority tests for Issue #72.
// Strictly read-only: zero network calls, zero authority inferred from public artifacts.
import { verifyLaunch } from '../scripts/check-launch.ts';

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error('provenance_assertion_failed: ' + msg);
};
const assertEq = (actual: unknown, expected: unknown, msg: string) => {
  if (actual !== expected) {
    throw new Error(`provenance_assertion_failed (${msg}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const canonical = (v: Json): Json =>
  Array.isArray(v)
    ? v.map(canonical)
    : v !== null && typeof v === 'object'
    ? Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, canonical(x)]),
      )
    : v;

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function sha256Text(s: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(s));
}

function canonicalHash(v: Json): Promise<string> {
  return sha256Text(JSON.stringify(canonical(v)));
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await Deno.readTextFile(path));
}

interface RedactionFinding {
  path: string;
  rule: string;
}

const REDACTION_RULES: { name: string; pattern: RegExp }[] = [
  { name: 'github_pat', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/ },
  { name: 'github_fine_pat', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'stripe_secret_key', pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{12,}\b/ },
  { name: 'bearer_header', pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{10,}/i },
  { name: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/ },
  { name: 'url_secret_param', pattern: /(?:access_token|refresh_token|provider_token|client_secret)=[A-Za-z0-9._-]{8,}/ },
  { name: 'private_key_block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'local_unix_home_path', pattern: /(?:^|[^A-Za-z0-9])\/(?:Users|home)\/[A-Za-z0-9._-]{2,}\// },
  { name: 'local_windows_home_path', pattern: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]{2,}\\/ },
  { name: 'email_pii', pattern: /\b(?!git@github\.com\b)[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b|[A-Za-z0-9.-]+\.invalid\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
];

function scanTextForLeaks(path: string, content: string): RedactionFinding[] {
  const findings: RedactionFinding[] = [];
  for (const rule of REDACTION_RULES) {
    if (rule.pattern.test(content)) {
      findings.push({ path, rule: rule.name });
    }
  }
  return findings;
}

interface EvidenceBundleSnapshot {
  dir: string;
  manifest: any;
  capture: any;
  witnesses: Record<string, any[]>;
  witnessDigests: Record<string, string>;
}

async function loadEvidenceBundle(dir: string): Promise<EvidenceBundleSnapshot> {
  const manifest = await readJson(`${dir}/manifest.json`);
  const capture = await readJson(`${dir}/capture.json`);
  const witnesses: Record<string, any[]> = {};
  const witnessDigests: Record<string, string> = {};
  for (const [key, entry] of Object.entries(capture.artifacts)) {
    const a = entry as { file: string; sha256: string };
    assert(/^[a-z]+\.json$/.test(a.file), `safe witness filename in ${dir}: ${a.file}`);
    const full = `${dir}/${a.file}`;
    const info = await Deno.lstat(full);
    assert(info.isFile && !info.isSymlink, `regular file required for ${full}`);
    const digest = await sha256Bytes(await Deno.readFile(full));
    witnessDigests[key] = digest;
    witnesses[key] = await readJson(full);
  }
  return { dir, manifest, capture, witnesses, witnessDigests };
}

async function verifyEvidenceProjection(bundle: EvidenceBundleSnapshot, opts: { requireExpiredAdmission?: boolean } = {}) {
  const { manifest, capture, witnesses, witnessDigests, dir } = bundle;
  assertEq(manifest.schema, 'decapod.agent-acceptance.v1', `${dir} schema`);
  assertEq(manifest.run_id, capture.run_id, `${dir} run_id`);
  assertEq(manifest.objective?.text, capture.objective, `${dir} objective match`);
  assertEq(manifest.observed_autonomous_admission, true, `${dir} autonomous admission`);
  assertEq(manifest.human_interventions, 0, `${dir} zero human interventions`);
  // Non-authoritative boundary: derived public exports never grant publication or merge authority.
  assertEq(manifest.publication_ready, false, `${dir} non-authoritative publication_ready=false`);
  assertEq(manifest.merge_authorized, false, `${dir} non-authoritative merge_authorized=false`);

  if (opts.requireExpiredAdmission || (Array.isArray(manifest.findings) && manifest.findings.includes('SOURCE_OR_BASE_CHANGED'))) {
    assertEq(manifest.current_admission_applicable, false, `${dir} stale-green reference must have current_admission_applicable=false`);
  }

  for (const [key, entry] of Object.entries(capture.artifacts)) {
    const a = entry as { sha256: string };
    assertEq(witnessDigests[key], a.sha256, `${dir} witness digest ${key}`);
  }

  const bySeq = new Map<number, { artifact: string; pointer: string }>(
    capture.events.map((e: any) => [e.sequence, { artifact: e.artifact, pointer: e.pointer }]),
  );
  const kinds = new Set<string>();
  for (const ev of manifest.events) {
    const orig = bySeq.get(ev.sequence);
    assert(orig, `${dir} missing capture event seq ${ev.sequence}`);
    const artifact = capture.artifacts[orig!.artifact];
    assert(artifact, `${dir} missing capture artifact ${orig!.artifact}`);
    const expectedId = await sha256Text(`${capture.run_id}:${ev.sequence}:${artifact.sha256}:${orig!.pointer}`);
    assertEq(ev.id, expectedId, `${dir} deterministic event digest seq ${ev.sequence}`);
    assertEq(ev.evidence?.sha256, artifact.sha256, `${dir} event artifact digest seq ${ev.sequence}`);
    assertEq(ev.evidence?.pointer, orig!.pointer, `${dir} event pointer seq ${ev.sequence}`);
    const idx = Number(orig!.pointer.slice(1));
    assert(Number.isInteger(idx) && witnesses[orig!.artifact]?.[idx], `${dir} witness entry seq ${ev.sequence}`);
    kinds.add(ev.kind);

    if (ev.kind === 'pr_admission_independently_correlated') {
      const gh = witnesses[orig!.artifact][idx];
      assertEq(ev.facts.head, gh.head, `${dir} github head readback match`);
      assertEq(ev.facts.base, gh.base, `${dir} github base readback match`);
      assertEq(ev.facts.pr_url, gh.url, `${dir} github pr_url readback match`);
      assertEq(manifest.admission_observed?.head, gh.head, `${dir} admission_observed head match`);
      assertEq(manifest.admission_observed?.base, gh.base, `${dir} admission_observed base match`);
      assertEq(gh.merged, false, `${dir} unmerged demo fixture`);
    }
  }
  for (const req of [
    'objective_received',
    'context_consulted',
    'task_claimed',
    'workspace_bound',
    'required_check_failed',
    'agent_changed_failed_source',
    'fresh_validation_observed',
    'publication_observed',
    'pr_admission_independently_correlated',
  ]) {
    assert(kinds.has(req), `${dir} missing causal event ${req}`);
  }
}

async function verifyLaunchProjectionConsistency(
  production: any,
  launchRender: any,
  proofRender: any,
  tuiManifest: any,
  proofHtml: string,
  indexHtml: string,
) {
  assertEq(production.schema, 'decapod.launch-production.v1', 'production schema');
  assertEq(launchRender.schema, 'decapod.launch-render.v1', 'launch render schema');
  assertEq(proofRender.schema, 'decapod.pi-tui-release.v1', 'proof render schema');
  assertEq(launchRender.run_id, tuiManifest.run_id, 'launch render run_id matches tui manifest');
  assertEq(proofRender.run_id, tuiManifest.run_id, 'proof render run_id matches tui manifest');

  const manifestEventIds = new Set<string>(tuiManifest.events.map((e: any) => e.id));
  const mainOutput = launchRender.outputs?.find((o: any) => o.variant === 'main');
  assert(mainOutput && launchRender.outputs.length === 3, 'all 3 render variants present (no partial publication)');
  for (const scene of mainOutput.scenes) {
    assert(Array.isArray(scene.observed_event_ids_or_control_digests), 'scene evidence list');
    for (const ref of scene.observed_event_ids_or_control_digests) {
      if (scene.editorial?.act !== '07 / POST-RUN CONTROL') {
        assert(manifestEventIds.has(ref), `scene ${scene.editorial?.act} references observed event ${ref}`);
      }
    }
  }

  assert(
    proofHtml.includes('Admission grants no merge authorization.') &&
      proofHtml.includes('its current applicability is false') &&
      proofHtml.includes(tuiManifest.admission_observed.head) &&
      proofHtml.includes(tuiManifest.admission_observed.base),
    'proof.html preserves exact heads/bases and non-authoritative disclosures',
  );
  assert(
    indexHtml.includes('id="proofs"') &&
      indexHtml.includes(tuiManifest.admission_observed.pr_url) &&
      indexHtml.includes(`src="assets/${proofRender.output.file}"`),
    'index.html references exact proof media and PR',
  );
}

async function assertRejects(fn: () => Promise<void>, expectedSubstring: string, label: string) {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes(expectedSubstring), `${label}: expected error containing "${expectedSubstring}", got "${msg}"`);
    return;
  }
  throw new Error(`provenance_negative_control_admitted (${label}): expected failure "${expectedSubstring}"`);
}

Deno.test('#72 Deterministic rebuild and digest verification across all published proof and render projections', async () => {
  // 1. Existing offline presentation gate passes without error
  await verifyLaunch();

  // 2. Verify all four evidence bundles deterministically from capture indices + witness bytes
  const b1 = await loadEvidenceBundle('evidence/pi-1758-20261117-01');
  await verifyEvidenceProjection(b1, { requireExpiredAdmission: true });

  const b3 = await loadEvidenceBundle('evidence/pi-1758-proof-video-03');
  await verifyEvidenceProjection(b3);

  const b5 = await loadEvidenceBundle('evidence/pi-1758-tui-05');
  await verifyEvidenceProjection(b5);

  const b6 = await loadEvidenceBundle('evidence/pi-1758-tui-06');
  await verifyEvidenceProjection(b6);

  // 3. Recompute canonical publication-record & publication-receipt digests independently
  const pubRecord = await readJson('evidence/pi-1758-20261117-01/publication-record.json');
  const pubReceipt = await readJson('evidence/pi-1758-20261117-01/publication-receipt.json');
  const pubReadback = await readJson('evidence/pi-1758-20261117-01/publication-proof-readback.json');
  const { record_digest, ...pubRecordBody } = pubRecord;
  const { receipt_hash, ...pubReceiptBody } = pubReceipt;
  assertEq(await canonicalHash(pubRecordBody), record_digest, 'publication-record deterministic digest');
  assertEq(await canonicalHash(pubReceiptBody), receipt_hash, 'publication-receipt deterministic digest');
  assertEq(
    await sha256Bytes(await Deno.readFile('evidence/pi-1758-20261117-01/publication-receipt.json')),
    pubReadback.receipt_file_sha256,
    'publication-receipt byte digest matches readback',
  );
  assertEq(pubReadback.publication_ready, false, 'readback publication_ready=false');
  assertEq(pubReadback.current_admission_applicable, false, 'readback current_admission_applicable=false');
  assertEq(pubReadback.merge_authorized, false, 'readback merge_authorized=false');

  // 4. Verify archive seal pins every immutable archived file sha256 cleanly and fixture-ledger documents post-archive supplement
  const seal = await readJson('evidence/pi-1758-20261117-01/archive-seal.json');
  assertEq(seal.merge_authorized, false, 'archive seal merge_authorized=false');
  for (const fileName of ['capture.json', 'controls.json', 'created-not-admitted.json', 'git.json', 'github.json', 'host.json', 'kernel.json', 'manifest.json', 'runtime.json']) {
    const actualSha = await sha256Bytes(await Deno.readFile(`evidence/pi-1758-20261117-01/${fileName}`));
    assertEq(actualSha, seal.files[fileName], `archive seal digest for ${fileName}`);
  }
  const readmeText = await Deno.readTextFile('evidence/pi-1758-20261117-01/README.md');
  assert(readmeText.includes(seal.commit) && readmeText.includes(seal.tree), 'README pins immutable archive commit and tree');
  const fixtureLedger = await readJson('evidence/pi-1758-20261117-01/fixture-ledger.json');
  assertEq(fixtureLedger.archive_commit, seal.commit, 'fixture-ledger pins immutable archive commit');
  assertEq(fixtureLedger.archive_ledger_end, seal.archive_operations_ledger_end, 'fixture-ledger pins archive ledger end');
  assert(fixtureLedger.complete_operator_ledger_end >= fixtureLedger.archive_ledger_end, 'fixture-ledger preserves post-archive supplement');

  // 5. Verify render & HTML projection consistency
  const production = await readJson('media/launch-production.json');
  const launchRender = await readJson('assets/decapod-launch-render.json');
  const proofRender = await readJson('assets/decapod-proof-render.json');
  const proofHtml = await Deno.readTextFile('proof.html');
  const indexHtml = await Deno.readTextFile('index.html');
  await verifyLaunchProjectionConsistency(production, launchRender, proofRender, b6.manifest, proofHtml, indexHtml);
});

Deno.test('#72 Negative controls: tampered digests, missing/superseded/stale-green references, and partial publications are rejected', async () => {
  const b1 = await loadEvidenceBundle('evidence/pi-1758-20261117-01');
  const b6 = await loadEvidenceBundle('evidence/pi-1758-tui-06');
  const production = await readJson('media/launch-production.json');
  const launchRender = await readJson('assets/decapod-launch-render.json');
  const proofRender = await readJson('assets/decapod-proof-render.json');
  const proofHtml = await Deno.readTextFile('proof.html');
  const indexHtml = await Deno.readTextFile('index.html');

  // 1. Altered witness digest rejected
  const tamperedWitness = structuredClone(b6);
  tamperedWitness.witnessDigests.kernel = 'sha256:' + 'a'.repeat(64);
  await assertRejects(() => verifyEvidenceProjection(tamperedWitness), 'witness digest kernel', 'altered witness digest');

  // 2. Altered event ID or tampered causal event rejected
  const tamperedEvent = structuredClone(b6);
  tamperedEvent.manifest.events[0].id = 'sha256:' + 'b'.repeat(64);
  await assertRejects(() => verifyEvidenceProjection(tamperedEvent), 'deterministic event digest', 'tampered event digest');

  // 3. Missing required causal event (e.g. removing required_check_failed) rejected
  const missingFailure = structuredClone(b6);
  missingFailure.manifest.events = missingFailure.manifest.events.filter((e: any) => e.kind !== 'required_check_failed');
  await assertRejects(() => verifyEvidenceProjection(missingFailure), 'missing causal event required_check_failed', 'missing causal failure');

  // 4. Superseded / wrong head vs GitHub readback rejected
  const supersededHead = structuredClone(b6);
  supersededHead.manifest.admission_observed.head = '0'.repeat(40);
  await assertRejects(() => verifyEvidenceProjection(supersededHead), 'admission_observed head match', 'superseded head mismatch');

  // 5. Stale-green result: pi-1758-20261117-01 marked current_admission_applicable=true is rejected
  const staleGreen = structuredClone(b1);
  staleGreen.manifest.current_admission_applicable = true;
  await assertRejects(() => verifyEvidenceProjection(staleGreen, { requireExpiredAdmission: true }), 'stale-green reference', 'stale green admission');

  // 6. Authority escalation: publication_ready=true or merge_authorized=true rejected
  const pubAuthority = structuredClone(b6);
  pubAuthority.manifest.publication_ready = true;
  await assertRejects(() => verifyEvidenceProjection(pubAuthority), 'non-authoritative publication_ready=false', 'publication_ready escalation');

  const mergeAuthority = structuredClone(b6);
  mergeAuthority.manifest.merge_authorized = true;
  await assertRejects(() => verifyEvidenceProjection(mergeAuthority), 'non-authoritative merge_authorized=false', 'merge_authorized escalation');

  // 7. Partial publication (missing video variant) rejected
  const partialRender = structuredClone(launchRender);
  partialRender.outputs = partialRender.outputs.slice(0, 2);
  await assertRejects(
    () => verifyLaunchProjectionConsistency(production, partialRender, proofRender, b6.manifest, proofHtml, indexHtml),
    'no partial publication',
    'partial render outputs',
  );

  // 8. Proof HTML missing non-authority disclaimer rejected
  const missingDisclaimer = proofHtml.replace('Admission grants no merge authorization.', 'Approved for merge.');
  await assertRejects(
    () => verifyLaunchProjectionConsistency(production, launchRender, proofRender, b6.manifest, missingDisclaimer, indexHtml),
    'non-authoritative disclosures',
    'missing non-authority disclosure',
  );
});

Deno.test('#72 Automated redaction scan and negative token/secret/PII fixtures plus non-rewriting projection republish', async () => {
  // 1. Scan all published proof, evidence, and render JSON/markdown/text files
  const filesToScan: string[] = [
    'proof.html',
    'index.html',
    'media/launch-production.json',
    'assets/decapod-launch-render.json',
    'assets/decapod-proof-render.json',
    'docs/provenance-projections.md',
  ];
  for (const evDir of ['pi-1758-20261117-01', 'pi-1758-proof-video-03', 'pi-1758-tui-05', 'pi-1758-tui-06']) {
    for await (const entry of Deno.readDir(`evidence/${evDir}`)) {
      if (entry.isFile && (entry.name.endsWith('.json') || entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
        filesToScan.push(`evidence/${evDir}/${entry.name}`);
      }
    }
  }

  const allFindings: RedactionFinding[] = [];
  for (const path of filesToScan) {
    const text = await Deno.readTextFile(path);
    allFindings.push(...scanTextForLeaks(path, text));
  }
  assertEq(allFindings.length, 0, `zero secret/token/PII leaks across ${filesToScan.length} files: ${JSON.stringify(allFindings)}`);

  // 2. Negative redaction fixtures: synthetic token, Stripe key, Bearer header, home path, and email PII must fail
  const baseHost = await Deno.readTextFile('evidence/pi-1758-tui-06/host.json');
  const negativeFixtures: [string, string][] = [
    ['github_pat', baseHost.replace('gpt-6.1-sol', 'ghp_1234567890abcdef1234567890abcdef')],
    ['stripe_secret_key', baseHost.replace('gpt-6.1-sol', 'sk_live_51TestSecretKey987654')],
    ['bearer_token', baseHost.replace('gpt-6.1-sol', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload')],
    ['local_unix_home_path', baseHost.replace('gpt-6.1-sol', '/Users/privateuser/src/decapod')],
    ['email_pii', baseHost.replace('gpt-6.1-sol', 'operator.private@example.com')],
  ];
  for (const [expectedRule, mutated] of negativeFixtures) {
    const found = scanTextForLeaks('fixture/host.json', mutated);
    assert(found.some(f => f.rule === expectedRule), `redaction scanner detects ${expectedRule}`);
  }

  // 3. Republish-without-rewriting-canonical-proof check:
  // Updating editorial presentation text in a derived projection preserves canonical receipt & record digests untouched.
  const b6 = await loadEvidenceBundle('evidence/pi-1758-tui-06');
  const production = await readJson('media/launch-production.json');
  const launchRender = await readJson('assets/decapod-launch-render.json');
  const proofRender = await readJson('assets/decapod-proof-render.json');
  const proofHtml = await Deno.readTextFile('proof.html');
  const indexHtml = await Deno.readTextFile('index.html');

  const receiptBefore = await sha256Bytes(await Deno.readFile('evidence/pi-1758-20261117-01/publication-receipt.json'));
  const recordBefore = await sha256Bytes(await Deno.readFile('evidence/pi-1758-20261117-01/publication-record.json'));

  const republishedRender = structuredClone(launchRender);
  republishedRender.outputs[0].scenes[0].editorial.detail = 'Corrected caption text referencing the identical observed objective.';
  await verifyLaunchProjectionConsistency(production, republishedRender, proofRender, b6.manifest, proofHtml, indexHtml);

  const receiptAfter = await sha256Bytes(await Deno.readFile('evidence/pi-1758-20261117-01/publication-receipt.json'));
  const recordAfter = await sha256Bytes(await Deno.readFile('evidence/pi-1758-20261117-01/publication-record.json'));
  assertEq(receiptAfter, receiptBefore, 'canonical publication receipt remains immutable during projection republish');
  assertEq(recordAfter, recordBefore, 'canonical publication record remains immutable during projection republish');
});

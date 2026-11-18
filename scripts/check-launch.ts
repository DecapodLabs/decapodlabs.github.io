// Offline presentation regression gate. This grants no kernel authority.
const root = 'evidence/pi-1758-20261117-01/';
const read = async (p: string) => JSON.parse(await Deno.readTextFile(p));
const hash = async (bytes: Uint8Array) => 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(v => v.toString(16).padStart(2, '0')).join('');
const bytes = (s: string) => new TextEncoder().encode(s);
type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
const canonical = (v: Json): Json => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,x]) => [k,canonical(x)])) : v;
const valueHash = (v: Json) => hash(bytes(JSON.stringify(canonical(v))));
const assert = (condition: unknown, message: string) => { if (!condition) throw Error('launch_' + message); };
async function verifyPublishedProof(publication: any, receipt: any, readback: any, m: any, nativeValidations: any[], receiptFileDigest: string) {
  const {record_digest, ...recordBody} = publication;
  assert(record_digest === 'sha256:8975febbf5c1e98c2eabf66cb7ca79659fcebb4824aa33958751548e7cdaa7bd' && receipt.receipt_hash === 'sha256:0bd96cd0bad9992a3ca1e475e9394573928254830900066f7b9c4bc24ec3e5eb', 'approved_publication_proof');
  const {receipt_hash, ...receiptBody} = receipt;
  assert(await valueHash(recordBody) === record_digest && await valueHash(receiptBody) === receipt_hash, 'publication_proof_hash');
  assert(receiptFileDigest === readback.receipt_file_sha256, 'publication_receipt_bytes');
  // Rust hashes typed serialization, whose field order differs from a JSON Value.
  // Preserve native digest references and pin the independently observed record;
  // do not invent a second typed-proof verifier in the marketing application.
  const standalone = nativeValidations.find((v: any) => v.operation === 'validate' && v.exit_code === 0 && v.receipt?.material.head_revision === m.admission_observed.head && v.receipt?.proof_plan_digest === receipt.proof_plan_digest);
  assert(standalone && await valueHash(standalone.plan) === await valueHash(publication.proof.expected_plan), 'publication_plan_source');
  const binding = publication.proof.laya.binding;
  assert(publication.proof.suite.expected_plan_digest === receipt.proof_plan_digest && binding.proof_plan_digest === receipt.proof_plan_digest && binding.evidence_digest === receipt.evidence_digest, 'publication_proof_binding');
  assert(publication.proof.suite.results.length === 2 && publication.proof.suite.results.every((r: any) => r.observation.kind === 'executed' && r.observation.conclusion === 'success' && r.observation.exit_code === 0), 'publication_checks');
  assert(publication.event_id === readback.record_id && record_digest === readback.record_digest && receipt.invocation_id === publication.event_id, 'publication_record_identity');
  assert(receipt.material.head_revision === m.admission_observed.head && receipt.material.accepted_base_revision === m.admission_observed.base && await valueHash(receipt.material) === await valueHash(publication.proof.material), 'publication_subject');
  assert(readback.record_time_ns >= readback.publisher_invocation.started_ns && readback.record_time_ns <= readback.publisher_invocation.ended_ns && readback.publisher_invocation.exit_code === 0 && readback.publisher_invocation.binary_sha256 === m.kernel.binary_sha256, 'publication_time');
  assert(readback.publication_ready === false && readback.current_admission_applicable === false && readback.merge_authorized === false, 'historical_readback_authority');
}
async function rejected(action: () => Promise<void>, reason: string) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && error.message === 'launch_' + reason, 'unexpected_negative_result'); return;
  }
  throw Error('launch_negative_control_was_admitted');
}
export async function verifyLaunch() {
  const m = await read(root + 'manifest.json'), c = await read(root + 'capture.json');
  const production = await read('media/launch-production.json');
  assert(production.schema === 'decapod.launch-production.v1' && production.approved_manifest_sha256 === await hash(await Deno.readFile(root + 'manifest.json')), 'unreviewed_manifest');
  assert(production.approved_controls_sha256 === await hash(await Deno.readFile(root + 'controls.json')), 'unreviewed_controls');
  assert(m.schema === 'decapod.agent-acceptance.v1' && m.observed_autonomous_admission === true, 'real_admission_required');
  assert(m.publication_ready === false && m.merge_authorized === false && m.human_interventions === 0, 'authority_or_intervention');
  assert(m.current_admission_applicable === false, 'historical_admission_required');
  assert(m.run_id === c.run_id && m.objective.text === c.objective, 'run_identity');
  assert(c.approved_objective_sha256 === await hash(bytes(c.objective)), 'objective_digest');
  const origin = await read(root + 'objective-provenance.json');
  assert(production.approved_objective_provenance_sha256 === await hash(await Deno.readFile(root + 'objective-provenance.json')) && origin.schema === 'decapod.launch-objective-provenance.v1' && origin.run_id === m.run_id && origin.objective === c.objective && origin.selected_by === 'controller_agent' && origin.direct_human_authorship_attested === false && origin.post_objective_input_count === 0 && origin.publication_ready === false && origin.merge_authorized === false, 'objective_provenance');
  assert(origin.human_mission_file === 'human-mission.txt' && origin.human_mission_sha256 === await hash(await Deno.readFile(root + 'human-mission.txt')), 'human_mission_digest');
  const witnesses: Record<string, unknown[]> = {};
  for (const [name, value] of Object.entries(c.artifacts)) {
    const a = value as {file: string; sha256: string};
    assert(/^[a-z]+\.json$/.test(a.file), 'witness_path');
    const path = root + a.file, info = await Deno.lstat(path);
    assert(info.isFile && !info.isSymlink, 'regular_witness_required');
    assert(await hash(await Deno.readFile(path)) === a.sha256, 'altered_witness');
    witnesses[name] = await read(path);
  }
  const bySequence = new Map(c.events.map((e: {sequence: number}) => [e.sequence, e]));
  const kinds = new Set<string>();
  for (const event of m.events) {
    const origin = bySequence.get(event.sequence) as {artifact: string; pointer: string};
    assert(origin, 'missing_source_event');
    const a = c.artifacts[origin.artifact];
    assert(event.id === await hash(bytes(`${c.run_id}:${event.sequence}:${a.sha256}:${origin.pointer}`)), 'event_digest');
    assert(event.source === a.source && event.evidence.sha256 === a.sha256 && event.evidence.pointer === origin.pointer, 'event_source');
    const source = witnesses[origin.artifact][Number(origin.pointer.slice(1))] as Record<string, any>;
    assert(source, 'missing_witness');
    kinds.add(event.kind);
    const facts = event.facts;
    if (event.kind === 'fresh_validation_observed') {
      assert(source.operation === 'validate' && source.exit_code === 0 && source.output.publication_ready === true, 'validation_source');
      assert(facts.head === source.receipt.material.head_revision && facts.base === source.receipt.material.accepted_base_revision && facts.receipt_hash === source.receipt.receipt_hash, 'validation_facts');
      assert(facts.checks === source.observations.results.length && facts.checks === 2, 'validation_check_count');
      assert(source.observations.results.every((r: any) => r.observation.kind === 'executed' && r.observation.conclusion === 'success' && r.observation.exit_code === 0), 'incomplete_checks');
    }
    if (event.kind === 'required_check_failed') {
      assert(source.operation === 'validate' && source.exit_code !== 0, 'failure_source');
      assert(source.observations.results.some((r: any) => r.key.job === 'authorization-contract' && r.observation.kind === 'executed' && r.observation.conclusion === 'failure' && r.observation.exit_code === 1), 'engineering_failure_required');
    }
    if (event.kind === 'pr_admission_independently_correlated') {
      assert(a.source === 'github' && facts.head === source.head && facts.base === source.base && facts.pr_url === source.url && source.merged === false, 'forge_facts');
      assert(m.admission_observed.head === facts.head && m.admission_observed.base === facts.base, 'admission_identity');
    }
  }
  for (const kind of ['objective_received','context_consulted','task_claimed','workspace_bound','required_check_failed','agent_changed_failed_source','fresh_validation_observed','publication_observed','pr_admission_independently_correlated']) assert(kinds.has(kind), 'missing_' + kind);
  const controls = await read(root + 'controls.json');
  for (const name of ['source_mutation','target_advancement']) assert(controls[name].exit_code !== 0 && controls[name].reason_codes.length > 0, 'negative_control');
  assert(controls.primary_agent_head === m.admission_observed.head && controls.merge_authorized === false, 'control_identity');
  // The exact publication-time proof is distinct from standalone validation
  // and the later task-completion proof. Verify hashes and observed identity;
  // this readback does not import authority or replace the Rust verifier.
  const publication = await read(root + 'publication-record.json');
  const receipt = await read(root + 'publication-receipt.json');
  const readback = await read(root + 'publication-proof-readback.json');
  const receiptFileDigest = await hash(await Deno.readFile(root + 'publication-receipt.json'));
  await verifyPublishedProof(publication, receipt, readback, m, witnesses.kernel, receiptFileDigest);
  // Even self-consistent rewritten wrapper hashes cannot replace observed proof.
  const altered = structuredClone(publication), alteredReadback = structuredClone(readback);
  altered.proof.suite.results[0].observation.output_digest = 'sha256:' + '0'.repeat(64);
  const {record_digest: ignored, ...alteredBody} = altered;
  altered.record_digest = await valueHash(alteredBody); alteredReadback.record_digest = altered.record_digest;
  await rejected(() => verifyPublishedProof(altered, receipt, alteredReadback, m, witnesses.kernel, receiptFileDigest), 'approved_publication_proof');
  await rejected(() => verifyPublishedProof(publication, receipt, {...readback, publication_ready:true}, m, witnesses.kernel, receiptFileDigest), 'historical_readback_authority');
  const report = await read('assets/decapod-launch-render.json');
  assert(report.run_id === m.run_id && report.manifest_sha256 === await hash(await Deno.readFile(root + 'manifest.json')), 'render_source');
  assert(report.production_config_sha256 === await hash(await Deno.readFile('media/launch-production.json')), 'production_config');
  assert(report.outputs.length === 3 && new Set(report.outputs.map((o: any) => o.variant)).size === 3, 'variants');
  for (const output of report.outputs) {
    const stem = 'assets/decapod-launch' + (output.variant === 'main' ? '' : '-' + output.variant);
    assert(await hash(await Deno.readFile(stem + '.mp4')) === output.video_sha256 && await hash(await Deno.readFile(stem + '.vtt')) === output.captions_sha256, 'render_bytes');
    assert(output.duration === (output.variant === 'social' ? 12 : 56), 'duration');
  }
  console.log(JSON.stringify({scope:'offline_launch_source',observed_run:m.run_id,witnesses:Object.keys(witnesses).length,events:m.events.length,media_variants:3,publication_negative_controls:2,merge_authorized:false,deployed_playback_verified:false}));
}

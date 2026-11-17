// Offline presentation regression gate. This grants no kernel authority.
const root = 'evidence/pi-1758-20261117-01/';
const read = async (p: string) => JSON.parse(await Deno.readTextFile(p));
const hash = async (bytes: Uint8Array) => 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(v => v.toString(16).padStart(2, '0')).join('');
const bytes = (s: string) => new TextEncoder().encode(s);
const assert = (condition: unknown, message: string) => { if (!condition) throw Error('launch_' + message); };
export async function verifyLaunch() {
  const m = await read(root + 'manifest.json'), c = await read(root + 'capture.json');
  assert(m.schema === 'decapod.agent-acceptance.v1' && m.observed_autonomous_admission === true, 'real_admission_required');
  assert(m.publication_ready === false && m.merge_authorized === false && m.human_interventions === 0, 'authority_or_intervention');
  assert(m.run_id === c.run_id && m.objective.text === c.objective, 'run_identity');
  assert(c.approved_objective_sha256 === await hash(bytes(c.objective)), 'objective_digest');
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
  const report = await read('assets/decapod-launch-render.json');
  assert(report.run_id === m.run_id && report.manifest_sha256 === await hash(await Deno.readFile(root + 'manifest.json')), 'render_source');
  assert(report.outputs.length === 3 && new Set(report.outputs.map((o: any) => o.variant)).size === 3, 'variants');
  for (const output of report.outputs) {
    const stem = 'assets/decapod-launch' + (output.variant === 'main' ? '' : '-' + output.variant);
    assert(await hash(await Deno.readFile(stem + '.mp4')) === output.video_sha256 && await hash(await Deno.readFile(stem + '.vtt')) === output.captions_sha256, 'render_bytes');
    assert(output.duration === (output.variant === 'social' ? 12 : 56), 'duration');
  }
  console.log(JSON.stringify({scope:'offline_launch_source',observed_run:m.run_id,witnesses:Object.keys(witnesses).length,events:m.events.length,media_variants:3,merge_authorized:false,deployed_playback_verified:false}));
}

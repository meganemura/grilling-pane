# 0007. CI runs the same three gates, pinned

- Status: accepted
- Date: 2026-09-17

## Context

The three quality gates — `claude plugin validate plugin`, `tsc -p plugin/hooks`, the plugin
tests — ran locally only, before a commit. Running them on every push and pull request checks
every change the same way, automatically.

None of the three gates calls the model, so the workflow needs no API credential.

## Decision

`.github/workflows/test.yml` runs on every push to `main` and every pull request:

- `actions/checkout`, then `actions/setup-node` (Node `22.23.2`)
- `npm install -g @anthropic-ai/claude-code@2.1.273`
- `/plugin-types`, under `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (the flag the plugin itself
  needs). This step writes `.claude/types/claude-code.d.ts`, which `tsc` reads
- the three gates: `claude plugin validate plugin`,
  `npx --yes --package typescript@7.0.2 tsc -p plugin/hooks`, and `claude plugin test plugin`

## Consequences

- `@anthropic-ai/claude-code@2.1.273` was published on 2026-09-15, two days before this decision.
  It is a stated exception to the rule that a pinned version is 7 or more days old.
  `claude plugin test` first shipped in that version, so no older version can run the third gate.
- Revisit the pin on or after 2026-09-22.
- The local gates ran on `2.1.274`. The first CI run, on 2026-09-17, ran the same gates on
  `2.1.273` on a clean runner. All 23 tests passed.
- The other pins are older than 7 days: `actions/checkout` v7.0.1 (2026-07-20),
  `actions/setup-node` v7.0.0 (2026-07-14), `typescript@7.0.2` (2026-07-08), and Node `22.23.2`
  (2026-07-29).
- Bumping any pinned version is a deliberate edit to this file, never an implicit `latest` on
  the next run.
- A person can still run `npx -p typescript tsc -p plugin/hooks` locally, against whatever
  `typescript` npm already resolves. Only CI is pinned to `7.0.2`.

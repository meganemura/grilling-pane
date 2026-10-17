# AGENTS.md

Context for agents that work in this repository.

## What this is

grilling-pane, a Claude Code plugin with two parts. Its skill,
`grilling-pane:grilling`, invokes Matt Pocock's `grilling` skill from
mattpocock/skills to interview the person about a plan. It sets one part
of the upstream skill's method: each round's questions go in a block,
with fixed options, that the pane can read. A
hooks module (a mod) reads that block from the transcript. It
draws every open question in a pane beside the transcript, as a radio made
of one button per option. It submits all answers as one prompt. A
question the person did not answer is submitted as skipped.

The purpose is fewer turns. The person answers a batch at once instead of
one question per turn.

On Claude Code Desktop the pane is one `Client` (`plugin/hooks/pane-client.ts`)
instead. There, each press sends one answer at once, and the pane keeps every
question of the conversation in place. See `docs/decisions/0013`.

The plugin lives in `plugin/`. There is no build step and no runtime package
dependency.

## Visibility

The repository is public. Commit messages, comments, README and docs are
in English. Follow ASD-STE100 Simplified Technical English. `README.ja.md`
is the one Japanese file: a copy of `README.md` for Japanese readers. Change
the two together, and keep the `[Japanese](README.ja.md)` link at the end of
`README.md`. Test fixtures
use invented plans and questions, never a real project's.

## Rules

- Mods are early access. Claude Code 2.1.287 and later load them by
  default; CI pins 2.1.280, where the module loads only with
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, so the CI and test commands set
  it. The API can change between
  releases. The types come from `/plugin-types`, which writes
  `.claude/types/claude-code.d.ts` at the repository root; that directory is
  gitignored, so run `/plugin-types` once in a new checkout.
- The validator reads the module statically. Hand `$` only to function
  declarations at the top of the module, and spell every call
  `$.noun.event(...)`. Build one `host` bundle of closures over `$` at
  `session.start`; the rest of the module holds the host, never `$`.
- Never read the transcript from the render hook. Parse on `turn.complete`
  and on `session.start`, keep the result in state, and draw from state.
- The transcript is the source of truth. Every question the pane shows is
  in an assistant message, and every answer the pane submits is a prompt
  that repeats the question text. Nothing lives only in the pane.
- Every `Pane` element prop must be one the surface declares. One unknown
  prop drops the whole tree without a message. Type the element constructors
  with `Elements['terminal' | 'desktop']`, the two surfaces the pane draws
  on, so the compiler catches it.
- Tests are `plugin/tests/*.test.ts`, run with
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test plugin`. They stub
  `session.messages`, `prompt.submit`, `ui.status` and `store`. The block
  parser and the answer formatter are plain functions with their own tests.
- Quality gates: `claude plugin validate plugin`, `npx -p typescript tsc -p
  plugin/hooks`, and the plugin tests. Run all three before a commit.
- Development loop: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir
  "$PWD/plugin"` in a real terminal. `-p` has no pane surface. Hook failures
  are fail-open and appear only in `~/.claude/debug/<session>.txt`.
- Design decisions go to `docs/decisions/` as short numbered notes
  (Context / Decision / Consequences).
- Commits are semantic units. Comments say why, not what. Each module starts
  with its responsibility and what it must not know about.
- Adding a dependency: exact pin, released 7 or more days ago with no
  security fix after it, and ask the owner first with the reason.
- The plugin's skill is listed as `/grilling-pane:grilling`; the plugin
  name comes first.

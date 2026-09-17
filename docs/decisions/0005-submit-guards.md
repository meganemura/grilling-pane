# 0005. Submit guards: zero picks, and what a sent question leaves behind

- Status: accepted
- Date: 2026-09-17

## Context

`Submit` sits above the questions and below them, so a long round reaches it without scrolling.
That placement puts it one Enter press away from focus right after the pane opens. A person who
lands there by accident, before choosing anything, would send a round of pure `(skipped)`
answers. That spends a turn the person may not have meant to spend. A person who does want to
skip every question in a round can still type that in the prompt box directly.

A sent round has to stop showing in the pane, once Submit sends it. Otherwise the person sees
the round twice: once as a still-open question, and again once the answer lands in the
transcript. A prompt submitted during a running turn waits for that turn, and the module reads
the transcript again at that turn's `turn.complete`. At that moment, the waiting prompt may not
be in the transcript yet, so the module keeps its own memory of what it sent.

## Decision

Submit does nothing while a round it already sent is on its way. Submit also does nothing when
the currently shown questions have zero picks. It sets a status line asking for at least one
pick.

Otherwise, Submit calls `answersTextOf` on the shown questions and their picks, and passes the
result to `host.submit`. When the result carries no `drop`, the module remembers the sent
questions by their identity, and clears their picks. It treats them as sent from then on. This
memory lives outside the parsed transcript state, so a `turn.complete` that fires before the
answer lands does not bring the sent questions back. When the result does carry a `drop`, the
module leaves the questions and their picks untouched, as if Submit had not run.

## Consequences

- One accidental Enter at Submit, before any pick, costs only a status message.
- A sent round disappears from the pane at the moment of the press, ahead of the answer text
  reaching the transcript.
- The memory of sent questions is process memory only. A reload of the module (a fresh session,
  or a plugin reload during development) forgets it. A question the transcript already shows as
  answered still reads as answered, from the transcript itself.
- A `drop` result means the host declined to submit the prompt. It leaves the round exactly as
  the person left it, so nothing has to be re-picked.

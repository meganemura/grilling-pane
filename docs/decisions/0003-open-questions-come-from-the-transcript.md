# 0003. Open questions come from the transcript

- Status: accepted
- Date: 2026-09-17

## Context

The pane has to know, at any moment, which questions still need an answer. That set can change from
three places:

- a new assistant message with a fresh `grilling` block
- a new user message that answers some of the open ones
- the person's own picks inside the pane, before Submit

The pane needs one source for "which questions exist", the transcript itself, so its own state always
matches what the transcript shows.

`$.session.messages()` is the one call that reads the transcript. Calling it from the render hook would
run it on every redraw. That redraw happens several times a second while the pane is open, for data
that only changes on a new message.

## Decision

The hooks module reads `$.session.messages()` and rebuilds the open-question list at three points:
`session.start`, `turn.complete`, and the `/grilling-pane` command opening the pane. The render hook
draws only from that stored state. It never calls `session.messages` itself.

Rebuilding reads the latest round only: the most recent assistant message that has one or more
`grilling` blocks, parsed with `questionsOf`. Every earlier round's questions drop from the pane this
way, whether or not the person answered them. Without this rule, a new `grilling` block, or a new
round, left the previous round sitting in the pane with no way to clear it.

Rebuilding also walks every user message for an `Answers (grilling-pane):` block, to find which of the
latest round's own questions are already answered. A question counts as answered when some answer line
starts with `` Q${number} ${text} → ``. Matching requires the number and the question text together.
Two questions can share a number by coincidence, so matching by number alone would let one answer mark
both of them answered. The parser reads an answer block only on a user message. It skips an assistant
message that quotes the header back, which happens when the model discusses a past answer.

`session.messages()` returns only the newest 4096 messages. A `grilling` block older than that window
drops out of the open-question list along with the rest of that message.

A stored flag, `wantsOpen`, records whether the person wants the pane, apart from whether the pane is
open right now. `$.store` is one file for the whole plugin, kept between sessions and shared by every
session. `/grilling-pane` sets the flag on show, and clears it on hide; closing the pane clears it too.
While set, the pane opens without keyboard focus when a session starts with open questions. It also
opens this way when a finished turn brings open questions while the pane is closed. With zero open
questions, the pane stays closed.

## Consequences

- The render hook stays cheap: it never touches the transcript, only the state the two parse points
  already built.
- A question's answered state always traces back to a specific line in a specific message, readable
  outside the pane.
- A conversation long enough to push a block past 4096 messages loses that question from the pane.
  The assistant can ask it again, under a new number.
- A question the person did not answer before the next round arrived is gone from the pane. The
  skill's own rule, to re-ask an unanswered question under a new number, is what brings it back.
- Matching on the number-and-text pair keeps a duplicate number from letting one answer hide two
  questions.
- A person who used the pane once gets it again in every later session, in any directory. It opens
  the moment a `grilling` block appears, until they hide it.
- Tried in a real terminal: a session resumed in a new process, with the flag still set. It reopened
  the pane, drew only the unanswered questions, and counted skipped ones as answered.

# 0003. Open questions come from the transcript

- Status: accepted
- Date: 2026-09-17

## Context

The pane has to know, at any moment, which questions still need an answer. That set can change
from three places:

- a new assistant message with a fresh `grilling` block
- a new user message that answers some of the open ones
- the person's own picks inside the pane, before Submit

The pane needs one source for "which questions exist", the transcript itself, so its own state
always matches what the transcript shows.

`$.session.messages()` is the one call that reads the transcript. Calling it from the render hook
would run it on every redraw. That redraw happens several times a second while the pane is open,
for data that only changes on a new message.

## Decision

The hooks module reads `$.session.messages()` and rebuilds the open-question list at three
points: `session.start`, `turn.complete`, and the `/grilling-pane` command opening the pane. The
render hook draws only from that stored state. It never calls `session.messages` itself.

Rebuilding walks every assistant message for `grilling` blocks with `questionsOf`, and every
user message for an `Answers (grilling-pane):` block. A question counts as answered when some
answer line starts with `` Q${number} ${text} → ``. Matching requires the number and the question
text together. Two questions can share a number by coincidence. Matching by number alone would
let one answer mark both of them answered. The parser reads an answer block only on a user
message. It skips an assistant message that quotes the header back, which happens when the model
discusses a past answer.

`session.messages()` returns only the newest 4096 messages. A `grilling` block older than that
window drops out of the open-question list along with the rest of that message.

## Consequences

- The render hook stays cheap: it never touches the transcript, only the state the two parse
  points already built.
- A question's answered state always traces back to a specific line in a specific message,
  readable outside the pane.
- A conversation long enough to push a block past 4096 messages loses that question from the
  pane. The assistant can ask it again, under a new number.
- Matching on the number-and-text pair keeps a duplicate number from letting one answer hide two
  questions.
- Tried in a real terminal, a session resumed in a new process. It reopened the pane from its
  stored flag, and drew only the unanswered questions, counting skipped ones as answered.

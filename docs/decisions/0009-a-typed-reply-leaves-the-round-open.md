# 0009. A typed reply leaves the round open, unless it names a question

- Status: accepted
- Date: 2026-09-18

## Context

A person can answer a round by typing a plain message instead of pressing buttons. A model reads
a typed reply as the whole answer to the turn it opened. Without more context, it tends to treat
every question the reply does not name as skipped. It then moves on with each one's recommended
option. The person may have meant to answer only part of the round.

## Decision

When a person submits a plain prompt while a round is open, the module attaches a context note
to it. The model reads this note; the person does not see it. The note lists the open question
numbers and states: this is not the answer sheet. A question it does not name stays open, neither
skipped nor answered with the recommendation. A new round must carry each still-open question
forward with the same number and the same text. This lets the pane keep the person's picks on it.

`grilling-pane:grilling` carries the same rule in its own text. A typed reply answers only the
questions it names. Every other question of that round stays open. The next round carries each
one forward unchanged, under the same number and text. This is the one case where the skill
reuses a number on purpose.

## Consequences

- The note lists the open round as the transcript already shows it, not the person's own
  unsubmitted picks in the pane. The two can differ; the note always reflects the transcript.
- The person never sees the note. Nothing about typing a plain reply looks different to them
  from typing any other message.
- A model that ignores the note still has the skill's own rule to follow, so the behaviour does
  not depend on the note alone.
- A carried-forward question keeps its identity: same number, same text. The pane matches on
  that pair, so the person's picks on it survive into the new round instead of resetting.

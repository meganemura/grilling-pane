# 0008. A discuss answer, and the pane's layout

- Status: accepted
- Date: 2026-09-18

## Context

A question's options are fixed, chosen by the model. A person who has something else in mind,
an option the list does not offer, had only one way out: leave the question unanswered. A skip
reads as "no preference" to a person. A model tends to read it as quiet agreement with the
recommended option instead, since nothing in the answer says otherwise.

Question and options also read as one column of plain text, with nothing to mark the question
as the heading of its own group. A long round makes this worse: a person scanning down the pane
has to reread each line to tell a question from an option.

## Decision

The pane adds one more option to every question: `Talk about this one`, placed last. The pane
draws this option itself; the model never writes it. Picking it sends `(discuss)` in the answer
prompt, in place of a chosen label. `grilling-pane:grilling` reads `(discuss)` as a request: the
person wants an option the list did not offer, or wants to talk the question through before
choosing. On seeing it, the skill states the alternatives it sees, and asks what the person has
in mind, outside any block. It keeps the question open for a later round.

The pane also draws with layout and colour, instead of one plain column. The question line is
bold and cyan. Its options sit two cells in under it, each a marker and the option text. `(*)`
is green for the picked option. `( )` is dim for every other one, including `Talk about this
one`. A recommended option's reason sits in dim, on its own line under that option.

## Consequences

- `(discuss)` only ever appears in an answer prompt. The model never writes `Talk about this
  one` into a `grilling` block. A person reading the transcript sees the word only in an answer
  line, never as a listed choice.
- The colours come from the surface's own named colours, not from an ANSI code this plugin
  picks itself.
- Whether the model handles `(discuss)` as the skill asks depends on the model following the
  skill. The pane sends the same text either way; it cannot make the model discuss the question.

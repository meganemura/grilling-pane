# 0010. A discuss answer carries a comment

- Status: accepted
- Date: 2026-09-28

## Context

`Talk about this one` sends `(discuss)` and nothing more (0008). The model then has to ask what
the person has in mind, and the person answers in the next turn. That costs one full turn per
discussed question, and the plugin exists to cut turns. The person often knows the answer to
that question already, at the moment they pick `Talk about this one`.

## Decision

A discuss pick draws a one-line `Input` under the option. The pane moves the focus ring into
it when the person presses `Talk about this one`. The text the person types rides after the
marker on the same answer line: `Q<n> <question> → (discuss) <comment>`. An empty field sends
a plain `(discuss)`.

- Enter in the field keeps the text and sends nothing. Other questions of the round may still be
  open, and `Submit` stays the one control that sends.
- After Enter, the terminal empties the field for its key. That empty text wins over the
  `value` the pane draws, until the pane draws a different `value`. So each Enter gives the
  field a fresh key, `q<i>:discuss:comment:<n>`, and moves the focus ring onto it. The new key
  has no text of its own, and the field shows the kept text again.
- The pane folds every run of whitespace in the comment into one space. An answer line ends at
  its line break, so a pasted break would cut the comment off the answer.
- The pane keeps the comment apart from the pick. A person who picks another option and then
  picks `Talk about this one` again gets the text back. Submit sends the comment only with a
  discuss pick.
- `grilling-pane:grilling` reads the comment as what the person has in mind, and replies to it
  before it asks anything more.

## Consequences

- The answer line keeps the prefix `Q<n> <question> → ` (0002). `openQuestionsOf` marks a
  question answered by that prefix, so it reads a commented line the same way.
- The comment lives in the pane until Submit sends it, as a pick does. A reload of the module
  loses both.
- The test kit does not pass `$.ui.focus` to a test's `ui.focus` hook, so the tests do not
  check the focus move. A real terminal checks it.

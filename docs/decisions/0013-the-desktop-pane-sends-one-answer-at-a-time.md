# 0013. The desktop pane sends one answer at a time

- Status: accepted
- Date: 2026-10-15

## Context

On Claude Code Desktop, the pane drew the same tree as on the terminal (see 0012). The person
picked options, then pressed `Submit` for the whole round. Three problems showed:

- The person could not see the effect of one answer before the other answers. A follow-up
  question came only after the whole round.
- Each redraw built the tree again from the hooks module. A new round removed the earlier rows
  and drew new ones, so the rows moved.
- The comment field took its text from the hooks module on each redraw. Text that the person
  typed after the last `onInput` reached the module was lost.

A `Client` element runs a surface module on the drawing side. The engine keeps the instance and
its local state across redraws while its key stays in the tree. New props reach the running
instance with its state kept.

## Decision

On the `desktop` surface, the pane is one `Client` (`hooks/pane-client.ts`) under one fixed key.
The terminal keeps the tree and the `Submit` of 0004 and 0005.

- A press on an option sends one prompt at once: the header, one answer line, and a
  `Still open (grilling-pane):` line with the numbers of the questions not answered yet. Enter in
  a discuss field sends `(discuss)` with the text. The person can press again while a turn runs:
  `$.prompt.submit` waits for the session to be idle.
- The `Client` posts every answer it has not seen as sent. The hooks module sends only the
  answers for open questions that it did not send before, so a repeated post sends nothing.
- The pane shows every question of the conversation (`historyOf`), one row for each identity, in
  number order. Numbers only go up, so a new round adds rows at the end. A row stays in its place
  when its status changes.
- The model can write `Drop Q<n>: <reason>` in a block. A question that a Drop line names, or
  that an earlier round asked and the latest round does not ask again, is dropped. The pane
  draws it in grey with its reason, and its options as text with no Button.
- The typed text of a comment field, the open discuss fields, and the answers sent but not yet in
  the props are in the `Client`'s local state. `onInput` changes the local state in place and
  does not ask for a redraw.

## Consequences

- One answer costs one model turn. The person gets follow-up questions sooner, and pays with more
  turns. The skill asks for a short turn.
- The transcript is still the source of truth: every answer is a prompt that repeats the
  question text, and every dropped question has its Drop line or a later round without it.
- A long conversation makes a long pane. The pane body scrolls.
- The `Still open` line is not an answer line, so `answerLinesOf` stops at it.
- A check in the real desktop app is still to do: the test kit checks the tree that the `Client`
  draws and its posts, not how the desktop paints it.

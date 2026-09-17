# 0002. Answers are one prompt that repeats the question

- Status: accepted
- Date: 2026-09-17

## Context

Submit needs to hand every chosen answer to the model in one turn, through one call the engine
gives a hook: `$.prompt.submit({ text })`. The text has to let a person read the prompt alone,
later in the transcript. It has to show which question each answer belongs to, and what was
chosen.

A version that sent only the option label (`per user`) would read as an answer with no
question beside it, once several turns had passed. A version that sent only the number
(`Q13: per user`) still forces a person back to the assistant message to read the question text.

Skipped and answered both need to be visible outcomes. A person who skips a question on purpose,
and a question the pane never showed, both look empty if the prompt omits the question. The text
has to mark a skip explicitly. Without that mark, the two read the same way later.

## Decision

`Submit` sends one prompt, built by `answersTextOf`:

```
Answers (grilling-pane):
Q13 Is the loan cache per user, or one for the whole library? → Per user
Q14 Does an entry expire by time, or on write? → (skipped)
```

The first line is a fixed header, `Answers (grilling-pane):`. Each question gets one line,
`Q<n> <question text> → <chosen label>`, repeating the question text so the line reads on its
own. A question left unchosen gets `(skipped)` in place of a label. This gives the outcome a
name. No line reads as a blank left by accident. The chosen label carries no recommendation
mark, since the mark's purpose ends once the choice is made.

`prompt.submit` sends the text as its own turn. `$.prompt.fill` would replace the whole prompt
box, erasing anything the person had already typed there. A prompt a plugin submits runs once
the session goes idle, so a Submit pressed during a running turn waits for that turn to end.

## Consequences

- A person can read any past answer with only the transcript open, no pane required.
- Marking `(skipped)` in the text distinguishes an intended skip from a question the person
  never saw.
- The prompt box's own contents, if any, are never touched by a Submit press.
- `answersTextOf` is a pure function: it takes the questions and the picks, and returns the text.
  The hooks module supplies the picks; the function does not read state on its own.

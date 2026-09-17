# 0001. Questions live in a grilling fenced block

- Status: accepted
- Date: 2026-09-17

## Context

The skill asks many questions in one message. The pane needs a fixed place to read them from.
A person reading the transcript later needs to find question 13 without searching prose.

`AskUserQuestion` accepts up to four questions in one call. A plan often raises more than four
questions in one turn. A skill built only on `AskUserQuestion` then needs several calls in a
single turn. Those calls cost several round trips, the cost this plugin exists to remove.

A YAML or JSON block can carry the same fields, but it reads as code to a person scanning the
transcript. It also competes with the model's own prose. The plan summary and the assumptions
behind the questions sit next to the questions themselves, in text a person reads without
parsing syntax.

## Decision

A question is a line inside a fenced code block labeled `grilling`, written as plain text in
the model's own assistant message:

```
Q13: Is the loan cache per user, or one for the whole library?
- Per user (recommended: it matches the authorization boundary)
- One for the whole library
```

Each question keeps one number for the whole conversation. The skill starts numbering after the
highest number already in the transcript, and never reuses one. A later message can refer to
"Q13" and mean one exact question, no matter how many turns passed since it was asked.

## Consequences

- Every question the pane shows also exists as plain text in the transcript, readable with the
  plugin uninstalled.
- One numbering sequence across turns lets the model, the person, and the pane all name the same
  question the same way.
- The hooks module reads the block with a plain-text parser. It never parses YAML or JSON.
- A block with no closing fence still parses: the block runs to the end of the message text.

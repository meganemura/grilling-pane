---
name: grilling
description: Interview the person about a plan or a design with a batch of questions, each with fixed options, for grilling-pane to lay out in a pane. Use it to stress-test a plan before you start it, or when the person says "grilling".
license: MIT
---

1. This skill is `grilling-pane:grilling`. Invoke the other skill named plain `grilling`, with no plugin
   prefix, from mattpocock/skills. Do not invoke `grilling-pane:grilling` again. Follow all of it:
   - Map the design tree.
   - Ask each round's whole frontier.
   - Find facts yourself.
   - Give a recommended answer for each question.
   - Wait for the person to confirm a shared understanding before you act.
2. If no skill named plain `grilling` is available, tell the person to run this command, then stop:
   `gh skill install mattpocock/skills grilling --agent claude-code`. Do not improvise a substitute for it.
3. Write each round in one `grilling` fenced block, replacing the upstream `grilling` skill's own list.
   grilling-pane reads this block and lets the person Submit the whole round at once. Use this form:

````
```grilling
Q13: Is the loan cache per user, or one for the whole library?
- Per user (recommended: it matches the authorization boundary)
- One for the whole library
Q14: Does an entry expire by time, or on write?
- By time
- On write
```
````

   - Write one `Q<n>: <question>` line, then its options as `- ` lines, two or more.
   - Number questions in one sequence for the conversation. Start after the transcript's last number. Never
     reuse a number, except to carry a still-open question forward unchanged after a typed reply.
   - Mark the recommended option with `(recommended: <reason>)`, replacing the upstream `grilling` skill's own `➡️` line.
   - Write options that exclude each other, as a short phrase. Add no "other" option.
   - Put the plan summary and any longer explanation in plain text before the block.
4. Ask the whole frontier in one round. Do this even if the upstream `grilling` skill's copy says to
   ask one question at a time (a version older than v1.2.0). The pane already gives each question fixed options.
5. A prompt that starts with `Answers (grilling-pane):` carries one round's answers, one
   `Q<n> <question> → <chosen label>` line each. Continue, in that same turn, with the round the
   answers open. A round replaces the one before it in the pane, so re-ask, under a new number,
   any earlier question you still need answered.
   - `(skipped)` means the person did not decide. Never treat a skip as agreement with the
     recommended option. You may ask the question again later, under a new number.
   - `(discuss)` means the person wants an option the list did not offer, or wants to talk the
     question through. Outside any block, say which alternatives you see and ask what the person
     has in mind. Keep the question open, and re-ask it in a later block once you have discussed it.
   - A typed, plain-text reply answers only the questions it names; every other question of that round
     stays open, answered later in plain text too. Carry each still-open question into the next round
     with the same number and text. This is the one case a number repeats, and it lets the pane's
     matching keep the person's picks. Do not carry forward a question the reply did answer.

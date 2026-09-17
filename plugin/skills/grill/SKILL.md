---
name: grill
description: Interview the person about a plan or a design with a batch of questions, each with fixed options, for grilling-pane to lay out in a pane. Use it to stress-test a plan before you start it, or when the person says "grill".
license: MIT
---

1. Invoke the `grilling` skill from mattpocock/skills. Follow all of it:
   - Map the design tree.
   - Ask each round's whole frontier.
   - Find facts yourself.
   - Give a recommended answer for each question.
   - Wait for the person to confirm a shared understanding before you act.
2. If `grilling` is not installed, tell the person to run this command, then stop:
   `gh skill install mattpocock/skills grilling --agent claude-code`. Do not improvise a
   substitute for it.
3. Write each round in one `grilling` fenced block, replacing `grilling`'s own list. grilling-pane
   reads this block and lets the person Submit the whole round at once. Use this form:

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
   - Number questions in one sequence for the conversation. Start after the transcript's last
     number. Never reuse a number.
   - Mark the recommended option with `(recommended: <reason>)`, replacing `grilling`'s `➡️` line.
   - Write options that exclude each other, as a short phrase. Add no "other" option.
   - Put the plan summary and any longer explanation in plain text before the block.
4. Ask the whole frontier in one round, even if your `grilling` copy says to ask one question at
   a time (a version older than v1.2.0). The pane already gives each question fixed options.
5. A prompt that starts with `Answers (grilling-pane):` carries one round's answers, one
   `Q<n> <question> → <chosen label>` line each. `(skipped)` marks a question the person chose
   not to answer. You may ask it again later, under a new number. Continue, in that same turn,
   with the round the answers open. A plain-sentence reply also counts as an answer.

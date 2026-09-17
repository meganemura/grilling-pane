# grilling-pane

[![test](https://github.com/meganemura/grilling-pane/actions/workflows/test.yml/badge.svg)](https://github.com/meganemura/grilling-pane/actions/workflows/test.yml)

A Claude Code plugin (a Claude Mod) that interviews the person about a plan before Claude acts
on it. The `grill` skill runs Matt Pocock's `grilling` method. It writes each round of questions
in a block, and grilling-pane draws that block in a pane beside the transcript. One Submit sends
the person's answers to the whole round, in one turn.

## What it looks like

```
[ Submit ] 1 answered, 1 skipped

Q4 Where does the cache live?
[ ( ) In the memory of the application process ]
    recommended: the goal is desk latency, so a shared service
adds cost with no gain
[ ( ) In a shared store such as Redis ]

Q5 What does one lookup ask for?
[ (*) The loan state of one book copy ]
    recommended: a return changes one copy, so the write
invalidates exactly one entry
[ ( ) All loans of one patron ]

[ Submit ] 1 answered, 1 skipped
```

## Requirements

- Claude Code 2.1.273 or later, with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`
- The `grilling` skill from mattpocock/skills, v1.2.0 or later:
  `gh skill install mattpocock/skills grilling --agent claude-code`

## Install

```sh
claude plugin marketplace add meganemura/grilling-pane
claude plugin install grilling-pane@grilling-pane
```

To develop against a checkout, run the plugin from its working tree:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /path/to/grilling-pane/plugin
```

To set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` for each session, add it to the `env` of
`settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

## Use

Start with `/grilling-pane:grill <plan>`. Type `/grilling-pane` to show or hide the pane.
`/grilling-pane` also gives the pane keyboard focus. The arrow keys move between buttons. Enter
presses the focused button. Esc returns focus to the prompt box. A mouse click also presses a
button. Press an option's button to choose it; press the same button again to clear the choice
back to no pick. Press `Submit`, at the top or the bottom of the list, to send the round.

After you show the pane once, it opens on its own whenever a round arrives, without taking the
keyboard. Hide it with `/grilling-pane` to stop that.

## The question block

The skill writes each round inside a fenced block labeled `grilling`:

```grilling
Q13: Is the loan cache per user, or one for the whole library?
- Per user (recommended: it matches the authorization boundary)
- One for the whole library
Q14: Does an entry expire by time, or on write?
- By time
- On write
```

One `Q<n>: <question>` line starts a question; the `- ` lines under it are its options. A
recommended option ends in `(recommended: <reason>)`. Numbers run in one sequence across the
whole conversation and are never reused.

## The answer prompt

Pressing `Submit` sends one prompt, starting with the header `Answers (grilling-pane):`, with
one line per question:

```
Answers (grilling-pane):
Q13 Is the loan cache per user, or one for the whole library? → Per user
Q14 Does an entry expire by time, or on write? → (skipped)
```

## What skip means

Submit sends `(skipped)` for a question with no chosen option, naming an answer the person chose
not to give. This tells it apart from a question the person never saw. Submit sends nothing when
every question in the round has zero picks. The status line asks for at least one pick first.

## The transcript is the source of truth

Every question the pane shows is text inside an assistant message. Every answer the pane sends
is a prompt that repeats the question text. A person with the plugin uninstalled can still read
every question and every answer in the transcript alone.

## Development

Three gates run before a commit and in CI: `claude plugin validate plugin`,
`npx -p typescript tsc -p plugin/hooks`, and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin
test plugin`.

## Credits

The interview method is the `grilling` skill by Matt Pocock
(<https://github.com/mattpocock/skills>, MIT). grilling-pane adds the question block format and
the pane, and calls `grilling` for the method itself.

## License

MIT. See [LICENSE](LICENSE).

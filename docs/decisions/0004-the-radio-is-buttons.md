# 0004. The radio is buttons

- Status: accepted
- Date: 2026-09-17

## Context

Each question needs a radio: one option chosen out of several, with the recommended option and
its reason visible beside the choice. The surface offers a `Select` element, built for exactly
this kind of one-of-many choice.

Tried in a real terminal, `Select` draws as one closed dropdown line, showing only the current
value:

```
Q1 probe?
none ▾
[ Submit ]
```

The options appear only once the element has focus and opens:

```
Q1 probe?
none ▴
  per user
  one for all
[ Submit ]
```

A round of twenty questions would draw as twenty closed dropdowns, each hiding its own options
until focused one at a time. `Select` also has no slot to show a reason beside an option. A
recommendation mark would need a second element, one the person has to connect back to the right
option by position.

The test kit cannot drive `Select` either. `$.ui.select` does not exist on the test `$`, and
`$.ui.press` does not accept the key `Select` listens for. A test can press a `Button` directly,
which lets it choose an option the way a real press does.

## Decision

Each option is one `Button`. A chosen option reads `(*) label`. An unchosen one reads `( )`.
Pressing the same button again clears the choice, back to no pick. A recommended option's
reason sits on its own dim `Text` line, directly under its `Button`.

## Consequences

- Every option for every question is visible without a focus-and-open step. This costs vertical
  space; the pane scrolls to cover it.
- A `Submit` button sits above the questions and again below them, so a long round can be sent
  from either end without scrolling back up.
- A `Button`'s key names its position (`q0:o1:button`), since a duplicate question number can
  occur and a key still has to stay unique.
- The radio marks are ASCII, `(*)` and `( )`, so the width does not shift with the terminal's
  font.

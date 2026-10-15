# 0012. The pane draws on Claude Code Desktop

- Status: accepted; on the desktop, 0013 replaces the shared tree
- Date: 2026-10-15

## Context

Since Claude Code 2.1.287, mods load by default, and the Code tab of Claude Code Desktop draws
a mod's `Pane` on the `desktop` surface. The render hook drew only when `e.surface` was
`terminal` and passed every other surface to `next(e)`. On the desktop, the pane opened but
the engine drew its own body, with no questions in it.

The desktop's element table has `Box`, `Button`, `Input` and `Text` with the same props as the
terminal's. The mobile app's table has no `Input`.

## Decision

The render hook draws the same tree on `terminal` and `desktop`. `Ui` is typed with
`Elements['terminal' | 'desktop']`, so the compiler refuses an element or prop that one of the
two does not have. Other surfaces still go to `next(e)`.

## Consequences

- Tests render the pane on both surfaces and compare the trees, and submit a round from the
  desktop.
- The terminal draws the same tree as before.
- The ASCII radio marker and the fixed marker column were chosen for terminal fonts. The desktop
  draws them as text too. A desktop-only look would need a branch on `e.surface`.
- A check in the real desktop app is still to do: the test kit checks the tree, not how the
  desktop paints it.

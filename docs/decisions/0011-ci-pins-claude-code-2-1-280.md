# 0011. CI pins Claude Code 2.1.280

- Status: accepted
- Date: 2026-09-28

## Context

CI pinned Claude Code 2.1.273 (0007). The discuss comment field (0010) brought tests that type
into an `Input` through the test kit's `$.ui.input`. The test kit of 2.1.273 has no
`$.ui.input`, and neither has the one of 2.1.278. In both versions `$.ui.open` also answers
nothing, where the current engine answers `{ isPlaced }`. The typecheck gate failed on
2.1.273 for both reasons.

The type declarations of 2.1.280 have `$.ui.input` and `{ isPlaced }`. All three gates pass
on 2.1.280, with the 44 tests of release 0.4.0.

## Decision

CI installs `@anthropic-ai/claude-code@2.1.280`. The README states 2.1.280 or later as the
requirement, because that is the oldest version the gates ran on with the comment field.

## Consequences

- `2.1.280` was published on 2026-09-22, six days before this decision. It is a stated
  exception to the rule that a pinned version is 7 or more days old. The owner accepted it
  so that CI passes again on the day of release 0.4.0.
- No check was made for a security fix released after `2.1.280`. Revisit the pin on or after
  2026-09-29.

# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
stable release yet: version numbers may still change shape between releases.

## 0.3.0 - 2026-09-18

### Added

- A typed prompt while a round is open carries a context note to the model.
- The note lists the open question numbers and says the prompt is not the answer sheet.
- The note says a new round carries the open questions forward with the same number and text.
- The skill's own matching rule for a typed prompt.

### Changed

- `no open questions` is drawn in the middle of the pane.

## 0.2.1 - 2026-09-18

### Changed

- The question line is a near-white blue tint in place of cyan.

## 0.2.0 - 2026-09-18

### Added

- A `Talk about this one` option on every question, sent as `(discuss)`.
- The skill's own reading of `(discuss)` and `(skipped)`.

### Changed

- The pane shows the latest round only.
- The question line is bold and cyan. Its options sit indented under it, with a green marker on
  the picked one.
- The skill is named `grilling` (`/grilling-pane:grilling`). It was named `grill` before.

### Fixed

- A long option label broke the marker.
- An earlier round's unanswered questions stayed in the pane.

## 0.1.0 - 2026-09-17

First release.

### Added

- The `grilling` block, read from the transcript.
- The pane, with a radio of buttons for the picks.
- One Submit that sends the whole round as one prompt.
- The skill, `grilling-pane:grilling`, which calls Matt Pocock's `grilling` skill for the method.
- The three quality gates, run in CI.

# 0006. The skill delegates the method to grilling

- Status: accepted
- Date: 2026-09-17

## Context

Matt Pocock's `grilling` skill (github.com/mattpocock/skills, MIT) already has the method this
plugin needs:

- map the design tree
- ask a round of questions
- give a recommendation
- find facts without asking the person
- wait for a shared understanding before acting

Restating that method as this plugin's own skill text would take credit for someone else's work
and would drift from it over time. Version 1.2.0 of `grilling` changed its own round rule from
asking one question at a time to asking a whole round at once. This is the exact change this
plugin needs from `grilling`.

## Decision

`grill` invokes `grilling` and asks it to run its whole method. `grill` overrides one part of it
only: the format a round is written in. This lets grilling-pane read the round and the person
answer it with one Submit. When `grilling` is not installed, `grill` tells the person the install
command and stops. This keeps `grill` from acting on a guess at the method it is supposed to
carry.

## Consequences

- `grilling` becomes a requirement this plugin cannot install on the person's behalf. The skill
  names the install command, so the person knows the exact next step.
- An upstream change to `grilling`'s method reaches every install of this plugin without a
  release here, the same way the v1.2.0 round change would have.
- A `grilling` copy older than v1.2.0 still works with this plugin. `grill` asks for the whole
  frontier in one round, regardless of what that older copy's own text says to do.
- The plugin's own skill is listed as `/grilling-pane:grill`, with the plugin's name in front of
  it. `grilling` keeps its own separate name and install path.

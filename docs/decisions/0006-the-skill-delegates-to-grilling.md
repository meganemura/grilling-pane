# 0006. The plugin's skill delegates the method to the upstream `grilling` skill

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
and would drift from it over time. Version 1.2.0 of the upstream `grilling` skill changed its own
round rule. It moved from asking one question at a time to asking a whole round at once. This is
the exact change this plugin needs from that upstream skill.

## Decision

`grilling-pane:grilling` invokes the upstream `grilling` skill and asks it to run its whole
method. `grilling-pane:grilling` overrides one part of it only: the format a round is written in.
This lets grilling-pane read the round and the person answer it with one Submit. When the
upstream `grilling` skill is not installed, `grilling-pane:grilling` tells the person the install
command and stops. This keeps `grilling-pane:grilling` from acting on a guess at the method it is
supposed to carry.

## Consequences

- The upstream `grilling` skill becomes a requirement this plugin cannot install on the person's
  behalf. `grilling-pane:grilling` names the install command, so the person knows the exact next
  step.
- A change to the upstream `grilling` skill's method reaches every install of this plugin without
  a release here. The v1.2.0 round change reached it the same way.
- A copy of the upstream `grilling` skill older than v1.2.0 still works with this plugin.
  `grilling-pane:grilling` asks for the whole frontier in one round, regardless of what that
  older copy's own text says to do.
- The plugin's own skill is listed as `/grilling-pane:grilling`, with the plugin's name in front
  of it. The upstream `grilling` skill keeps its own separate name and install path.
- The plugin's skill takes the upstream skill's name on purpose. The owner wants the command to
  read `/grilling-pane:grilling`, and the plugin prefix keeps the two skills apart.

# US-07: Work Stealing (opt-in)

**As** a team with spare capacity, **I can** claim tasks from other teams.

## Acceptance Criteria
- `/claim <task>|next`, `/release <task>` with eligibility rules.
- Integrity: dependencies satisfied for claimer.

## Definition of Done
One successful claim in pilot with audit trail.

## Tests
- Dependency check
- Label/assignee updates
- Occupancy threshold
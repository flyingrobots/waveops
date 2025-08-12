# US-09: Speculative Execution (opt-in)

**As** a team, **I can** work on future tasks behind feature flags.

## Acceptance Criteria
- `/spec list/claim` shows & assigns eligible tasks; merges behind flags; not counted toward readiness.

## Definition of Done
One spec task merged safely.

## Tests
- Flag gating
- Exclusion from readiness
- Clean rollback
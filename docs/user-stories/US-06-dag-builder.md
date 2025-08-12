# US-06: DAG Builder (v1)

**As** a project planner, **I can** define task dependencies and wave assignments.

## Acceptance Criteria
- `tasks.yaml` schema; hard edges (human-approved).
- Optional static analyzers emit **soft edges** for review.
- Topo-pack to waves with task effort variance ≤ ±25% per team.

## Definition of Done
Deterministic output from same repo state.

## Tests
- Snapshot
- Mutation test (remove import widens frontier)
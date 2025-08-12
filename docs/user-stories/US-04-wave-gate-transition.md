# US-04: Wave Gate Transition

**As** the system, **I trigger** wave completion when all teams are ready.

## Acceptance Criteria
- When (all teams ready) OR (quorum satisfied + all critical ready), set **Wave Gate: Wave n** check-run = success and post transition comment once.

## Definition of Done
No double announcements; check visible in Checks UI.

## Tests
- Race of two `/ready`
- Quorum math
- Critical enforcement
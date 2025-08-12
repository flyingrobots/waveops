# US-01: Team Readiness

**As** a team member, **I can** declare readiness via `/ready wave-n`.

## Acceptance Criteria
- Only authorized team members can issue.
- Validation enforces: closed by merged PR + required checks success.
- On success: deployment success, JSON updated, ack comment.
- On failure: deployment failure, reason recorded, ack comment.

## Definition of Done
Manual e2e succeeds in a demo repo with 3 teams.

## Tests
- Command parse
- Unauthorized actor
- Failing check
- Manual close misuse
- Happy path
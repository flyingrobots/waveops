# US-05: Deployments Gate

**As** the system, **I track** team readiness via GitHub Deployments.

## Acceptance Criteria
- One deployment per `/ready` attempt with payload `{team,wave,ok,tasks}`.
- Status reflects validator outcome.
- Gate checks consult latest **success** per team.

## Definition of Done
Auditable trail in Deployments tab.

## Tests
- Success/failure status
- Latest-wins logic
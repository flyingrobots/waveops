WaveOps — Full Technical Specification

Tagline: GPU-style waves for teams. Trade continuous meetings for discrete sync points and ship faster.
Status: v1.0 (implementation-ready)
Scope: GitHub-native coordination engine using Issues, PRs, Deployments, and a bot.
Authoritative repo seed file: docs/TECH_SPEC.md

⸻

Table of Contents
	1.	Problem & Goals
	2.	Non-Goals
	3.	Architecture Overview
	4.	Core Concepts & Glossary
	5.	System Requirements
	6.	Data Models & Schemas
	7.	Interfaces
	8.	GitHub App & Action Design
	9.	Algorithms
	10.	Workflow: Day-to-Day
	11.	User Stories, Acceptance Criteria, DoD, Tests
	12.	Quality Gates & Validation
	13.	Observability & Metrics
	14.	Security, Privacy, Compliance
	15.	Performance, Limits, & Rate-Limiting
	16.	Error Handling & Runbook
	17.	Configuration & Deployment
	18.	Rollout Plan
	19.	Risk Register
	20.	Roadmap
	21.	Appendices (Templates & Samples)

⸻

Problem & Goals

Problem: Cross-team projects drown in coordination overhead (meetings, status spam).
Goal: Replace continuous coordination with discrete wave barriers. Use GitHub as the single source of truth, with automation as the arbiter of readiness.

Primary goals
	•	GitHub-native: issues, PRs, checks, deployments, comments.
	•	Deterministic wave gates: Deployments + bot validation (no vibes).
	•	Low-noise visibility: single pinned JSON block per wave.
	•	Scale linearly: add teams, not meetings.

⸻

Non-Goals
	•	Replace your bug tracker or roadmap tool.
	•	Build bespoke infra outside GitHub.
	•	Magical DAG inference without human approval. (Humans approve. Always.)

⸻

Architecture Overview

Control Plane: GitHub App (WaveOps Bot) + optionally a GitHub Action wrapper.
Data Plane: GitHub Issues/PRs/Checks/Deployments + tasks.yaml (plan), teams.yaml (auth).
State: Pinned JSON block in the Wave Coordination Issue (canonical), plus Deployments history.

Teams ──/ready────────┐
                      ▼
             WaveOps Bot (App/Action)
        ┌─────────┬───────────┬───────────┐
        ▼         ▼           ▼           ▼
   Validate   Update JSON   Deployments   Gate Check-Run
 (PR+Checks)  (pinned)       (env=wave-N)   (Wave Gate ✅)

Advanced modes:
	•	Quorum barriers (K-of-N) to reduce tail latency.
	•	Work stealing to boost occupancy.
	•	Rolling frontier + speculative execution for mature teams.

⸻

Core Concepts & Glossary
	•	Wave: A dependency frontier executed in parallel.
	•	Coordination Issue: GH issue titled Wave {n} · {plan} · Coordination.
	•	Pinned JSON block: Machine-readable wave state (the canonical truth).
	•	Ready gate: Per-team Deployment to env wave-{n}-ready set to success only after validation.
	•	Wave Gate: Custom check-run “Wave Gate: Wave {n}” flips ✅ when all teams are ready (or quorum).
	•	Speculative execution: Start next-wave tasks with no unmet dependencies, behind flags.
	•	Quorum barrier: Advance when all critical teams + K-of-N teams are ready.

⸻

System Requirements
	•	GitHub Cloud or Enterprise with Actions.
	•	Installable GitHub App (WaveOps Bot) with least-privilege scopes.
	•	Branch protections: required checks, CODEOWNERS reviews, squash merges, signed commits/DCO.
	•	Node 18+ for the Action/Bot code (TypeScript recommended).

SLA Targets
	•	Command response (bot comment) ≤ 60s.
	•	Pinned JSON update ≤ 60s.
	•	Gate decision atomic; at-most-once transition.

⸻

Data Models & Schemas

1) wave/tasks.yaml (plan & DAG)

plan: phase-1
tz: UTC
waves:
  - number: 1
    quorum:                # optional (quorum mode)
      enabled: false
      threshold: "2/3"     # or "66%"
      critical_teams: [alpha, beta]
    teams:
      alpha:
        - { id: P1.T001, issue: 123, effort: 3 }
        - { id: P1.T013, issue: 124, effort: 2 }
      beta:
        - { id: P1.T017, issue: 125, effort: 3 }
      gamma:
        - { id: P1.T021, issue: 126, effort: 3 }
tasks:
  - id: P1.T001
    title: Temp dir detection
    wave: 1
    team: alpha
    depends_on: []         # task ids
    acceptance:
      - CI green (linux/macos/windows)
      - Docs updated
      - Coverage ≥ 90%
    critical: false

Schema (JSON Schema draft 2020-12, excerpt)

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["plan", "waves"],
  "properties": {
    "plan": {"type":"string"},
    "tz": {"type":"string"},
    "waves": {
      "type":"array",
      "items": {
        "type":"object",
        "required":["number","teams"],
        "properties":{
          "number":{"type":"integer","minimum":1},
          "quorum":{
            "type":"object",
            "properties":{
              "enabled":{"type":"boolean"},
              "threshold":{"type":"string"},
              "critical_teams":{"type":"array","items":{"type":"string"}}
            }
          },
          "teams":{
            "type":"object",
            "additionalProperties":{
              "type":"array",
              "items":{
                "type":"object",
                "required":["id","issue"],
                "properties":{
                  "id":{"type":"string"},
                  "issue":{"type":"integer"},
                  "effort":{"type":"number"}
                }
              }
            }
          }
        }
      }
    },
    "tasks":{"type":"array","items":{"type":"object"}}
  }
}

2) .github/wave/teams.yaml (auth & mapping)

alpha:
  members: [alice, bob]
beta:
  members: [carol, dave]
gamma:
  members: [erin]

3) Pinned Wave State JSON (canonical, in Coordination Issue body)

{
  "plan": "phase-1",
  "wave": 1,
  "tz": "UTC",
  "teams": {
    "alpha": {
      "status": "ready|in_progress|blocked",
      "at": "2025-08-12T18:45:22Z",
      "reason": null,
      "tasks": ["P1.T001","P1.T013"]
    },
    "beta": { "status": "in_progress" },
    "gamma": { "status": "blocked", "reason": "CI flake" }
  },
  "all_ready": false,
  "updated_at": "2025-08-12T18:45:22Z"
}

HTML guards in issue body

<!-- wave-state:DO-NOT-EDIT -->
```json
{ ...canonical JSON above... }

<!-- /wave-state -->


---

## Interfaces

### Slash Commands (comments on Coordination Issue)

/status
/ready wave-
/blocked reason:””
/unready

Advanced (optional, enable via config)

/quorum-status
/claim |next
/release 
/spec list
/spec claim 

**Rules**
- Actor must belong to exactly one team (`teams.yaml`) to issue team-state commands.
- Commands are idempotent. Unknown commands yield a help hint.

### Named Environments
- **Per-wave readiness env:** `wave-<n>-ready` (Deployments).

### Labels
- `wave:<n>`, `team:<name>`, `status:in-progress|blocked|ready|done`, `coordination`, `critical`.

---

## GitHub App & Action Design

### Permissions (least privilege)
- **Read:** contents, metadata, pull_requests, checks  
- **Write:** issues, issue_comments, checks, deployments  
- Webhook events: `issue_comment`, `issues`, `pull_request`, `check_run`, `check_suite`

### Event Handling
1. **`issue_comment.created`** → parse slash command → auth → route.
2. **`issues.opened/edited`** → ensure pinned JSON present (template).
3. **`pull_request.*`/`check_suite.*`** → (optional) pre-compute cache for validator.

### Coordinator Workflow (`.github/workflows/wave-coordinator.yml`)
- Single job, Node 18 runner.
- Concurrency: `group: wave-coordinator`, `cancel-in-progress: true`.
- Steps:
  1. Checkout (read-only).
  2. Install deps (`@octokit/*`, `js-yaml`).
  3. Execute coordinator script:
     - Parse command.
     - Resolve `wave`, `team`.
     - Run validator (per team).
     - On `/ready`: create Deployment → set status `success`/`failure`.
     - Update pinned JSON.
     - If **all teams** (or **quorum**) success → set **Wave Gate** check-run to `success` and post transition comment.

---

## Algorithms

### Readiness Validation (per team)
**For each task** in `wave n` and `team X`:  
- Issue state == `CLOSED`.  
- `closedBy` == merged **Pull Request** (not manual close).  
- Merge commit checks: every required check has `conclusion == success` (allow `neutral`/`skipped` as configured).  
- Optional: coverage ≥ threshold; docs changed for doc-required tasks.

**Result:** `ok | reason` (+ failing PR/check links).

### Gate Decision
- **Full barrier:** all teams `ready`.  
- **Quorum:** all **critical teams** `ready` **AND** K-of-N teams `ready`.  
- Flip **Wave Gate** check-run to `success` **once**, post transition.

### Work Stealing (optional)
- Eligible if team occupancy < threshold and no blockers.
- `/claim <task-id>|next` moves task: relabel, reassign, post ack.
- Integrity check: task dependencies satisfied for new team.

### Rolling Frontier (optional)
- Auto-assign next-wave tasks to a team when its prerequisites clear.
- Gate remains for milestone signalling; teams don’t idle.

### Speculative Execution (optional)
- `/spec list` shows Wave n+1 tasks with no unmet deps.
- `/spec claim` assigns task with `mode:speculative` label; merges guarded by flags.  
- Speculative tasks **do not** count toward Wave n readiness.

---

## Workflow (Day-to-Day)

1. **Create Coordination Issue** for Wave n from template (includes pinned JSON).  
2. **Teams work tasks** (issues + PRs). CI must be green.  
3. **Team signals `/ready wave-n`**.  
   - Bot validates → **Deployment** `wave-n-ready` set to `success` on pass, or `failure` with reason.  
   - Pinned JSON updates (`status`, `at`).  
4. **On all-ready (or quorum):**  
   - **Wave Gate** check-run → ✅, post transition comment (tag teams).  
   - (Optional) open/assign Wave n+1 tasks automatically.  
5. **If blocked:** `/blocked reason:"..."` updates JSON; `/unready` reverts to in-progress.

---

## User Stories, Acceptance Criteria, DoD, Tests

> **SLA for bot responses:** ≤ 60s unless rate-limited; retries with backoff.

### US-01 Team Readiness
**As** a team member, **I can** declare readiness via `/ready wave-n`.  
**AC**
- Only authorized team members can issue.
- Validation enforces: closed by merged PR + required checks success.
- On success: deployment success, JSON updated, ack comment.
- On failure: deployment failure, reason recorded, ack comment.

**DoD:** Manual e2e succeeds in a demo repo with 3 teams.  
**Tests:** command parse; unauthorized actor; failing check; manual close misuse; happy path.

---

### US-02 Block/Unready
**AC**
- `/blocked reason:"..."` → JSON `status=blocked`, `reason`, UTC `at`.
- `/unready` → JSON `status=in_progress`.  
**DoD:** Visible immediately in `/status`.  
**Tests:** reason parsing; idempotence; permission checks.

---

### US-03 Pinned JSON Canonical State
**AC**
- JSON in guarded block; only bot edits it; schema validated.
- Timestamp fields in UTC; stable key order.

**DoD:** Multiple updates do not reorder keys; humans can’t corrupt state.  
**Tests:** block extraction & rebuild; race safety.

---

### US-04 Wave Gate Transition
**AC**
- When (all teams ready) OR (quorum satisfied + all critical ready), set **Wave Gate: Wave n** check-run = success and post transition comment once.

**DoD:** No double announcements; check visible in Checks UI.  
**Tests:** race of two `/ready`; quorum math; critical enforcement.

---

### US-05 Deployments Gate
**AC**
- One deployment per `/ready` attempt with payload `{team,wave,ok,tasks}`.
- Status reflects validator outcome.
- Gate checks consult latest **success** per team.

**DoD:** Auditable trail in Deployments tab.  
**Tests:** success/failure status; latest-wins logic.

---

### US-06 DAG Builder (v1)
**AC**
- `tasks.yaml` schema; hard edges (human-approved).  
- Optional static analyzers emit **soft edges** for review.  
- Topo-pack to waves with task effort variance ≤ ±25% per team.

**DoD:** Deterministic output from same repo state.  
**Tests:** snapshot; mutation test (remove import widens frontier).

---

### US-07 Work Stealing (opt-in)
**AC**
- `/claim <task>|next`, `/release <task>` with eligibility rules.  
- Integrity: dependencies satisfied for claimer.  
**DoD:** One successful claim in pilot with audit trail.  
**Tests:** dependency check; label/assignee updates; occupancy threshold.

---

### US-08 Rolling Frontier (opt-in)
**AC**
- Auto-assign next tasks when deps satisfied; doesn’t break milestone gates.  
**DoD:** Demonstrate without idling; no broken deps.  
**Tests:** prereq watcher; assignment idempotence.

---

### US-09 Speculative Execution (opt-in)
**AC**
- `/spec list/claim` shows & assigns eligible tasks; merges behind flags; not counted toward readiness.  
**DoD:** One spec task merged safely.  
**Tests:** flag gating; exclusion from readiness; clean rollback.

---

### US-10 Metrics & Advisor
**AC**
- Collect: occupancy, barrier_stall_pct, ready_skew, warp_divergence (p95/median), first_pass_ci, review_latency p50/p90.  
- `/status` includes summary + simple recommendations.  
**DoD:** JSON artifact produced nightly.  
**Tests:** correctness on synthetic runs.

---

## Quality Gates & Validation
- **Required:** CI checks success; PR references task (`Closes #<issue>`); branch protections; review approvals via CODEOWNERS.  
- **Optional:** Coverage ≥ threshold; docs updated for doc-flagged tasks.  
- **Wave completion:** via Deployments + validator only. No manual override.

---

## Observability & Metrics

**Per wave**
- `occupancy = active_minutes / (wave_duration * team_size)` target > **0.75**  
- `barrier_stall_pct` target < **15%**  
- `warp_divergence = p95_task_time / median` watch if > **2.0**  
- `ready_skew_minutes` consider quorum if > **30**  
- `first_pass_ci` target > **0.85**  
- `review_latency_p50` target < **30m**

**Artifacts**
- `data/waves.json` (nightly) for dashboard.
- Transition comments record metrics snapshot.

---

## Security, Privacy, Compliance
- GitHub App secrets in Actions **encrypted**; no PATs.  
- Least-privilege permissions; Actions `permissions:` minimized.  
- Signed commits/DCO; branch protections enforced.  
- Audit trail: Deployments + issue comments + PR merges.  
- PII: none beyond GH usernames.

---

## Performance, Limits, & Rate-Limiting
- Prefer **GraphQL** for batch queries; cache where safe.  
- Respect `X-RateLimit-Remaining`/`Reset`; exponential backoff (jitter).  
- Action concurrency prevents double gates.  
- Polling (if any) ≥ 30s; prefer webhooks/event-driven.

---

## Error Handling & Runbook
**Common incidents**
- **Manual close misuse:** Reopen issue; require PR with `Closes #`.  
- **CI flakes:** Label `ci:flake`; retry max N; quarantine tests; infra ticket.  
- **Auth failure:** Ensure `teams.yaml` + CODEOWNERS alignment.  
- **Double transition:** Concurrency guard; idempotent gate check.  
- **Rate-limit:** Automatic backoff; rerun job if still failing.

**Commands for recovery**
- `/unready` to roll back team state.  
- Re-issue `/ready` after fix; bot re-validates.

---

## Configuration & Deployment

### `waveops.config.yaml` (optional)
```yaml
checks:
  allow_neutral: true
  required: ["lint", "test-suite-linux", "test-suite-macos", "test-suite-windows"]
coverage:
  enabled: true
  threshold: 0.9
docs:
  required_globs: ["docs/**", "README.md"]
modes:
  quorum:
    enabled: false
    threshold: "2/3"
    critical_teams: []
  rolling:
    enabled: false
  speculative:
    enabled: false
work_stealing:
  enabled: false
  occupancy_threshold: 0.7

Environments
	•	Use wave-<n>-ready for deployments.
	•	Optional: per-team variant wave-<n>-ready:<team> if you want granular envs (not required).

⸻

Rollout Plan
	1.	Week 1: Core: /ready, /blocked, /unready, /status; validator; deployments gate; Wave Gate check; pinned JSON.
	2.	Week 2: Quorum + work stealing + metrics.
	3.	Week 3: Rolling frontier + speculative + advisor (recommendations in /status).
	4.	Pilot: 3 teams × 6 tasks; record ready_skew & stall %. If skew > 30m, enable quorum.

⸻

Risk Register
	•	Review bottleneck: broaden CODEOWNERS, reviewer SLOs, auto-rotation.
	•	Flaky CI: quarantine; infra ticket; capped reruns.
	•	Name collisions/labels: seed labels via script; enforce on CI.
	•	Org variance: GitHub Enterprise quirks; test on staging org.

⸻

Roadmap
	•	GitHub Projects v2 integration (views for wave/team).
	•	First-class dashboard (gh-pages).
	•	Deeper DAG analyzers (history mining, ML similarity, provenance UI).
	•	Custom check-run “Task Progress” renderer per PR.
	•	Self-hosted mode (optional webhook relay).

⸻

Appendices (Templates & Samples)

A1. Coordination Issue Template (top section)

## Wave {n} · {plan} · Coordination
**Commands:** `/status` · `/ready wave-{n}` · `/blocked reason:"..."` · `/unready`

<!-- wave-state:DO-NOT-EDIT -->
```json
{
  "plan": "{plan}",
  "wave": {n},
  "tz": "UTC",
  "teams": {
    "alpha": {"status":"in_progress","tasks":[]},
    "beta":  {"status":"in_progress","tasks":[]},
    "gamma": {"status":"in_progress","tasks":[]}
  },
  "all_ready": false,
  "updated_at": "1970-01-01T00:00:00Z"
}

<!-- /wave-state -->


Status

(Automatically rendered table below by bot – optional)

### A2. PR Template (`.github/PULL_REQUEST_TEMPLATE.md`)
```markdown
### Task Link
- Closes #<issue>
- Task ID: <e.g., P1.T024>

### Definition of Done
- [ ] Acceptance criteria met
- [ ] Required checks green
- [ ] Docs updated (if applicable)
- [ ] Tests added/updated

### Notes

A3. Issue Template (.github/ISSUE_TEMPLATE/task.md)

---
name: Task
labels: ["status:in-progress"]
---

## Task: {{id}} — {{title}}

**Wave:** {{wave}}  
**Team:** {{team}}

### Acceptance Criteria
- ...

### Steps
1. ...

A4. Action Workflow Skeleton (.github/workflows/wave-coordinator.yml)

name: wave-coordinator
on:
  issue_comment: { types: [created] }
permissions:
  contents: read
  issues: write
  pull-requests: read
  checks: write
  deployments: write
jobs:
  handle:
    if: github.event.issue && contains(github.event.issue.title, 'Wave ') && contains(github.event.issue.title, 'Coordination')
    runs-on: ubuntu-latest
    concurrency: { group: wave-coordinator, cancel-in-progress: true }
    steps:
      - uses: actions/checkout@v4
      - run: npm i @octokit/rest @octokit/graphql js-yaml
      - uses: actions/github-script@v7
        with:
          script: |
            // Coordinator core: parse command → auth → validate → deployments → update pinned JSON → gate check
            // (Implementation file lives in repo; see /packages/github/src/coordinator.ts)

A5. Validator Pseudocode

async function validateTeam(wave:number, team:string){
  const tasks = getTasksFor(wave, team); // from tasks.yaml
  for (const t of tasks){
    const issue = await getIssue(t.issue);
    if (issue.state !== "CLOSED") return fail(`${t.id}: issue not closed`);
    const closer = await getClosingPR(issue.number);
    if (!closer.merged) return fail(`${t.id}: closed without merged PR`);
    const checks = await getChecks(closer.merge_commit_sha);
    if (!allSuccess(checks)) return fail(`${t.id}: failing checks`);
    if (!docsOkIfRequired(t, closer)) return fail(`${t.id}: docs missing`);
    if (!coverageOkIfRequired(closer)) return fail(`${t.id}: coverage below threshold`);
  }
  return ok(tasks.map(t=>t.id));
}

A6. Metrics JSON (example)

{
  "plan": "phase-1",
  "wave": 1,
  "metrics": {
    "occupancy": 0.82,
    "barrier_stall_pct": 12.0,
    "warp_divergence": 1.8,
    "ready_skew_minutes": 22,
    "first_pass_ci": 0.89,
    "review_latency_p50": 18
  },
  "recommendations": [
    "Consider quorum for Wave 2",
    "Team gamma: investigate review latency"
  ],
  "generated_at": "2025-08-12T21:00:00Z"
}


⸻

Final Word

WaveOps is designed to be boringly reliable: GitHub is the truth, the bot is the judge, and waves keep humans synchronized like GPU warps. Ship the core (Deployments gate + pinned JSON + validator) now, then layer in quorum, work stealing, and rolling frontier when the metrics say you’re ready.

If this is the last project you ever write, make it the one that eliminates 80% of status meetings.

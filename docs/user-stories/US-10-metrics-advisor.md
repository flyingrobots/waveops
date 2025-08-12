# US-10: Metrics & Advisor

**As** a project manager, **I can** view wave performance metrics and recommendations.

## Acceptance Criteria
- Collect: occupancy, barrier_stall_pct, ready_skew, warp_divergence (p95/median), first_pass_ci, review_latency p50/p90.
- `/status` includes summary + simple recommendations.

## Definition of Done
JSON artifact produced nightly.

## Tests
Correctness on synthetic runs.
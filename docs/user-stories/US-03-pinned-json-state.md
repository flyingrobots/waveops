# US-03: Pinned JSON Canonical State

**As** the system, **I maintain** canonical wave state in a pinned JSON block.

## Acceptance Criteria
- JSON in guarded block; only bot edits it; schema validated.
- Timestamp fields in UTC; stable key order.

## Definition of Done
Multiple updates do not reorder keys; humans can't corrupt state.

## Tests
- Block extraction & rebuild
- Race safety
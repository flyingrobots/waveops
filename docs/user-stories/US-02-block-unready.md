# US-02: Block/Unready

**As** a team member, **I can** signal blocked status or revert to unready.

## Acceptance Criteria
- `/blocked reason:"..."` → JSON `status=blocked`, `reason`, UTC `at`.
- `/unready` → JSON `status=in_progress`.

## Definition of Done
Visible immediately in `/status`.

## Tests
- Reason parsing
- Idempotence
- Permission checks
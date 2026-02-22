---
phase: 13-project-alias-resolver
plan: 02
subsystem: tooling
tags: [gsd-commands, project-alias, workflows, step-0]

requires:
  - phase: 13-project-alias-resolver
    provides: resolve-project CLI command in gsd-tools.js (plan 01)
provides:
  - --project flag in all 28 GSD command files
  - Step 0 Project Resolution in 26 workflow files
affects: [all GSD commands, all GSD workflows]

tech-stack:
  added: []
  patterns: [Step 0 project resolution before first step in every workflow]

key-files:
  created: []
  modified:
    - commands/gsd/execute-phase.md
    - commands/gsd/plan-phase.md
    - commands/gsd/auto.md
    - get-shit-done/workflows/execute-phase.md
    - get-shit-done/workflows/plan-phase.md
    - get-shit-done/workflows/auto-dispatch.md

key-decisions:
  - "Prepend [--project <alias>] to existing argument-hints rather than append"
  - "Step 0 wraps in <step> tags for files using <step> structure, plain ## 0. heading for others"
  - "Used helper script (.scratch/insert-step0.js) for consistent insertion across 26 files"

patterns-established:
  - "Every GSD workflow starts with Step 0 Project Resolution (26/31 workflows)"
  - "--project flag is stripped from $ARGUMENTS before downstream parsing"

duration: 6min
completed: 2026-02-22
---

# Phase 13 Plan 02: --project Flag in All Commands + Step 0 in Workflows Summary

**Global --project flag support across all 28 GSD command files and Step 0 Project Resolution in 26 workflow files**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T03:00:00Z
- **Completed:** 2026-02-22T03:06:00Z
- **Tasks:** 2
- **Files modified:** 53

## Accomplishments
- All 27 command files updated with [--project <alias>] in argument-hint (28 total with register-project.md)
- 26 workflow files have Step 0 Project Resolution block
- Backwards compatible: omitting --project preserves all existing behavior
- --project flag cleanly stripped from $ARGUMENTS before downstream parsing

## Task Commits

Each task was committed atomically:

1. **Task 1: --project in command files** - `4f7d309` (feat)
2. **Task 2: Step 0 in workflow files** - `6fda45d` (feat)

## Files Created/Modified
- `commands/gsd/*.md` (27 files) - Added --project to argument-hint
- `get-shit-done/workflows/*.md` (26 files) - Inserted Step 0 Project Resolution

## Decisions Made
- Combined argument-hint and Step 0 insertion into separate commits for atomic rollback
- Excluded execute-plan.md (subagent), help.md (no .planning), update.md (self-update), transition.md (internal), new-project.md (Plan 03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All commands and workflows now support --project flag
- Ready for Plan 13-03 (auto-registration in new-project)

---
*Phase: 13-project-alias-resolver*
*Completed: 2026-02-22*

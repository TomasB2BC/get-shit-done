---
phase: 09-full-command-coverage
plan: 01
subsystem: workflows
tags: [agent-mode, new-milestone, map-codebase, auto-decide, auto_mode]

# Dependency graph
requires:
  - phase: 08-agent-mode-foundation
    provides: auto-decide CLI in gsd-tools.js with 6 question types
provides:
  - Agent-mode branches in new-milestone.md (7 decision points)
  - Auto_mode context passing in map-codebase.md (hybrid + classic mappers)
affects: [10-agent-teams-coverage, new-milestone, map-codebase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-callsite agent-mode branching (thin if/else, not section duplication)
    - Auto_mode context prepending to spawned Task agents
    - Auto-handle patterns for specific contexts (secrets scan in gitignored dirs)

key-files:
  created: []
  modified:
    - get-shit-done/workflows/new-milestone.md
    - get-shit-done/workflows/map-codebase.md

key-decisions:
  - "Milestone goals synthesis uses log-decision (freeform), not structured auto-decide"
  - "Requirement scoping uses auto-decide multiSelect per category"
  - "Secrets scan auto-proceeds in agent mode since .planning/codebase/ is gitignored"

patterns-established:
  - "Auto_mode context block: Prepend to ALL spawned Task prompts (hybrid teammates + classic agents)"
  - "Secrets handling: Auto-proceed if output is gitignored, pause otherwise"

# Metrics
duration: 34min
completed: 2026-02-11
---

# Phase 09 Plan 01: Command Coverage Summary

**Agent-mode branches added to new-milestone.md (7 decision points) and auto_mode context passing to map-codebase.md mappers**

## Performance

- **Duration:** 34 min
- **Started:** 2026-02-11T10:34:54Z
- **Completed:** 2026-02-11T11:08:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- new-milestone.md has AGENT_MODE detection and 7 decision branches (milestone goals, version, research, scoping, gaps, requirements, roadmap)
- map-codebase.md passes auto_mode context to ALL mappers (4 hybrid teammates + 4 classic agents) when AGENT_MODE=true
- Secrets scan auto-handled in agent mode (gitignored docs safe to proceed)
- All classic and hybrid mode paths preserved exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Add agent-mode branches to new-milestone.md** - `330a7a7` (feat)
2. **Task 2: Add agent-mode context passing to map-codebase.md** - `22db186` (feat)

## Files Created/Modified

- `get-shit-done/workflows/new-milestone.md` - Added 15 AGENT_MODE branches, 9 auto-decide calls, 1 log-decision call
- `get-shit-done/workflows/map-codebase.md` - Added 9 AGENT_MODE branches, 7 auto_mode context blocks, 5 auto-decide/log-decision calls

## Decisions Made

**Milestone goals synthesis (Task 1):**
- Uses log-decision for freeform synthesis from PROJECT.md, MILESTONES.md, ROADMAP.md
- Rationale: Milestone goals are synthesized narrative, not structured selection

**Requirement scoping (Task 1):**
- Uses auto-decide multiSelect per category
- Conservative default: selects all except "None"/"Skip"/"Defer"

**Secrets scan handling (Task 2):**
- Auto-proceed with log-decision when AGENT_MODE=true
- Rationale: .planning/codebase/ is gitignored, no commit exposure risk

**Auto_mode context application (Task 2):**
- Prepend to ALL mapper spawns (hybrid teammates and classic agents)
- Rationale: Both orchestration modes may run in agent_mode=true projects

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

CMD-04 (new-milestone) and CMD-06 (map-codebase) complete. Phase 09 must-haves partially satisfied:
- new-milestone.md auto-synthesizes milestone goals: YES
- new-milestone.md auto-decides all AskUserQuestion callsites: YES
- map-codebase.md passes auto_mode context to mappers: YES
- Classic mode behavior preserved: YES

Phase 09-02 and 09-03 needed for full command coverage (remaining workflows).

## Self-Check: PASSED

All files and commits verified:
- FOUND: get-shit-done/workflows/new-milestone.md
- FOUND: get-shit-done/workflows/map-codebase.md
- FOUND: 330a7a7
- FOUND: 22db186

---
*Phase: 09-full-command-coverage*
*Plan: 01*
*Completed: 2026-02-11*

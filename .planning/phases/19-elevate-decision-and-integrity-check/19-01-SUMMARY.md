---
phase: 19-elevate-decision-and-integrity-check
plan: 01
subsystem: tooling
tags: integrity-check, recon-probes, planning-docs, gsd-command

requires:
  - phase: 18-explorer-recon-step-for-research
    provides: Stable codebase and existing Explore subagent patterns to follow
provides:
  - /gsd:integrity-check command file (commands/gsd/integrity-check.md)
  - integrity-check workflow with parallel recon probes (get-shit-done/workflows/integrity-check.md)
  - Standalone skill callable from elevate-decision Pass 2 or other workflows
affects: [elevate-decision, progress, plan-phase]

tech-stack:
  added: []
  patterns: [parallel-recon-probes, lettered-options-ux, evidence-source-discovery]

key-files:
  created:
    - commands/gsd/integrity-check.md
    - get-shit-done/workflows/integrity-check.md
  modified: []

key-decisions:
  - "4 recon probes (state, roadmap, references, decisions) -- decisions probe is conditional on PROJECT.md existence"
  - "Lettered options per gap (a/b/c/d) matching elevate-decision UX pattern"
  - "Probe output to .scratch/integrity/ -- session-ephemeral, cleaned up after synthesis"
  - "Auto-fix in agent mode: inaccurate/stale get fixed, minor get dismissed"

patterns-established:
  - "Lettered option pattern: a) Fix now, b) Park as todo, c) Not a gap, d) Needs investigation"
  - "Evidence source discovery: dynamic ls/git checks, not hardcoded paths"
  - "Structured probe output format: GAP/CLAIM/EVIDENCE/SEVERITY/FIX blocks"

duration: 5min
completed: 2026-02-26
---

# Plan 19-01: Integrity Check Summary

**Standalone /gsd:integrity-check skill with parallel recon probes scanning .planning/ docs against git, file, and cross-reference evidence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Command file with standard GSD frontmatter routing to workflow
- Workflow with 10 steps: project resolution, environment validation, evidence discovery, 4 parallel recon probes, gap synthesis with lettered options, response collection, batch fix execution, commit, cleanup, structured return
- Agent mode auto-fix logic (inaccurate/stale fixed, minor dismissed)
- Interactive mode with human gap selection
- Three structured return types: PASSED, COMPLETE, BLOCKED

## Task Commits

1. **Task 1+2: Create command and workflow files** - `6a51a29` (feat)

## Files Created/Modified
- `commands/gsd/integrity-check.md` - Command frontmatter with --scope and --fix-all flags
- `get-shit-done/workflows/integrity-check.md` - Full 445-line workflow with parallel recon probes

## Decisions Made
- Combined both tasks into single commit since they are tightly coupled
- Workflow supports both standalone invocation and SlashCommand call from elevate-decision
- Probe D (decision currency) only spawns if PROJECT.md exists

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None

## Next Phase Readiness
- integrity-check is ready to be called from elevate-decision Pass 2 (Plan 19-02)
- Command registered at commands/gsd/integrity-check.md for direct invocation

---
*Phase: 19-elevate-decision-and-integrity-check*
*Completed: 2026-02-26*

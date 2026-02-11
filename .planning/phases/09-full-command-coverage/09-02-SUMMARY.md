---
phase: 09-full-command-coverage
plan: 02
subsystem: agent-mode-workflows
tags: [agent-mode, auto-decide, debug, verify-work, CMD-05, CMD-07]
requires: [auto-decide-engine, log-decision-engine]
provides: [agent-mode-debug, agent-mode-verification]
affects: [debug-workflow, verify-work-workflow]
tech_stack:
  added: []
  patterns: [auto-symptom-gathering, auto-test-assessment, checkpoint-auto-handling]
key_files:
  created: []
  modified:
    - commands/gsd/debug.md
    - get-shit-done/workflows/verify-work.md
decisions:
  - decision: "Auto-symptom gathering from project state"
    rationale: "Synthesizes symptoms from STATE.md, error logs, git history, HALT files for agent-mode debugging"
    outcome: "Enables autonomous debug initiation without user symptom input"
  - decision: "Conservative auto-assessment for tests"
    rationale: "Only PASS when definitively confirmed, mark ambiguous cases as SKIPPED for human review"
    outcome: "Reduces false positives, maintains verification quality in agent mode"
  - decision: "Checkpoint-aware auto-handling"
    rationale: "Different strategies per checkpoint type (auto-approve verify, auto-decide decision, halt human-action)"
    outcome: "Maximizes automation while respecting human-only actions"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  commits: 2
  lines_modified: 439
  completed_date: 2026-02-11
dependencies:
  depends_on: [08-01-auto-decide-engine]
  enables: [09-03-agent-mode-workflows]
---

# Phase 09 Plan 02: Debug & Verification Agent Mode Summary

Agent-mode branches for debug and verify-work workflows - autonomous symptom gathering, test assessment, and checkpoint handling

## What Was Built

Added full agent-mode support to debug.md and verify-work.md workflows, enabling autonomous debugging and testing without human input:

**debug.md (commands/gsd/):**
- Auto-detects agent mode from config.json
- Auto-selects most recent active debug session when resuming
- Auto-gathers symptoms from STATE.md blockers, error logs, git history, and HALT files
- Auto-decides hypothesis selection and next actions (fix now vs plan fix)
- Passes auto_mode context to all spawned debugger agents (hybrid 3 investigators + classic single + continuation agents)
- Auto-handles checkpoints by type (approve human-verify, auto-decide decision, halt human-action)
- Preserves all existing classic and hybrid mode behavior

**verify-work.md (get-shit-done/workflows/):**
- Auto-detects agent mode from config.json
- Auto-selects session with most pending tests when resuming
- Auto-assesses programmatically verifiable tests (API returns, file exists, grep-checkable) with PASS/FAIL
- Marks human-judgment tests (visual, UX, interactive) as SKIPPED for human review
- Conservative assessment: only PASS when check definitively confirms
- Auto-decides revision loop actions (force proceed vs abandon after max iterations)
- Passes auto_mode context to spawned agents (planner, checker, revision planner)
- Preserves all existing classic mode behavior

## Technical Approach

**Pattern consistency:**
- Both workflows follow the established agent-mode branch pattern from Phase 8
- Thin if/else at each decision point (not section-level duplication)
- Agent mode is additive - classic mode completely preserved
- Auto-decide for structured decisions, log-decision for freeform synthesis

**auto_mode context blocks:**
- Prepended to all spawned Task prompts when AGENT_MODE=true
- Instructs agents to use auto-decide for structured questions
- Instructs agents to synthesize + log-decision for freeform questions
- Consistent format across all spawned agents

**Symptom gathering (debug.md):**
- Synthesizes from multiple sources: STATE.md, logs, git history, HALT files, $ARGUMENTS
- Falls back to HALT.md if insufficient context
- Composes 5 symptom answers (expected, actual, errors, timeline, reproduction)
- Logs synthesis with rationale showing source documents

**Test assessment (verify-work.md):**
- Checks test description for programmatic verification indicators (API, file, log, database)
- Checks test description for human judgment indicators (visual, UI, UX, interactive)
- Runs automated checks only for verifiable tests
- Conservative: ambiguous cases marked SKIPPED, not PASS
- Logs each assessment with evidence/rationale

**Checkpoint handling:**
- human-verify: auto-approve (agent mode trusts verification step)
- decision: use auto-decide with checkpoint's options
- human-action: HALT with HALT.md (cannot proceed without human)
- Logs all auto-decisions for audit trail

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

**Upstream dependencies:**
- Requires: auto-decide engine (08-01) for structured decisions
- Requires: log-decision engine (08-01) for freeform synthesis logging
- Requires: gsd-debugger agent (Phase 4) for investigation
- Requires: gsd-planner, gsd-plan-checker agents (Phase 3) for gap closure

**Downstream consumers:**
- debug.md: Used by /gsd:debug command for issue investigation
- verify-work.md: Used by /gsd:verify-work command for UAT testing
- Both: Feed into dispatcher's phase completion flow (auto-dispatch.md)

**Side effects:**
- debug.md writes HALT.md to .planning/debug/ when agent mode lacks context
- verify-work.md marks tests as SKIPPED when human assessment required
- Both write to AUTO-DISPATCH-LOG.md via log-decision calls

## Verification

Self-check verification counts:

**debug.md:**
- 16 AGENT_MODE references (expected 10+) - PASS
- 15 auto-decide calls (expected 3+) - PASS
- 10 log-decision calls (expected 2+) - PASS
- 10 auto_mode context blocks (expected 3+) - PASS
- USE_HYBRID still present (hybrid mode preserved) - PASS

**verify-work.md:**
- 10 AGENT_MODE references (expected 8+) - PASS
- 7 auto-decide calls (expected 2+) - PASS
- 9 log-decision calls (expected 2+) - PASS
- 6 auto_mode context blocks (expected 3+) - PASS

**Files synced to installed paths:**
- commands/gsd/debug.md -> C:\Users\tomas\.claude\commands\gsd\debug.md
- get-shit-done/workflows/verify-work.md -> C:\Users\tomas\.claude\get-shit-done\workflows\verify-work.md

All commits exist in git history. All files exist at expected paths.

## Next Phase Readiness

**Blockers:** None

**Enables:**
- Phase 9 Plan 3 (agent-mode branches for remaining workflows)
- Full agent-mode command coverage (CMD-05 debug + CMD-07 verify-work complete)

**Dependencies satisfied:**
- CMD-05: debug.md auto-gathers symptoms and auto-selects hypotheses
- CMD-07: verify-work.md auto-assesses tests and auto-handles gap closure

## Self-Check: PASSED

**Created files verified:**
- N/A (plan modifies existing files only)

**Modified files verified:**
- [FOUND] commands/gsd/debug.md
- [FOUND] get-shit-done/workflows/verify-work.md

**Commits verified:**
- [FOUND] 306264b feat(09-02): add agent-mode branches to debug.md
- [FOUND] 8997b68 feat(09-02): add agent-mode branches to verify-work.md

All verification checks passed.

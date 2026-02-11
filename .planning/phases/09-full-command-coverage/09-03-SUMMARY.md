---
phase: 09-full-command-coverage
plan: 03
subsystem: agent-mode
tags: [dispatcher, safety-limits, token-budget, deadlock-detection, opus-optimization]
dependency_graph:
  requires:
    - "09-02 (auto-decide CLI + AGENT_MODE branches)"
    - "08-02 (auto-dispatch.md Chain-of-Agents dispatcher)"
  provides:
    - "Token budget enforcement per phase (DISP-07)"
    - "Stuck loop detection and halt (DISP-07)"
    - "Opus 1M model preference documentation"
    - "Safety audit trail in AUTO-DISPATCH-LOG.md"
  affects:
    - "All future /gsd:auto runs (budget and deadlock protection)"
tech_stack:
  added: []
  patterns:
    - "Token estimation: 4 chars = 1 token + 10k overhead"
    - "STATE.md hash tracking for deadlock detection"
    - "HALT.md with investigation steps and recovery"
    - "Graceful degradation: Opus 1M preferred, Sonnet sufficient for <12 phases"
key_files:
  created: []
  modified:
    - path: "get-shit-done/bin/gsd-tools.js"
      provides: "budget_tokens_per_phase config field (default 500k)"
    - path: "get-shit-done/references/planning-config.md"
      provides: "budget_tokens_per_phase documentation"
    - path: "get-shit-done/workflows/auto-dispatch.md"
      provides: "Token budget tracking, stuck loop detection, Opus optimization"
decisions:
  - id: "budget-estimation"
    question: "How to estimate token usage per phase action?"
    decision: "4 characters = 1 token + 10k overhead per action"
    rationale: "Simple conservative heuristic, no need for precise API token counting"
  - id: "deadlock-threshold"
    question: "How many unchanged cycles before deadlock halt?"
    decision: "3 consecutive cycles with STATE.md hash unchanged"
    rationale: "Balances false positives (some actions legitimately don't change STATE) with detection speed"
  - id: "halt-types"
    question: "What information to include in HALT.md?"
    decision: "Reason, analysis, investigation steps, recovery options"
    rationale: "Human debugging requires context + actionable next steps"
  - id: "opus-preference"
    question: "Should dispatcher require Opus 1M?"
    decision: "Prefer Opus 1M, but work on Sonnet with graceful degradation"
    rationale: "Opus 1M enables 250+ cycle runs, but Sonnet sufficient for most milestones (<12 phases)"
metrics:
  duration: "204 seconds (3.4 minutes)"
  completed: "2026-02-11"
---

# Phase 9 Plan 3: Dispatcher Safety Limits Summary

**One-liner:** Token budget enforcement and stuck loop detection with Opus 1M optimization for auto-dispatch

## Tasks Completed

### Task 1: Add budget_tokens_per_phase to config and gsd-tools.js

**Files modified:**
- get-shit-done/bin/gsd-tools.js
- get-shit-done/references/planning-config.md

**Changes:**
1. Added budget_tokens_per_phase to agent_mode_settings defaults (500000)
2. Added budget_tokens_per_phase parsing in loadConfig agentModeSettings
3. Added budget_tokens_per_phase to state load --raw output
4. Documented in planning-config.md agent_mode_settings table

**Verification:**
- grep count in gsd-tools.js: 3 occurrences (default, parse, output)
- grep count in planning-config.md: 1 occurrence (documentation table)
- state load --raw outputs: `budget_tokens_per_phase=500000`

**Commit:** 8aea076

### Task 2: Add safety limits and Opus optimization to auto-dispatch.md

**Files modified:**
- get-shit-done/workflows/auto-dispatch.md

**Changes:**

**Token Budget Tracking:**
1. Read BUDGET_TOKENS from config in validate_environment (default 500k)
2. Initialize PHASE_TOKENS_USED=0 at phase start
3. After each Task completes: estimate tokens (4 chars = 1 token + 10k overhead)
4. Accumulate to PHASE_TOKENS_USED
5. If PHASE_TOKENS_USED > BUDGET_TOKENS: write HALT.md with budget analysis, log halt, exit
6. Reset PHASE_TOKENS_USED=0 when moving to next phase

**Stuck Loop Detection:**
1. Initialize STUCK_CYCLES=0 at dispatch start
2. Before each Task spawn: capture STATE_HASH_BEFORE (md5sum of STATE.md)
3. After each Task completes: capture STATE_HASH_AFTER
4. If STATE_HASH_BEFORE = STATE_HASH_AFTER: increment STUCK_CYCLES
5. If STUCK_CYCLES >= 3: write HALT.md with deadlock analysis, log halt, exit
6. If state changed: reset STUCK_CYCLES=0

**Opus 1M Optimization:**
1. Log model preference at dispatch start: "Prefer Opus 1M for dispatcher sessions"
2. Add Opus 1M optimization section to context_budget:
   - Opus 1M: 1M tokens / 4k per cycle = 250 cycles
   - Sonnet: 200k / 4k = 50 cycles
   - Graceful degradation: works on Sonnet for <12 phase milestones
3. Update dispatch header with token budget and model preference note

**HALT.md Templates:**
- Budget exceeded: includes budget analysis, investigation steps, 3 recovery options
- Deadlock detected: includes deadlock analysis, last action, investigation steps, 3 recovery options
- Both logged to AUTO-DISPATCH-LOG.md with --type halt

**Verification:**
- BUDGET_TOKENS count: 8 occurrences
- PHASE_TOKENS_USED count: 8 occurrences
- STATE_HASH count: 3 occurrences (BEFORE, AFTER, comparison)
- STUCK_CYCLES count: 8 occurrences
- Both halt types present: "HALT: Token Budget Exceeded" and "HALT: Deadlock Detected"
- Opus mentions: 10 occurrences
- halt-max-iterations still exists (preserved existing logic)

**Commit:** 5509999

## Deviations from Plan

None - plan executed exactly as written.

All changes were ADDITIVE as specified. No existing logic restructured. All section numbering updated correctly after inserting new steps.

## Verification Results

**Must-haves verification:**

Truths:
- [x] Dispatcher enforces token budget per phase and halts with HALT.md when budget exceeded (500k default)
- [x] Dispatcher detects stuck loops when STATE.md is unchanged for 3 cycles and halts with deadlock report
- [x] Dispatcher logs model selection (Opus or Sonnet) to AUTO-DISPATCH-LOG.md at dispatch start
- [x] Dispatcher degrades gracefully from Opus to Sonnet when Opus is unavailable
- [x] All safety limits are logged to AUTO-DISPATCH-LOG.md for audit trail

Artifacts:
- [x] get-shit-done/workflows/auto-dispatch.md contains BUDGET_TOKENS (8 occurrences)
- [x] get-shit-done/workflows/auto-dispatch.md contains STATE_HASH tracking (3 occurrences)
- [x] get-shit-done/bin/gsd-tools.js contains budget_tokens_per_phase (3 occurrences)

Key links:
- [x] auto-dispatch.md logs budget exceeded and deadlock events via log-decision --type halt
- [x] auto-dispatch.md uses STATE_HASH for stuck loop detection (hash comparison before/after)
- [x] auto-dispatch.md reads budget_tokens_per_phase from gsd-tools.js state load

**All 11 must-haves satisfied.**

## Key Deliverables

**1. Token Budget Enforcement (DISP-07 partial):**
- Config field: budget_tokens_per_phase (default 500k)
- Estimation: 4 chars = 1 token + 10k overhead per action
- Per-phase tracking: PHASE_TOKENS_USED accumulates across iterations
- Halt trigger: PHASE_TOKENS_USED > BUDGET_TOKENS
- HALT.md includes: budget analysis, investigation steps, 3 recovery options
- Logged to AUTO-DISPATCH-LOG.md with rationale

**2. Stuck Loop Detection (DISP-07 partial):**
- Hash tracking: md5sum of STATE.md before/after each action
- Threshold: 3 consecutive unchanged cycles
- Halt trigger: STUCK_CYCLES >= 3
- HALT.md includes: deadlock analysis, last action, investigation steps, 3 recovery options
- Logged to AUTO-DISPATCH-LOG.md with rationale
- Reset to 0 when state changes

**3. Opus 1M Optimization (DISP-07 partial):**
- Model preference logged at dispatch start
- Context capacity comparison: Opus 1M (250 cycles) vs Sonnet (50 cycles)
- Graceful degradation: works on Sonnet for <12 phase milestones
- Documentation in context_budget section
- Dispatch header includes model preference note

**4. Audit Trail:**
- Budget exceeded events logged with estimated token usage
- Deadlock events logged with cycle count and last action
- Model preference logged at dispatch start
- All logged to AUTO-DISPATCH-LOG.md for human audit

## Technical Notes

**Token estimation heuristic:**
- 4 characters = 1 token (conservative, actual tokenizers more complex)
- 10k overhead per action (context, prompts, logging)
- Estimation source: plan file size (wc -c on PLAN.md)
- No API token counting needed (heuristic sufficient for budget enforcement)

**Deadlock detection edge cases:**
- Some actions legitimately don't change STATE.md (e.g., plan-phase may not update state if already planned)
- 3-cycle threshold balances false positives vs detection speed
- STATE.md hash unchanged = md5sum of entire file unchanged

**Opus 1M availability:**
- Dispatcher does not enforce Opus 1M requirement
- Model selection happens at Claude Code UI level
- Documentation guides users to prefer Opus 1M for long runs
- Sonnet fallback works for most milestones

**HALT.md recovery paths:**
- Option 1: Adjust config (increase budget, change settings)
- Option 2: Split work (smaller chunks, --single-phase)
- Option 3: Manual control (human oversight, investigate root cause)

## Self-Check

**Files created verification:**
No new files created (modifications only).

**Files modified verification:**
```bash
[ -f "get-shit-done/bin/gsd-tools.js" ] && echo "FOUND: get-shit-done/bin/gsd-tools.js"
[ -f "get-shit-done/references/planning-config.md" ] && echo "FOUND: get-shit-done/references/planning-config.md"
[ -f "get-shit-done/workflows/auto-dispatch.md" ] && echo "FOUND: get-shit-done/workflows/auto-dispatch.md"
```

FOUND: get-shit-done/bin/gsd-tools.js
FOUND: get-shit-done/references/planning-config.md
FOUND: get-shit-done/workflows/auto-dispatch.md

**Commits verification:**
```bash
git log --oneline --all | grep -q "8aea076" && echo "FOUND: 8aea076"
git log --oneline --all | grep -q "5509999" && echo "FOUND: 5509999"
```

FOUND: 8aea076
FOUND: 5509999

**Content verification:**
```bash
grep -c "budget_tokens_per_phase" get-shit-done/bin/gsd-tools.js  # Expected: 3+
grep -c "BUDGET_TOKENS" get-shit-done/workflows/auto-dispatch.md  # Expected: 8+
grep -c "STATE_HASH" get-shit-done/workflows/auto-dispatch.md     # Expected: 3+
grep -c "STUCK_CYCLES" get-shit-done/workflows/auto-dispatch.md   # Expected: 8+
grep -c "Opus" get-shit-done/workflows/auto-dispatch.md           # Expected: 10+
```

budget_tokens_per_phase: 3
BUDGET_TOKENS: 8
STATE_HASH: 3
STUCK_CYCLES: 8
Opus: 10

## Self-Check: PASSED

All files exist, all commits exist, all content verified.

## Next Phase Readiness

**Phase 9 Plan 3 completes DISP-07 (safety limits).**

**Remaining work for Phase 9:**
- No more plans in Phase 9

**Phase 9 Complete:** All 3 plans executed. Ready for Phase 9 verification.

**Blockers:** None

**Dependencies satisfied:** Phase 9 requires Phase 8 (agent mode foundation) - satisfied.

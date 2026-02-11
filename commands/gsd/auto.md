---
name: gsd:auto
description: Run an entire milestone autonomously using Chain-of-Agents dispatcher
argument-hint: "[--max-phases N] [--single-phase]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
---
<objective>
Execute an entire milestone autonomously through Chain-of-Agents dispatch: read STATE.md, determine next action (generate-context, plan, execute, verify), spawn fresh Task agent per action, read result, update state, loop until milestone complete or halt condition reached.

**Agent mode:** Fully autonomous. No human interaction. Auto-decide for all decisions.

**Creates/Updates:**
- `.planning/phases/*/CONTEXT.md` — auto-generated phase context (from roadmap + requirements)
- `.planning/phases/*/PLAN.md` — phase plans (via auto plan-phase)
- `.planning/phases/*/SUMMARY.md` — execution results (via auto execute-phase)
- `.planning/phases/*/VERIFICATION.md` — verification reports (via auto verify-work)
- `.planning/STATE.md` — updated after each phase action
- `.planning/AUTO-DISPATCH-LOG.md` — dispatch events and auto-decisions

**Stopping:**
- Graceful stop: Create `.planning/STOP` file (checked before each phase)
- Immediate stop: Ctrl+C (state saved before each spawn)
- Auto-halt: Task crash after retry, verification failure after max iterations, or unrecoverable error

**After this command:** Milestone complete or halted. Run `/gsd:auto` again to resume from halt (after fixing issues), or `/gsd:progress` to see results.
</objective>

<execution_context>
@C:\Users\tomas\.claude/get-shit-done/workflows/auto-dispatch.md
@C:\Users\tomas\.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
**Flags:**
- `--max-phases N` — Limit dispatcher to N phases (overrides config max_phases)
- `--single-phase` — Run only current phase, then stop (overrides config)

Config: @.planning/config.json
State: @.planning/STATE.md
Roadmap: @.planning/ROADMAP.md

**Flag parsing from $ARGUMENTS:**
```bash
# Extract flags from $ARGUMENTS
MAX_PHASES_FLAG=$(echo "$ARGUMENTS" | grep -oP '(?<=--max-phases\s)\d+' || echo "")
SINGLE_PHASE_FLAG=$(echo "$ARGUMENTS" | grep -q '\-\-single-phase' && echo "true" || echo "false")
```
</context>

<process>
Execute the auto-dispatch workflow from @C:\Users\tomas\.claude/get-shit-done/workflows/auto-dispatch.md end-to-end.

The dispatcher:
1. Validates agent_mode=true prerequisite
2. Reads STATE.md and ROADMAP.md to determine current position
3. Loops through phases, spawning fresh Task per action (Chain-of-Agents)
4. Handles crashes (retry once then halt), verification gaps (re-plan cycle), iteration limits
5. Checks STOP sentinel before each phase for graceful shutdown
6. Updates STATE.md after each action
7. Logs all dispatch events to AUTO-DISPATCH-LOG.md
8. Prints end-of-run summary on completion or halt

Preserve all workflow gates (validation, dispatch loop, error handling, state updates, logging).
</process>

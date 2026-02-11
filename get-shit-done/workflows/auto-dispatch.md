<purpose>
Autonomous dispatch loop for GSD agent mode. Reads STATE.md, determines next action, spawns fresh Task agent per phase action, reads result, updates state, loops until milestone complete or halt.

**Design constraint:** Dispatcher stays thin (less than 10k tokens per cycle). It NEVER reads plan files, research files, or executes tasks itself. It only reads state, decides, spawns, reads results, updates state.

**Architecture:** Chain-of-Agents pattern. Each phase action (generate-context, plan, execute, verify) gets a fresh Task agent with full context. Dispatcher accumulates minimal state (just tracking progress), avoiding context degradation across long milestone runs.
</purpose>

<required_reading>
@C:\Users\tomas\.claude/get-shit-done/references/planning-config.md for agent_mode config fields
</required_reading>

<process>

<step name="validate_environment" priority="first">
Check prerequisites before starting dispatch loop.

**1. Verify agent mode enabled:**
```bash
AGENT_MODE=$(node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js state load --raw | grep '^agent_mode=' | cut -d= -f2)

if [ "$AGENT_MODE" != "true" ]; then
  echo "ERROR: Agent mode not enabled"
  echo ""
  echo "To enable agent mode, set in .planning/config.json:"
  echo '  "agent_mode": true'
  echo ""
  echo "Agent mode runs entire milestones autonomously without human input."
  exit 1
fi
```

**2. Verify project initialized:**
```bash
if [ ! -f ".planning/STATE.md" ]; then
  echo "ERROR: Project not initialized"
  echo ""
  echo "Run /gsd:new-project first to initialize the project."
  exit 1
fi

if [ ! -f ".planning/ROADMAP.md" ]; then
  echo "ERROR: No roadmap found"
  echo ""
  echo "Run /gsd:new-project first to create a roadmap."
  exit 1
fi
```

**3. Read config for limits and scope:**
```bash
# Load config using gsd-tools.js state load --raw
CONFIG_RAW=$(node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js state load --raw)

# Extract agent_mode_settings
AUTO_SCOPE=$(echo "$CONFIG_RAW" | grep '^auto_scope=' | cut -d= -f2)
MAX_PHASES_CONFIG=$(echo "$CONFIG_RAW" | grep '^max_phases=' | cut -d= -f2)
MAX_ITERATIONS=$(echo "$CONFIG_RAW" | grep '^max_iterations_per_phase=' | cut -d= -f2)

# Apply defaults if not set
AUTO_SCOPE=${AUTO_SCOPE:-conservative}
MAX_PHASES_CONFIG=${MAX_PHASES_CONFIG:-999}
MAX_ITERATIONS=${MAX_ITERATIONS:-3}
```

**4. Parse CLI flags (overrides config):**
```bash
# Parse --max-phases flag from $ARGUMENTS
if echo "$ARGUMENTS" | grep -q '\-\-max-phases'; then
  MAX_PHASES_FLAG=$(echo "$ARGUMENTS" | grep -oP '(?<=--max-phases\s)\d+' || echo "")
  if [ -n "$MAX_PHASES_FLAG" ]; then
    MAX_PHASES=$MAX_PHASES_FLAG
  else
    MAX_PHASES=$MAX_PHASES_CONFIG
  fi
else
  MAX_PHASES=$MAX_PHASES_CONFIG
fi

# Parse --single-phase flag
if echo "$ARGUMENTS" | grep -q '\-\-single-phase'; then
  MAX_PHASES=1
fi
```

</step>

<step name="initialize_dispatch">
Read STATE.md and ROADMAP.md to determine starting position and milestone context.

**Read thin slices only (avoid large context loads):**

```bash
# Get current phase from STATE.md
CURRENT_PHASE=$(grep -A2 "^Phase:" .planning/STATE.md | head -n1 | grep -oP '\d+')

# Get milestone name from ROADMAP.md
MILESTONE=$(grep -m1 "^- \[.\] \*\*v" .planning/ROADMAP.md | grep -oP 'v[\d.]+[a-z-]*')

# Count total phases in current milestone
TOTAL_PHASES=$(grep "^- \[.\] \*\*Phase" .planning/ROADMAP.md | grep -v "^<details>" | wc -l)
```

**Log dispatch start:**
```bash
node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "dispatch" \
  --question "Auto-dispatch started" \
  --decision "Starting autonomous dispatch for milestone $MILESTONE" \
  --rationale "agent_mode=true, auto_scope=$AUTO_SCOPE, max_phases=$MAX_PHASES, max_iterations=$MAX_ITERATIONS"
```

**Initialize counters:**
```bash
PHASES_COMPLETED=0
TOTAL_DECISIONS=0
```

**Print dispatch header:**
```
==================================================
GSD AUTO-DISPATCH
==================================================
Milestone: $MILESTONE
Agent Mode: ON (auto_scope=$AUTO_SCOPE)
Starting Phase: $CURRENT_PHASE of $TOTAL_PHASES
Max Phases: $MAX_PHASES
Max Iterations: $MAX_ITERATIONS

Dispatch log: .planning/AUTO-DISPATCH-LOG.md
Stop file: .planning/STOP (create to stop gracefully)
==================================================
```

</step>

<step name="dispatch_loop">
Loop through phases, determining next action per phase and spawning Task agents.

**For each phase from current position to end (or until MAX_PHASES reached):**

```bash
PHASE=$CURRENT_PHASE
PHASE_ITERATION=1

while [ $PHASE -le $TOTAL_PHASES ] && [ $PHASES_COMPLETED -lt $MAX_PHASES ]; do
```

**3a. Check STOP sentinel:**
```bash
if [ -f ".planning/STOP" ]; then
  echo ""
  echo "==================================================  "
  echo "GRACEFUL STOP REQUESTED"
  echo "=================================================="
  echo ""
  echo "STOP file detected at .planning/STOP"
  echo "Current phase ($PHASE) will complete before stopping."
  echo ""

  # Remove STOP file to prevent stale stops on next run
  rm .planning/STOP

  # Log graceful stop
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "dispatch" \
    --question "Graceful stop" \
    --decision "Stopping after phase $PHASE completes" \
    --rationale "STOP sentinel file detected"

  # Break out of loop after current phase completes
  MAX_PHASES=$PHASES_COMPLETED
fi
```

**3b. Determine phase status and next action:**

Read phase directory to determine what exists:
```bash
PHASE_DIR=$(node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js find-phase "$PHASE" --raw 2>/dev/null)

if [ -z "$PHASE_DIR" ]; then
  echo "ERROR: Phase $PHASE not found in roadmap"
  exit 1
fi

# Check what artifacts exist
HAS_CONTEXT=$(ls "$PHASE_DIR"/*-CONTEXT.md 2>/dev/null | wc -l)
HAS_PLAN=$(ls "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l)
HAS_SUMMARY=$(ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | wc -l)
HAS_VERIFICATION=$(ls "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null | wc -l)

# Count expected plans from ROADMAP.md for this phase
PHASE_SLUG=$(basename "$PHASE_DIR")
EXPECTED_PLANS=$(grep -A20 "^### Phase $PHASE:" .planning/ROADMAP.md | grep "^Plans:" | head -n1 | grep -oP '\d+' | head -n1 || echo "1")
```

Determine next action:
```bash
if [ $HAS_CONTEXT -eq 0 ]; then
  NEXT_ACTION="generate-context"
elif [ $HAS_PLAN -eq 0 ]; then
  NEXT_ACTION="plan-phase"
elif [ $HAS_SUMMARY -lt $EXPECTED_PLANS ]; then
  NEXT_ACTION="execute-phase"
elif [ $HAS_VERIFICATION -eq 0 ] && [ "$(echo "$CONFIG_RAW" | grep '^verifier=' | cut -d= -f2)" = "true" ]; then
  NEXT_ACTION="verify-phase"
elif [ $HAS_VERIFICATION -gt 0 ]; then
  # Check if verification passed
  VERIFICATION_FILE=$(ls "$PHASE_DIR"/*-VERIFICATION.md | head -n1)
  if grep -q "## Status: PASS" "$VERIFICATION_FILE" 2>/dev/null; then
    NEXT_ACTION="phase-complete"
  else
    # Verification found gaps -- increment iteration
    if [ $PHASE_ITERATION -ge $MAX_ITERATIONS ]; then
      NEXT_ACTION="halt-max-iterations"
    else
      NEXT_ACTION="re-plan"
      PHASE_ITERATION=$((PHASE_ITERATION + 1))
    fi
  fi
else
  # No verification required or verification passed
  NEXT_ACTION="phase-complete"
fi
```

**3c. Spawn Task for action:**

Print status:
```bash
echo ""
echo "=================================================="
echo "Phase $PHASE/$TOTAL_PHASES: $PHASE_SLUG"
echo "Action: $NEXT_ACTION (iteration $PHASE_ITERATION)"
echo "=================================================="
echo ""
```

Log dispatch event:
```bash
node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "dispatch" \
  --question "Phase $PHASE action" \
  --decision "$NEXT_ACTION" \
  --rationale "Phase status: context=$HAS_CONTEXT, plans=$HAS_PLAN/$EXPECTED_PLANS, summaries=$HAS_SUMMARY/$EXPECTED_PLANS, verification=$HAS_VERIFICATION, iteration=$PHASE_ITERATION"
```

**Execute action based on type:**

```bash
case "$NEXT_ACTION" in
  generate-context)
    # Spawn Task to auto-generate CONTEXT.md from roadmap + requirements
    Task "Generate synthetic CONTEXT.md for phase $PHASE" <<EOF_CONTEXT
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

<objective>
Generate synthetic CONTEXT.md for phase $PHASE by analyzing roadmap and requirements.

Read:
- .planning/ROADMAP.md (phase goal, description, requirements)
- .planning/REQUIREMENTS.md (if exists)
- .planning/PROJECT.md (project context)

Extract implementation decisions from phase description. Follow the CONTEXT.md template format:
- Domain: Phase boundary (what's in scope, what's out)
- Decisions: Implementation choices that downstream agents need
- Specifics: Concrete details from roadmap
- Deferred: Ideas mentioned but out of scope

Write to: $PHASE_DIR/${PHASE}-CONTEXT.md

This is the agent-mode equivalent of discuss-phase. The goal is to produce the same structured input that plan-phase expects.
</objective>

<process>
1. Read phase entry from ROADMAP.md (goal, requirements, description)
2. Read PROJECT.md and REQUIREMENTS.md for project context
3. Extract decisions and constraints from descriptions
4. Write CONTEXT.md using template format
5. Verify file written successfully
</process>
EOF_CONTEXT
    ;;

  plan-phase)
    # Spawn Task to run plan-phase with agent-mode context
    Task "Plan phase $PHASE with auto-decide" <<EOF_PLAN
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

Execute /gsd:plan-phase $PHASE
EOF_PLAN
    ;;

  execute-phase)
    # Spawn Task to run execute-phase with agent-mode context
    Task "Execute phase $PHASE with auto-decide" <<EOF_EXEC
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

Execute /gsd:execute-phase $PHASE
EOF_EXEC
    ;;

  verify-phase)
    # Spawn Task to run verify-work with agent-mode context
    Task "Verify phase $PHASE with auto-decide" <<EOF_VERIFY
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

Execute /gsd:verify-work $PHASE
EOF_VERIFY
    ;;

  re-plan)
    # Verification found gaps -- re-plan in gap closure mode
    echo "Verification found gaps. Re-planning with --gaps flag..."

    Task "Re-plan phase $PHASE with gap closure" <<EOF_REPLAN
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

Execute /gsd:plan-phase $PHASE --gaps
EOF_REPLAN

    # After re-planning, trigger re-execute
    Task "Re-execute phase $PHASE gap closure plans" <<EOF_REEXEC
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions requiring LLM synthesis: generate the answer from project context, then log via:
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <your_answer> --rationale <sources_used>
- Agent mode config: agent_mode=true, auto_scope=$AUTO_SCOPE
</auto_mode>

Execute /gsd:execute-phase $PHASE --gaps-only
EOF_REEXEC

    # Loop back to verify
    continue
    ;;

  phase-complete)
    echo "Phase $PHASE complete."
    PHASES_COMPLETED=$((PHASES_COMPLETED + 1))

    # Update STATE.md to advance to next phase
    # (This would be done by the Task agents, but we track it here for dispatch)

    # Move to next phase
    PHASE=$((PHASE + 1))
    PHASE_ITERATION=1
    continue
    ;;

  halt-max-iterations)
    echo ""
    echo "=================================================="
    echo "HALT: Max iterations reached"
    echo "=================================================="
    echo ""
    echo "Phase $PHASE has exceeded max iterations ($MAX_ITERATIONS)."
    echo "Verification still shows gaps after $MAX_ITERATIONS plan-execute cycles."
    echo ""

    # Write HALT.md
    cat > "$PHASE_DIR/HALT.md" <<EOF_HALT
# HALT: Max Iterations Exceeded

**Phase:** $PHASE ($PHASE_SLUG)
**Iteration:** $PHASE_ITERATION
**Max allowed:** $MAX_ITERATIONS
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Reason

Phase verification found gaps after $MAX_ITERATIONS plan-execute-verify cycles. This indicates:
1. Requirements may be unclear or incomplete
2. Implementation is hitting unexpected complexity
3. Verification criteria may be too strict

## Investigation Steps

1. Read the latest verification report: $VERIFICATION_FILE
2. Review the gap descriptions
3. Check if requirements need clarification
4. Decide: adjust requirements, simplify approach, or relax verification

## Recovery

After fixing the issue, run:
\`\`\`bash
/gsd:auto --single-phase  # Resume from this phase
\`\`\`

Or continue manually:
\`\`\`bash
/gsd:plan-phase $PHASE --gaps
/gsd:execute-phase $PHASE --gaps-only
/gsd:verify-work $PHASE
\`\`\`
EOF_HALT

    # Update STATE.md
    node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
      --type "halt" \
      --question "Phase $PHASE status" \
      --decision "Halted after max iterations" \
      --rationale "Max iterations ($MAX_ITERATIONS) exceeded without passing verification"

    # Exit dispatch loop
    exit 1
    ;;

esac
```

**3d. Read Task result:**

After Task returns, verify expected artifact exists:
```bash
case "$NEXT_ACTION" in
  generate-context)
    if [ ! -f "$PHASE_DIR/${PHASE}-CONTEXT.md" ]; then
      echo "ERROR: Task crashed -- CONTEXT.md not created"
      # Trigger crash handling
      CRASH_ACTION="generate-context"
    fi
    ;;
  plan-phase)
    NEW_PLANS=$(ls "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l)
    if [ $NEW_PLANS -eq 0 ]; then
      echo "ERROR: Task crashed -- no PLAN.md files created"
      CRASH_ACTION="plan-phase"
    fi
    ;;
  execute-phase)
    NEW_SUMMARIES=$(ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | wc -l)
    if [ $NEW_SUMMARIES -lt $EXPECTED_PLANS ]; then
      echo "ERROR: Task crashed -- expected $EXPECTED_PLANS summaries, found $NEW_SUMMARIES"
      CRASH_ACTION="execute-phase"
    fi
    ;;
  verify-phase)
    if [ ! -f "$PHASE_DIR"/*-VERIFICATION.md ]; then
      echo "ERROR: Task crashed -- VERIFICATION.md not created"
      CRASH_ACTION="verify-phase"
    fi
    ;;
esac
```

**3e. Handle Task crash:**

If crash detected (expected artifact missing):
```bash
if [ -n "$CRASH_ACTION" ]; then
  echo ""
  echo "=================================================="
  echo "TASK CRASH DETECTED"
  echo "=================================================="
  echo "Action: $CRASH_ACTION"
  echo "Retrying with fresh context..."
  echo ""

  # Log crash
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "crash" \
    --question "Task crash on $CRASH_ACTION" \
    --decision "Retry once with fresh context" \
    --rationale "Expected artifact missing after Task return"

  # Retry once (repeat the Task spawn from 3c with same NEXT_ACTION)
  # [Re-run the case statement with NEXT_ACTION=$CRASH_ACTION]

  # After retry, check again
  # If still crashed, HALT
  if [ ! -f "$EXPECTED_ARTIFACT" ]; then
    echo ""
    echo "=================================================="
    echo "HALT: Task crash after retry"
    echo "=================================================="
    echo ""

    # Write HALT.md
    cat > "$PHASE_DIR/HALT.md" <<EOF_CRASH_HALT
# HALT: Task Crash After Retry

**Phase:** $PHASE ($PHASE_SLUG)
**Action:** $CRASH_ACTION
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Reason

Task agent crashed while executing $CRASH_ACTION. Retry also failed.

Possible causes:
1. Agent error (context overflow, tool failure)
2. Missing prerequisite files or config
3. Invalid phase structure

## Investigation Steps

1. Check AUTO-DISPATCH-LOG.md for error details
2. Verify phase structure in ROADMAP.md
3. Check .planning/config.json for correct settings
4. Review last successful phase for comparison

## Recovery

Fix the underlying issue, then run:
\`\`\`bash
/gsd:auto --single-phase  # Resume from this phase
\`\`\`
EOF_CRASH_HALT

    # Log halt
    node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
      --type "halt" \
      --question "Phase $PHASE status" \
      --decision "Halted after task crash and retry" \
      --rationale "Task failed twice on $CRASH_ACTION"

    exit 1
  fi

  # Clear crash flag if retry succeeded
  unset CRASH_ACTION
fi
```

**3f. Update state after success:**

After action completes successfully:
```bash
# Log success
node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "dispatch" \
  --question "Phase $PHASE $NEXT_ACTION status" \
  --decision "Success" \
  --rationale "Expected artifact created, moving to next action"

echo "Action complete: $NEXT_ACTION"
echo ""
```

**3g. Loop:**

Continue to next action in phase or next phase.

```bash
done  # End of while loop
```

</step>

<step name="milestone_complete">
When all phases are complete or MAX_PHASES reached, finalize dispatch.

**Print end-of-run summary:**
```bash
echo ""
echo "=================================================="
echo "AUTO-DISPATCH COMPLETE"
echo "=================================================="
echo ""
echo "Milestone: $MILESTONE"
echo "Phases completed: $PHASES_COMPLETED"
echo ""

# Count decisions from log
TOTAL_DECISIONS=$(grep -c "^\[" .planning/AUTO-DISPATCH-LOG.md || echo "0")
echo "Total decisions: $TOTAL_DECISIONS"
echo ""
echo "Dispatch log: .planning/AUTO-DISPATCH-LOG.md"
echo "Project state: .planning/STATE.md"
echo ""

if [ $PHASES_COMPLETED -ge $TOTAL_PHASES ]; then
  echo "STATUS: Milestone complete"
  echo ""
  echo "Next: Run /gsd:progress to see full results"
elif [ $PHASES_COMPLETED -ge $MAX_PHASES ]; then
  echo "STATUS: Phase limit reached ($MAX_PHASES phases)"
  echo ""
  echo "Next: Run /gsd:auto again to continue, or /gsd:progress to review"
else
  echo "STATUS: Halted (see HALT.md in phase directory)"
fi

echo "=================================================="
```

**Update STATE.md with milestone completion (if all phases done):**
```bash
if [ $PHASES_COMPLETED -ge $TOTAL_PHASES ]; then
  # Update STATE.md status to milestone complete
  # (This is typically done by the verify-work or execute-phase Task, but we log it here)

  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "dispatch" \
    --question "Milestone status" \
    --decision "Milestone $MILESTONE complete" \
    --rationale "All $TOTAL_PHASES phases completed successfully"
fi
```

</step>

</process>

<error_handling>

## Error Types and Handling

### 1. Task Crash (Agent Failure)

**Detection:** Expected artifact missing after Task returns.

**Handling:**
1. Log crash event to AUTO-DISPATCH-LOG.md
2. Retry same action once with fresh Task (identical prompt)
3. If retry also fails: write HALT.md, update STATE.md to blocked, exit

**Rationale:** Fresh context may resolve transient issues (tool failures, context confusion). Two failures indicate systematic problem needing human investigation.

### 2. Verification Gaps (Work Complete but Inadequate)

**Detection:** VERIFICATION.md exists but status is not PASS.

**Handling:**
1. Increment phase iteration counter
2. If iteration < max_iterations_per_phase: trigger re-plan -> re-execute cycle (gap closure mode)
3. If iteration >= max_iterations_per_phase: write HALT.md with gap analysis, exit

**Rationale:** Verification gaps mean requirements were not met. Re-planning with gap context gives agent a chance to fix. Multiple failures indicate requirements or approach need human review.

### 3. Invalid State (Missing Prerequisites)

**Detection:**
- No ROADMAP.md found
- Phase directory not found
- Config validation failures

**Handling:**
1. Print clear error message with fix instructions
2. Exit immediately (no retry)

**Rationale:** These are setup issues, not transient failures. User must fix before dispatch can proceed.

</error_handling>

<stop_sentinel>

## STOP File for Graceful Shutdown

**Purpose:** Allow graceful stop between phases without killing mid-work.

**Mechanism:**
- User creates `.planning/STOP` file (empty file, any method)
- Dispatcher checks for STOP before each phase action
- If STOP found: current phase completes, then dispatcher exits cleanly
- STOP file removed after detection (prevents stale stops on next run)

**For immediate stop:** Use Ctrl+C. Dispatcher saves STATE.md before each Task spawn, so state is always recoverable.

**Usage:**
```bash
# During dispatch, in another terminal:
touch .planning/STOP

# Dispatcher will stop after current phase completes
```

</stop_sentinel>

<context_budget>

## Dispatcher Context Budget Analysis

The dispatcher accumulates context across phases but stays thin per cycle.

**Per-cycle cost (for each phase action):**
- STATE.md read: ~500 tokens
- ROADMAP.md phase list scan: ~200 tokens
- Phase directory listing: ~100 tokens
- Dispatch decision logic: ~500 tokens
- Task spawn prompt: ~2000 tokens
- Task result check: ~500 tokens
- Logging: ~300 tokens
- **Total per cycle: ~4k tokens**

**Accumulated context for full milestone:**
- 10 phases x ~4 actions each = 40 cycles
- 40 cycles x 4k tokens = ~160k tokens
- Opus 1M context window = 16% utilization

**Conclusion:** Dispatcher can handle milestones up to 50+ phases without context degradation risk. The Chain-of-Agents pattern (fresh Task per action) prevents individual agents from context degradation, and the dispatcher itself stays thin.

</context_budget>

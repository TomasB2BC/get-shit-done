<purpose>
Autonomous dispatch loop for GSD agent mode. Reads STATE.md, determines next action, spawns fresh Task agent per phase action, reads result, updates state, loops until milestone complete or halt.

**Design constraint:** Dispatcher stays thin (less than 10k tokens per cycle). It NEVER reads plan files, research files, or executes tasks itself. It only reads state, decides, spawns, reads results, updates state.

**Architecture:** Chain-of-Agents pattern. Each phase action (generate-context, plan, execute, verify) gets a fresh Task agent with full context. Dispatcher accumulates minimal state (just tracking progress), avoiding context degradation across long milestone runs.
</purpose>

<required_reading>
@C:\Users\tomas\.claude/get-shit-done/references/planning-config.md for agent_mode config fields
</required_reading>

<process>


## 0. Project Resolution

```bash
# INVARIANT: No workflow step may resolve relative paths (e.g., .planning/*)
# before Step 0 completes. Step 0 may change cwd via `cd "$PROJECT_ROOT"`.
# All relative path access must occur in named steps after Step 0.
PROJECT_ALIAS=""
if echo "$ARGUMENTS" | grep -q '\-\-project'; then
  PROJECT_ALIAS=$(echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--project[[:space:]]\+[[:graph:]]\+//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
fi

if [ -n "$PROJECT_ALIAS" ]; then
  PROJECT_DIR=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS" --raw)
  if [ -z "$PROJECT_DIR" ]; then
    echo "[X] ERROR: Project alias '$PROJECT_ALIAS' not found"
    node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS"
    # Stop execution
  fi
  PROJECT_ROOT=$(dirname "$PROJECT_DIR")
  cd "$PROJECT_ROOT"
  echo ">> Resolved --project $PROJECT_ALIAS -> $PROJECT_ROOT"
fi
```

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
BUDGET_TOKENS=$(echo "$CONFIG_RAW" | grep '^budget_tokens_per_phase=' | cut -d= -f2)

# Apply defaults if not set
AUTO_SCOPE=${AUTO_SCOPE:-conservative}
MAX_PHASES_CONFIG=${MAX_PHASES_CONFIG:-999}
MAX_ITERATIONS=${MAX_ITERATIONS:-3}
BUDGET_TOKENS=${BUDGET_TOKENS:-500000}
AUTONOMY_LEVEL=$(echo "$CONFIG_RAW" | grep '^autonomy_level=' | cut -d= -f2)
AUTONOMY_LEVEL=${AUTONOMY_LEVEL:-auto-decide}
ORCH_MODE=$(echo "$CONFIG_RAW" | grep '^orchestration=' | cut -d= -f2)
ORCH_MODE=${ORCH_MODE:-classic}
AGENT_TEAMS_RESEARCH=$(echo "$CONFIG_RAW" | grep '^agent_teams_research=' | cut -d= -f2)
AGENT_TEAMS_RESEARCH=${AGENT_TEAMS_RESEARCH:-false}
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

# Parse --resume flag
RESUME_MODE="false"
if echo "$ARGUMENTS" | grep -q '\-\-resume'; then
  RESUME_MODE="true"
fi
```

</step>

<step name="resume_check">
When `--resume` flag is passed, check for recovery files before starting the main dispatch loop.

**Priority 1: PENDING_APPROVAL.md (session died mid-approval)**

```bash
if [ "$RESUME_MODE" = "true" ]; then
  echo "Resume mode: checking for recovery files..."

  PENDING_FILES=$(find .planning/phases -name "PENDING_APPROVAL.md" 2>/dev/null)
  if [ -n "$PENDING_FILES" ]; then
    PENDING_FILE=$(echo "$PENDING_FILES" | head -n1)
    echo ""
    echo "=================================================="
    echo "RESUMING: Found pending approval from previous session"
    echo "=================================================="
    echo ""
    cat "$PENDING_FILE"
    echo ""

    # Extract phase and action from RESUME_MARKER
    RESUME_PHASE=$(grep 'dispatcher-resume' "$PENDING_FILE" | grep -oP '(?<=phase=)[\d.]+')
    RESUME_ACTION=$(grep 'dispatcher-resume' "$PENDING_FILE" | grep -oP '(?<=action=)[a-z-]+')

    # Re-surface the decision
    LEAD_RESPONSE=$(AskUserQuestion "RESUMED: Previous session died while waiting for your input.

Phase $RESUME_PHASE action: $RESUME_ACTION

The dispatcher was waiting for your approval on this architectural decision.
Please review the pending approval details above.

Respond with:
  * approve    -- proceed with $RESUME_ACTION
  * reject     -- halt dispatcher
  * delegate   -- auto-decide this action type for rest of run")

    # Delete pending file -- response received
    rm -f "$PENDING_FILE"

    # Parse response (same logic as main loop)
    RESPONSE_LOWER=$(echo "$LEAD_RESPONSE" | tr '[:upper:]' '[:lower:]')
    if echo "$RESPONSE_LOWER" | grep -q "^reject\|^no"; then
      echo "Lead rejected. Writing HALT.md..."
      PHASE_DIR=$(dirname "$PENDING_FILE")
      cat > "$PHASE_DIR/HALT.md" <<HALT_RESUME_EOF
# HALT: Rejected on Resume

**Phase:** $RESUME_PHASE
**Action:** $RESUME_ACTION
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## RESUME_MARKER
<!-- dispatcher-resume: phase=$RESUME_PHASE action=$RESUME_ACTION decision_type=architectural -->

## Reason
Lead rejected the architectural decision on resume.

## Recovery
Edit ROADMAP.md or REQUIREMENTS.md, then run /gsd:auto --resume
HALT_RESUME_EOF

      node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
        --type "architectural" \
        --question "Resume from PENDING_APPROVAL.md: $RESUME_ACTION" \
        --decision "Rejected on resume -- HALT" \
        --rationale "Lead rejected phase $RESUME_PHASE action $RESUME_ACTION on resume" \
        --response "rejected-on-resume" \
        --wait-time "0"

      exit 1
    elif echo "$RESPONSE_LOWER" | grep -q "^delegate\|^auto\|^skip"; then
      DELEGATED_CATEGORIES="$DELEGATED_CATEGORIES $RESUME_ACTION"
    fi

    # Set starting position to resume phase
    CURRENT_PHASE=$RESUME_PHASE

    node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
      --type "dispatch" \
      --question "Resume from PENDING_APPROVAL.md" \
      --decision "Resumed phase $RESUME_PHASE, action $RESUME_ACTION" \
      --rationale "Lead response: $LEAD_RESPONSE"
  fi

  # Priority 2: HALT.md with RESUME_MARKER (double rejection or other halt)
  if [ -z "$PENDING_FILES" ]; then
    HALT_FILES=$(grep -rl 'dispatcher-resume' .planning/phases/*/HALT.md 2>/dev/null)
    if [ -n "$HALT_FILES" ]; then
      HALT_FILE=$(echo "$HALT_FILES" | head -n1)
      echo ""
      echo "=================================================="
      echo "RESUMING: Found HALT.md with resume marker"
      echo "=================================================="
      echo ""
      cat "$HALT_FILE"
      echo ""

      RESUME_PHASE=$(grep 'dispatcher-resume' "$HALT_FILE" | grep -oP '(?<=phase=)[\d.]+')
      RESUME_ACTION=$(grep 'dispatcher-resume' "$HALT_FILE" | grep -oP '(?<=action=)[a-z-]+')

      # Remove HALT.md to prevent re-triggering
      rm -f "$HALT_FILE"

      # Set starting position to halted phase
      CURRENT_PHASE=$RESUME_PHASE

      node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
        --type "dispatch" \
        --question "Resume from HALT.md" \
        --decision "Resumed phase $RESUME_PHASE from halt" \
        --rationale "HALT.md with dispatcher-resume marker found and cleared"

      echo "Resuming dispatch from Phase $RESUME_PHASE..."
    else
      echo "No recovery files found. Starting normal dispatch."
    fi
  fi
fi
```

</step>

<step name="initialize_dispatch">
Read STATE.md and ROADMAP.md to determine starting position and milestone context.

**Read thin slices only (avoid large context loads):**

```bash
# Get current phase from STATE.md
CURRENT_PHASE=$(grep -A2 "^Phase:" .planning/STATE.md | head -n1 | grep -oP '\d+(\.\d+)?')

# Get milestone name from ROADMAP.md
MILESTONE=$(grep -m1 "^- \[.\] \*\*v" .planning/ROADMAP.md | grep -oP 'v[\d.]+[a-z-]*')

# Get sorted phase list from list-phases command
PHASE_LIST=$(node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js list-phases --raw)
TOTAL_PHASES=$(echo "$PHASE_LIST" | grep -c . || echo "0")
```

**Log dispatch start:**
```bash
node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "dispatch" \
  --question "Auto-dispatch started" \
  --decision "Starting autonomous dispatch for milestone $MILESTONE" \
  --rationale "agent_mode=true, auto_scope=$AUTO_SCOPE, max_phases=$MAX_PHASES, max_iterations=$MAX_ITERATIONS, budget_tokens_per_phase=$BUDGET_TOKENS"

# Log model preference for Opus 1M
node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "dispatch" \
  --question "Dispatcher model preference" \
  --decision "Prefer Opus 1M for dispatcher sessions" \
  --rationale "1M context = 250+ cycles without degradation (4k tokens/cycle). Sonnet 200k = 50 cycles (sufficient for most milestones). Graceful degradation: works on Sonnet for <12 phase milestones."

# Log team research config if enabled
if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "dispatch" \
    --question "Team research configuration" \
    --decision "Team research enabled (orchestration=$ORCH_MODE, agent_teams.research=$AGENT_TEAMS_RESEARCH)" \
    --rationale "When plan-phase is dispatched, hybrid research branch should activate if CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 env var is also set"
fi
```

**Initialize counters:**
```bash
PHASES_COMPLETED=0
TOTAL_DECISIONS=0
STUCK_CYCLES=0
```

**Print dispatch header:**
```
==================================================
GSD AUTO-DISPATCH
==================================================
Milestone: $MILESTONE
Agent Mode: ON (auto_scope=$AUTO_SCOPE)
Autonomy Level: $AUTONOMY_LEVEL
Starting Phase: $CURRENT_PHASE [$((PHASE_IDX + 1))/$TOTAL_PHASES]
Max Phases: $MAX_PHASES
Max Iterations: $MAX_ITERATIONS
Token Budget: $BUDGET_TOKENS per phase
Orchestration: $ORCH_MODE
Team Research: $AGENT_TEAMS_RESEARCH

Model: Prefer Opus 1M (1M context = 250+ cycles)
Dispatch log: .planning/AUTO-DISPATCH-LOG.md
Stop file: .planning/STOP (create to stop gracefully)
==================================================
```

**Lead notification (when lead-approval mode):**
```bash
if [ "$AUTONOMY_LEVEL" = "lead-approval" ]; then
  echo ""
  echo "=================================================="
  echo "LEAD-APPROVAL MODE ACTIVE"
  echo "=================================================="
  echo ""
  echo "Architectural decisions will be routed to you via prompt."
  echo "Operational decisions continue automatically."
  echo ""
  echo "Architectural categories:"
  echo "  * Scope & structure changes (adding/removing phases, milestone goals)"
  echo "  * External-facing changes (new dependencies, API/schema changes)"
  echo "  Edge cases evaluated on reversibility."
  echo ""
  echo "To delegate a category during the run: respond 'delegate' to any prompt."
  echo "Delegations apply for this run only (not saved to config)."
  echo "=================================================="
fi
```

**Initialize delegation tracking and decision counters:**
```bash
DELEGATED_CATEGORIES=""
ARCHITECTURAL_COUNT=0
OPERATIONAL_COUNT=0
```

</step>

<step name="dispatch_loop">
Loop through phases, determining next action per phase and spawning Task agents.

**For each phase from current position to end (or until MAX_PHASES reached):**

```bash
# Convert phase list to bash array
IFS=$'\n' read -r -d '' -a PHASES <<< "$PHASE_LIST" || true

# Find starting index for CURRENT_PHASE
PHASE_IDX=0
for i in "${!PHASES[@]}"; do
  if [ "${PHASES[$i]}" = "$CURRENT_PHASE" ]; then
    PHASE_IDX=$i
    break
  fi
done

PHASE="${PHASES[$PHASE_IDX]}"
PHASE_ITERATION=1
PHASE_TOKENS_USED=0

while [ $PHASE_IDX -lt ${#PHASES[@]} ] && [ $PHASES_COMPLETED -lt $MAX_PHASES ]; do
  PHASE="${PHASES[$PHASE_IDX]}"
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

**3b. Track state hash for stuck loop detection:**

```bash
# Capture STATE.md hash before action
STATE_HASH_BEFORE=$(md5sum .planning/STATE.md 2>/dev/null | cut -d' ' -f1 || echo "none")
```

**3c. Determine phase status and next action:**

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
EXPECTED_PLANS=$(grep -F -A20 "### Phase $PHASE:" .planning/ROADMAP.md | grep "^Plans:" | head -n1 | grep -oP '\d+' | head -n1 || echo "1")
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

**3d. Spawn Task for action:**

Print status:
```bash
echo ""
echo "=================================================="
echo "Phase $PHASE [$((PHASE_IDX + 1))/$TOTAL_PHASES]: $PHASE_SLUG"
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

**Lead-approval classification (before action dispatch):**

```bash
# === Lead-approval classification (before action dispatch) ===
if [ "$AUTONOMY_LEVEL" = "lead-approval" ]; then
  # Classify current action
  CLASSIFICATION="operational"  # default

  # Tier 1: Predefined architectural action types
  case "$NEXT_ACTION" in
    generate-context)
      # Synthesizing phase scope is a structure change
      CLASSIFICATION="architectural"
      CLASSIFICATION_REASON="scope & structure change (auto-generating phase context)"
      ;;
    re-plan)
      # Re-planning after verification gap may change structure
      CLASSIFICATION="architectural"
      CLASSIFICATION_REASON="structure change (re-planning after verification gap)"
      ;;
    halt-max-iterations)
      # What to do at iteration limit is a lead decision
      CLASSIFICATION="architectural"
      CLASSIFICATION_REASON="lead decision (max iterations exceeded -- skip, extend, or halt?)"
      ;;
  esac

  # Tier 2: For actions not caught by Tier 1, apply reversibility test
  # (Dispatcher reasons inline about whether action is hard to undo)
  # plan-phase, execute-phase, verify-phase, phase-complete are operational

  if [ "$CLASSIFICATION" = "architectural" ]; then
    ARCHITECTURAL_COUNT=$((ARCHITECTURAL_COUNT + 1))

    # Check if lead has delegated this action type
    if echo "$DELEGATED_CATEGORIES" | grep -qw "$NEXT_ACTION"; then
      # Delegated -- auto-decide as if operational
      OPERATIONAL_COUNT=$((OPERATIONAL_COUNT + 1))
      ARCHITECTURAL_COUNT=$((ARCHITECTURAL_COUNT - 1))

      node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
        --type "architectural" \
        --question "Phase $PHASE: $NEXT_ACTION (delegated)" \
        --decision "Auto-proceeding (category delegated by lead)" \
        --rationale "Lead delegated $NEXT_ACTION category earlier in this run" \
        --response "delegated" \
        --wait-time "0"
    else
      # === Write-ahead PENDING_APPROVAL.md BEFORE AskUserQuestion ===
      PENDING_FILE="$PHASE_DIR/PENDING_APPROVAL.md"
      cat > "$PENDING_FILE" <<PENDING_EOF
# Pending Approval: Architectural Decision

**Phase:** $PHASE ($PHASE_SLUG)
**Action:** $NEXT_ACTION
**Classification:** architectural ($CLASSIFICATION_REASON)
**Started:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Status:** PENDING

## RESUME_MARKER
<!-- dispatcher-resume: phase=$PHASE action=$NEXT_ACTION decision_type=architectural status=pending_approval -->

## Recovery
If you see this file, the dispatcher was waiting for your input and the session died.

To resume: /gsd:auto --resume
The dispatcher will re-surface this decision.

Or decide manually and delete this file, then run /gsd:auto to continue.
PENDING_EOF

      # === Route to lead via AskUserQuestion ===
      WAIT_START=$(date +%s)
      REJECTION_COUNT=0

      LEAD_RESPONSE=$(AskUserQuestion "ARCHITECTURAL DECISION REQUIRED

Phase $PHASE [$((PHASE_IDX + 1))/$TOTAL_PHASES]: $PHASE_SLUG
Action: $NEXT_ACTION (iteration $PHASE_ITERATION)
Classification: architectural -- $CLASSIFICATION_REASON

Should I proceed with this action?

Respond with:
  * approve    -- proceed with $NEXT_ACTION
  * reject [feedback] -- I will revise and re-ask once
  * delegate   -- auto-decide $NEXT_ACTION actions for rest of this run")

      WAIT_END=$(date +%s)
      WAIT_TIME=$((WAIT_END - WAIT_START))

      # Delete PENDING_APPROVAL.md -- response received
      rm -f "$PENDING_FILE"

      # === Parse lead response ===
      RESPONSE_LOWER=$(echo "$LEAD_RESPONSE" | tr '[:upper:]' '[:lower:]')

      if echo "$RESPONSE_LOWER" | grep -q "^reject\|^no\|^revise\|^change"; then
        REJECTION_COUNT=$((REJECTION_COUNT + 1))
        REJECTION_FEEDBACK=$(echo "$LEAD_RESPONSE" | sed 's/^[Rr]eject[[:space:]]*//')

        # Log first rejection
        node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
          --type "architectural" \
          --question "Phase $PHASE: $NEXT_ACTION" \
          --decision "Rejected by lead (round 1)" \
          --rationale "Lead feedback: $REJECTION_FEEDBACK. Wait time: ${WAIT_TIME}s" \
          --response "rejected" \
          --wait-time "${WAIT_TIME}"

        # === Revision round: re-ask with feedback context ===
        PENDING_FILE="$PHASE_DIR/PENDING_APPROVAL.md"
        cat > "$PENDING_FILE" <<PENDING2_EOF
# Pending Approval: Revision Round

**Phase:** $PHASE ($PHASE_SLUG)
**Action:** $NEXT_ACTION
**Round:** 2 (final -- will halt on second rejection)
**Started:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Status:** PENDING

## RESUME_MARKER
<!-- dispatcher-resume: phase=$PHASE action=$NEXT_ACTION decision_type=architectural status=pending_revision -->

## Previous Rejection
$REJECTION_FEEDBACK
PENDING2_EOF

        WAIT_START2=$(date +%s)
        LEAD_RESPONSE2=$(AskUserQuestion "ARCHITECTURAL DECISION -- REVISION (Round 2 of 2)

Phase $PHASE [$((PHASE_IDX + 1))/$TOTAL_PHASES]: $PHASE_SLUG
Action: $NEXT_ACTION

Your previous feedback: $REJECTION_FEEDBACK

I can adjust the approach based on your feedback. Should I proceed?

Respond with:
  * approve    -- proceed (I will incorporate your feedback)
  * reject     -- halt dispatcher (HALT.md written, resume later)
  * delegate   -- auto-decide $NEXT_ACTION actions for rest of this run")

        WAIT_END2=$(date +%s)
        WAIT_TIME2=$((WAIT_END2 - WAIT_START2))
        rm -f "$PENDING_FILE"

        RESPONSE_LOWER2=$(echo "$LEAD_RESPONSE2" | tr '[:upper:]' '[:lower:]')

        if echo "$RESPONSE_LOWER2" | grep -q "^reject\|^no"; then
          # === Double rejection: HALT ===
          cat > "$PHASE_DIR/HALT.md" <<HALT_EOF
# HALT: Double Rejection on Architectural Decision

**Phase:** $PHASE ($PHASE_SLUG)
**Action:** $NEXT_ACTION
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## RESUME_MARKER
<!-- dispatcher-resume: phase=$PHASE action=$NEXT_ACTION decision_type=architectural -->

## Decision History

### Round 1
**Question:** Should I proceed with $NEXT_ACTION for Phase $PHASE?
**Response:** Rejected
**Feedback:** $REJECTION_FEEDBACK
**Wait time:** ${WAIT_TIME}s

### Round 2 (Revision)
**Question:** Revised proposal incorporating feedback
**Response:** Rejected
**Feedback:** $LEAD_RESPONSE2
**Wait time:** ${WAIT_TIME2}s

## Reason

Lead rejected the proposed approach twice. Human intervention needed before this action can proceed.

## Recovery

1. Review the decision context above
2. Edit ROADMAP.md or REQUIREMENTS.md to clarify the approach
3. Resume: /gsd:auto --resume (dispatcher reads RESUME_MARKER and re-surfaces this decision)

Or continue manually:
/gsd:execute-phase $PHASE
HALT_EOF

          node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
            --type "architectural" \
            --question "Phase $PHASE: $NEXT_ACTION" \
            --decision "Double rejection -- HALT" \
            --rationale "Lead rejected twice. Feedback: $REJECTION_FEEDBACK | $LEAD_RESPONSE2. Total wait: $((WAIT_TIME + WAIT_TIME2))s" \
            --response "rejected-twice" \
            --wait-time "$((WAIT_TIME + WAIT_TIME2))"

          echo ""
          echo "=================================================="
          echo "HALT: Double Rejection"
          echo "=================================================="
          echo "Lead rejected $NEXT_ACTION twice for Phase $PHASE."
          echo "HALT.md written to $PHASE_DIR/HALT.md"
          echo "Resume: /gsd:auto --resume"
          echo "=================================================="

          exit 1

        elif echo "$RESPONSE_LOWER2" | grep -q "^delegate\|^auto\|^skip"; then
          DELEGATED_CATEGORIES="$DELEGATED_CATEGORIES $NEXT_ACTION"
          node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
            --type "delegation" \
            --question "Lead delegated category: $NEXT_ACTION" \
            --decision "Auto-decide for rest of run" \
            --rationale "Lead delegated after revision round. Wait time: $((WAIT_TIME + WAIT_TIME2))s"
        else
          # Approved on revision
          node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
            --type "architectural" \
            --question "Phase $PHASE: $NEXT_ACTION" \
            --decision "Approved by lead (revision round)" \
            --rationale "Lead approved after revision. Feedback incorporated. Wait time: $((WAIT_TIME + WAIT_TIME2))s" \
            --response "approved-revision" \
            --wait-time "$((WAIT_TIME + WAIT_TIME2))"
        fi

      elif echo "$RESPONSE_LOWER" | grep -q "^delegate\|^auto\|^skip"; then
        # Delegate this category
        DELEGATED_CATEGORIES="$DELEGATED_CATEGORIES $NEXT_ACTION"
        node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
          --type "delegation" \
          --question "Lead delegated category: $NEXT_ACTION" \
          --decision "Auto-decide for rest of run" \
          --rationale "Lead response: $LEAD_RESPONSE. Wait time: ${WAIT_TIME}s"
      else
        # Approved (approve, yes, ok, proceed, or free-form treated as approval)
        node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
          --type "architectural" \
          --question "Phase $PHASE: $NEXT_ACTION" \
          --decision "Approved by lead" \
          --rationale "Lead response: $LEAD_RESPONSE. Wait time: ${WAIT_TIME}s" \
          --response "approved" \
          --wait-time "${WAIT_TIME}"
      fi
    fi
  else
    OPERATIONAL_COUNT=$((OPERATIONAL_COUNT + 1))
  fi
fi
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
- Orchestration: $ORCH_MODE, agent_teams.research=$AGENT_TEAMS_RESEARCH
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
    # Spawn Task to run verify-phase with agent-mode context
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

Execute /gsd:verify-phase $PHASE
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

    # Move to next phase (array index increment, not integer arithmetic)
    PHASE_IDX=$((PHASE_IDX + 1))
    PHASE_ITERATION=1
    PHASE_TOKENS_USED=0
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

**3e. Read Task result and check budget/deadlock:**

After Task returns, verify expected artifact exists:
```bash
case "$NEXT_ACTION" in
  generate-context)
    if ! ls "$PHASE_DIR"/*-CONTEXT.md >/dev/null 2>&1; then
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
    if ! ls "$PHASE_DIR"/*-VERIFICATION.md >/dev/null 2>&1; then
      echo "ERROR: Task crashed -- VERIFICATION.md not created"
      CRASH_ACTION="verify-phase"
    fi
    ;;
esac
```

**Token budget tracking:**
```bash
# Estimate tokens: 4 chars = 1 token, +10k overhead per action
TASK_CHARS=$(wc -c < "$PHASE_DIR"/*-PLAN.md 2>/dev/null | head -n1 || echo "0")
ACTION_TOKENS=$(( (TASK_CHARS / 4) + 10000 ))
PHASE_TOKENS_USED=$((PHASE_TOKENS_USED + ACTION_TOKENS))

if [ $PHASE_TOKENS_USED -gt $BUDGET_TOKENS ]; then
  echo ""
  echo "=================================================="
  echo "HALT: Token Budget Exceeded"
  echo "=================================================="
  echo ""
  echo "Phase $PHASE has exceeded token budget ($BUDGET_TOKENS tokens)"
  echo "Estimated tokens used: $PHASE_TOKENS_USED"
  echo ""

  # Write HALT.md
  cat > "$PHASE_DIR/HALT.md" <<EOF_BUDGET_HALT
# HALT: Token Budget Exceeded

**Phase:** $PHASE ($PHASE_SLUG)
**Budget:** $BUDGET_TOKENS tokens
**Used:** $PHASE_TOKENS_USED tokens (estimated)
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Reason

Phase has exceeded the token budget limit. This indicates:
1. Phase is more complex than anticipated
2. Multiple re-plan cycles consumed budget
3. Plan files are unusually large

## Budget Analysis

Token budget prevents runaway costs on complex phases. Estimation:
- 4 characters = 1 token
- 10k tokens overhead per action (context, prompts)

Estimated usage: $PHASE_TOKENS_USED tokens across $PHASE_ITERATION iteration(s)

## Investigation Steps

1. Check plan file sizes in $PHASE_DIR
2. Review verification gaps (may indicate scope creep)
3. Check iteration count (multiple re-plans indicate complexity)
4. Consider: should this phase be split into smaller phases?

## Recovery

Option 1: Increase budget in .planning/config.json:
\`\`\`json
"agent_mode_settings": {
  "budget_tokens_per_phase": 750000
}
\`\`\`

Option 2: Split phase into smaller chunks and run:
\`\`\`bash
/gsd:auto --single-phase
\`\`\`

Option 3: Continue manually with human oversight:
\`\`\`bash
/gsd:execute-phase $PHASE
\`\`\`
EOF_BUDGET_HALT

  # Log halt
  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "halt" \
    --question "Phase $PHASE token budget" \
    --decision "Halted: budget exceeded" \
    --rationale "Estimated $PHASE_TOKENS_USED tokens used (limit: $BUDGET_TOKENS)"

  exit 1
fi
```

**Stuck loop detection:**
```bash
# Check if STATE.md changed
STATE_HASH_AFTER=$(md5sum .planning/STATE.md 2>/dev/null | cut -d' ' -f1 || echo "none")

if [ "$STATE_HASH_BEFORE" = "$STATE_HASH_AFTER" ]; then
  # Guard: if expected artifact was created (no CRASH_ACTION), the action succeeded
  # despite STATE.md not being updated. Reset stuck counter instead of incrementing.
  if [ -z "$CRASH_ACTION" ]; then
    STUCK_CYCLES=0
  else
    STUCK_CYCLES=$((STUCK_CYCLES + 1))
  fi

  if [ $STUCK_CYCLES -ge 3 ]; then
    echo ""
    echo "=================================================="
    echo "HALT: Deadlock Detected"
    echo "=================================================="
    echo ""
    echo "STATE.md unchanged for $STUCK_CYCLES consecutive cycles."
    echo "Phase $PHASE appears stuck in a loop."
    echo ""

    # Write HALT.md
    cat > "$PHASE_DIR/HALT.md" <<EOF_DEADLOCK_HALT
# HALT: Deadlock Detected

**Phase:** $PHASE ($PHASE_SLUG)
**Stuck cycles:** $STUCK_CYCLES
**Last action:** $NEXT_ACTION
**Halted:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Reason

STATE.md has not changed for $STUCK_CYCLES consecutive actions. This indicates:
1. Tasks are running but not producing expected state changes
2. Artifact detection logic may be broken
3. Phase structure may be malformed
4. Tasks may be failing silently

## Deadlock Analysis

Expected behavior: Each action should update STATE.md with progress.
Observed: STATE.md hash unchanged across multiple cycles.

Last action attempted: $NEXT_ACTION
Phase iteration: $PHASE_ITERATION

## Investigation Steps

1. Check AUTO-DISPATCH-LOG.md for action results
2. Verify artifacts exist in $PHASE_DIR
3. Check STATE.md manually -- is it being updated?
4. Review phase structure in ROADMAP.md
5. Check for silent Task failures

## Recovery

Option 1: Fix state update logic and resume:
\`\`\`bash
/gsd:auto --single-phase
\`\`\`

Option 2: Manually advance phase in STATE.md and continue:
\`\`\`bash
# Edit STATE.md to set the Phase field to the next phase number
/gsd:auto
\`\`\`

Option 3: Investigate with manual control:
\`\`\`bash
/gsd:plan-phase $PHASE
/gsd:execute-phase $PHASE
\`\`\`
EOF_DEADLOCK_HALT

    # Log halt
    node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
      --type "halt" \
      --question "Phase $PHASE deadlock" \
      --decision "Halted: stuck loop detected" \
      --rationale "STATE.md unchanged for $STUCK_CYCLES cycles (last action: $NEXT_ACTION)"

    exit 1
  fi
else
  # State changed -- reset stuck counter
  STUCK_CYCLES=0
fi
```

**3f. Handle Task crash:**

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

**3g. Update state after success:**

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

**3h. Loop:**

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

if [ $PHASE_IDX -ge ${#PHASES[@]} ]; then
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
if [ $PHASE_IDX -ge ${#PHASES[@]} ]; then
  # Update STATE.md status to milestone complete
  # (This is typically done by the verify-work or execute-phase Task, but we log it here)

  node C:/Users/tomas/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type "dispatch" \
    --question "Milestone status" \
    --decision "Milestone $MILESTONE complete" \
    --rationale "All $TOTAL_PHASES phases completed successfully"
fi
```

**Lead-approval completion summary:**
```bash
if [ "$AUTONOMY_LEVEL" = "lead-approval" ]; then
  echo ""
  echo "=================================================="
  echo "LEAD-APPROVAL SUMMARY"
  echo "=================================================="
  echo ""
  echo "Decisions made:"
  echo "  * Operational (auto-decided): $OPERATIONAL_COUNT"
  echo "  * Architectural (routed to lead): $ARCHITECTURAL_COUNT"
  if [ -n "$DELEGATED_CATEGORIES" ]; then
    echo "  * Delegated categories:$DELEGATED_CATEGORIES"
  fi
  echo ""
  echo "[See .planning/AUTO-DISPATCH-LOG.md for full audit trail]"
  echo "=================================================="
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

## Opus 1M Optimization

**Model preference:** Opus 1M (claude-opus-4) is the preferred model for auto-dispatch sessions.

**Context capacity comparison:**
- Opus 1M: 1,000,000 tokens / 4k per cycle = 250 cycles
- Sonnet 200k: 200,000 tokens / 4k per cycle = 50 cycles

**Implications:**
- Opus 1M: Handles 60+ phase milestones without degradation
- Sonnet: Sufficient for milestones up to 12 phases
- Graceful degradation: Dispatcher works on Sonnet for smaller milestones

**Why Opus 1M matters:**
1. No context degradation across long milestone runs
2. Full conversation history preserved for debugging
3. Allows complex multi-iteration phases without rollover
4. AUTO-DISPATCH-LOG.md accumulates without concern

**When Opus unavailable:** Dispatcher falls back to Sonnet gracefully. For large milestones (12+ phases), split into multiple /gsd:auto runs with --max-phases flag.

**Usage note:** Model selection happens at Claude Code UI level. This preference is documented for users running long autonomous sessions.

</context_budget>

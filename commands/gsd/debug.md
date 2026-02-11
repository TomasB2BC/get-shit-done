---
name: gsd:debug
description: Systematic debugging with persistent state across context resets
argument-hint: [issue description]
allowed-tools:
  - Read
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Debug issues using scientific method with subagent isolation.

**Orchestrator role:** Gather symptoms, spawn gsd-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.
</objective>

<context>
User's issue: $ARGUMENTS

Check for active sessions:
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>

## 0. Resolve Model Profile

```bash
DEBUGGER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-debugger --raw)
```

**Detect agent mode:**

```bash
AGENT_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"agent_mode"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

## 1. Check Active Sessions

**If AGENT_MODE=true AND active sessions exist AND no $ARGUMENTS:**

Auto-select most recent active session:

```bash
ACTIVE_SESSIONS=$(ls .planning/debug/*.md 2>/dev/null | grep -v resolved)
if [ -n "$ACTIVE_SESSIONS" ] && [ -z "$ARGUMENTS" ]; then
  # Select most recent session (last modified)
  LATEST_SESSION=$(ls -t .planning/debug/*.md 2>/dev/null | grep -v resolved | head -1)
  ISSUE_SLUG=$(basename "$LATEST_SESSION" .md)

  # Log auto-selection
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Select debug session to resume" \
    --decision "$ISSUE_SLUG" \
    --rationale "Most recent active session (auto-selected in agent mode)"

  # Continue with selected session
fi
```

**If AGENT_MODE=false (classic):**

If active sessions exist AND no $ARGUMENTS:
- List sessions with status, hypothesis, next action
- User picks number to resume OR describes new issue

If $ARGUMENTS provided OR user describes new issue:
- Continue to symptom gathering

## 2. Gather Symptoms (if new issue)

**If AGENT_MODE=true:**

Auto-gather symptoms from project state:

```bash
# Step 1: Read STATE.md blockers/concerns
BLOCKERS=""
if [ -f .planning/STATE.md ]; then
  BLOCKERS=$(sed -n '/^### Blockers\/Concerns/,/^##/p' .planning/STATE.md)
fi

# Step 2: Search for error patterns
ERROR_LOGS=$(grep -r "error\|Error\|ERROR" . --include="*.log" --include="*.txt" 2>/dev/null | head -20 || echo "")

# Step 3: Check recent git log for fix/wip commits
RECENT_FIXES=$(git log --oneline -10 | grep -i "fix\|wip\|bug" 2>/dev/null || echo "")

# Step 4: Check for HALT.md files
HALT_FILES=$(find .planning -name "HALT.md" 2>/dev/null)

# Step 5: Use $ARGUMENTS as primary symptom if provided
PRIMARY_SYMPTOM="$ARGUMENTS"

# Synthesize symptoms
if [ -n "$PRIMARY_SYMPTOM" ] || [ -n "$BLOCKERS" ] || [ -n "$ERROR_LOGS" ] || [ -n "$RECENT_FIXES" ] || [ -n "$HALT_FILES" ]; then
  # Compose 5 symptom answers based on available context
  EXPECTED="Based on project goals and requirements"
  ACTUAL="$PRIMARY_SYMPTOM"
  ERRORS="From logs: ${ERROR_LOGS:-none}"
  TIMELINE="Recent commits suggest: ${RECENT_FIXES:-unknown}"
  REPRODUCTION="$PRIMARY_SYMPTOM"

  # Log decision
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Debug symptoms gathered" \
    --decision "Expected: $EXPECTED | Actual: $ACTUAL | Errors: $ERRORS | Timeline: $TIMELINE | Reproduction: $REPRODUCTION" \
    --rationale "Synthesized from STATE.md, error logs, git history, HALT files, and arguments"
else
  # Insufficient info for auto-debugging
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Auto-debug symptoms" \
    --decision "SKIPPED" \
    --rationale "Insufficient context in project state for automated symptom gathering"

  # Write HALT.md
  mkdir -p .planning/debug
  cat > .planning/debug/HALT.md <<'EOF'
---
status: blocked
reason: insufficient_context
---

# Debug Halted

Agent mode cannot auto-gather debug symptoms. Insufficient context in:
- STATE.md blockers/concerns
- Error logs
- Git history
- HALT files
- Command arguments

**Required:** Run /gsd:debug with explicit issue description, or switch to classic mode for interactive symptom gathering.
EOF
  exit 1
fi
```

**If AGENT_MODE=false (classic):**

Use AskUserQuestion for each:

1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors? (paste or describe)
4. **Timeline** - When did this start? Ever worked?
5. **Reproduction** - How do you trigger it?

After all gathered, confirm ready to investigate.

## 3. Spawn gsd-debugger Agent

### Detect Hybrid Mode

Use canonical compound detection pattern:

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check
  AGENT_TEAMS_DEBUG=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"debug"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_DEBUG" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "[!] WARNING: orchestration=hybrid but Agent Teams not available or debug not enabled"
  echo "[!] Falling back to classic mode"
fi
```

### Branch: Hybrid Mode (Agent Team)

If `USE_HYBRID=true`, run competing-hypotheses protocol with 3 investigator teammates:

**H1. Create Agent Team**

```bash
TEAM_NAME="debug-${slug}"
TeamCreate(team_name="${TEAM_NAME}", description="Debug investigation team for ${slug}")
```

If TeamCreate fails, set `FALLBACK_TO_CLASSIC=true` and skip to classic branch.

**H2. Create Canonical Debug File**

```bash
mkdir -p .planning/debug
cat > .planning/debug/${slug}.md <<'EOF'
---
status: investigating
issue: {slug}
created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
---

# Debug Investigation: {slug}

## Current Focus

Spawning 3-investigator team for parallel hypothesis testing.

## Symptoms

**Expected:** {expected}
**Actual:** {actual}
**Errors:** {errors}
**Reproduction:** {reproduction}
**Timeline:** {timeline}

## Eliminated

(Investigators will update)

## Evidence

(Investigators will update)

## Resolution

(Pending investigation)
EOF
```

**H3. Spawn 3 Investigator Teammates**

Each investigator gets technique-specific guidance to avoid anchoring:

```markdown
# Investigator 1 prompt (Binary Search)
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

<objective>
Investigate issue: {slug}

**Your role:** Investigator 1 of 3 (Binary Search technique)
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
teammate
team_name: ${TEAM_NAME}
investigator_number: 1
symptoms_prefilled: true
goal: find_root_cause_only
technique: binary_search
</mode>

<technique_guidance>
Use binary search debugging: isolate the problem space by testing midpoints.
1. Identify the working/broken boundary
2. Test intermediate states to narrow the range
3. Repeat until you pinpoint the exact failure point
</technique_guidance>

<hypothesis_file>
Write your hypothesis to: .planning/debug/${slug}-investigator-1.md

Format:
---
investigator: 1
technique: binary_search
status: investigating
---

## Hypothesis

[Your hypothesis about root cause]

## Evidence

[Facts supporting hypothesis]

## Tests

[Tests performed]

## Confidence

[low/medium/high]
</hypothesis_file>
```

```
Task(
  prompt=investigator_1_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  team_name="${TEAM_NAME}",
  name="investigator-1",
  description="Investigator 1: Binary Search"
)
```

```markdown
# Investigator 2 prompt (Working Backwards)
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

<objective>
Investigate issue: {slug}

**Your role:** Investigator 2 of 3 (Working Backwards technique)
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
teammate
team_name: ${TEAM_NAME}
investigator_number: 2
symptoms_prefilled: true
goal: find_root_cause_only
technique: working_backwards
</mode>

<technique_guidance>
Work backwards from the symptom to the cause:
1. Start with the observable failure
2. Trace back through the call stack/data flow
3. Ask "what could cause this?" at each step
4. Follow the chain until you reach the root
</technique_guidance>

<hypothesis_file>
Write your hypothesis to: .planning/debug/${slug}-investigator-2.md

Format:
---
investigator: 2
technique: working_backwards
status: investigating
---

## Hypothesis

[Your hypothesis about root cause]

## Evidence

[Facts supporting hypothesis]

## Tests

[Tests performed]

## Confidence

[low/medium/high]
</hypothesis_file>
```

```
Task(
  prompt=investigator_2_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  team_name="${TEAM_NAME}",
  name="investigator-2",
  description="Investigator 2: Working Backwards"
)
```

```markdown
# Investigator 3 prompt (Differential Debugging)
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

<objective>
Investigate issue: {slug}

**Your role:** Investigator 3 of 3 (Differential Debugging technique)
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
teammate
team_name: ${TEAM_NAME}
investigator_number: 3
symptoms_prefilled: true
goal: find_root_cause_only
technique: differential_debugging
</mode>

<technique_guidance>
Use differential debugging: compare working vs broken states:
1. Find a minimal difference between working and broken
2. Identify what changed (code, data, environment)
3. Test if reverting the change fixes the issue
4. Isolate the specific change causing the problem
</technique_guidance>

<hypothesis_file>
Write your hypothesis to: .planning/debug/${slug}-investigator-3.md

Format:
---
investigator: 3
technique: differential_debugging
status: investigating
---

## Hypothesis

[Your hypothesis about root cause]

## Evidence

[Facts supporting hypothesis]

## Tests

[Tests performed]

## Confidence

[low/medium/high]
</hypothesis_file>
```

```
Task(
  prompt=investigator_3_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  team_name="${TEAM_NAME}",
  name="investigator-3",
  description="Investigator 3: Differential Debugging"
)
```

If 0-1 investigators succeed, set `FALLBACK_TO_CLASSIC=true`, call TeamDelete if team was created, skip to classic branch.

**H4. Round 1 Wait**

Wait for all 3 investigators to report idle:

```
Wait for 3 idle notifications
```

After idle, verify hypothesis files exist:

```bash
ls .planning/debug/${slug}-investigator-{1,2,3}.md 2>/dev/null | wc -l
```

If fewer than 2 files exist, set `FALLBACK_TO_CLASSIC=true`, call TeamDelete, skip to classic branch.

Check if any investigator messaged with CHECKPOINT:

```bash
# Check last message from each investigator
# If any starts with "## CHECKPOINT", return CHECKPOINT REACHED to Step 4
```

**H5. Round 2 Challenge**

Send peer-to-peer challenge instructions to each investigator:

```markdown
# Message to investigator-1
Round 2: Challenge other hypotheses.

Your peers' findings are in:
- .planning/debug/${slug}-investigator-2.md (working backwards)
- .planning/debug/${slug}-investigator-3.md (differential)

TASK: Send CHALLENGE messages to investigators 2 and 3:

1. Read their hypothesis files
2. Identify weaknesses, missing tests, or alternative explanations
3. Use SendMessage(type="message", recipient="investigator-2", content="CHALLENGE: ...") to send your critique to investigator 2
4. Use SendMessage(type="message", recipient="investigator-3", content="CHALLENGE: ...") to send your critique to investigator 3
5. Wait for incoming challenges from them
6. Update your hypothesis file with responses to their challenges
7. Report final confidence level (low/medium/high)

DO NOT update other investigators' files. Use SendMessage for peer-to-peer communication.
```

```
SendMessage(
  type="message",
  recipient="investigator-1",
  content=round2_message_inv1
)
```

```markdown
# Message to investigator-2
Round 2: Challenge other hypotheses.

Your peers' findings are in:
- .planning/debug/${slug}-investigator-1.md (binary search)
- .planning/debug/${slug}-investigator-3.md (differential)

TASK: Send CHALLENGE messages to investigators 1 and 3:

1. Read their hypothesis files
2. Identify weaknesses, missing tests, or alternative explanations
3. Use SendMessage(type="message", recipient="investigator-1", content="CHALLENGE: ...") to send your critique to investigator 1
4. Use SendMessage(type="message", recipient="investigator-3", content="CHALLENGE: ...") to send your critique to investigator 3
5. Wait for incoming challenges from them
6. Update your hypothesis file with responses to their challenges
7. Report final confidence level (low/medium/high)

DO NOT update other investigators' files. Use SendMessage for peer-to-peer communication.
```

```
SendMessage(
  type="message",
  recipient="investigator-2",
  content=round2_message_inv2
)
```

```markdown
# Message to investigator-3
Round 2: Challenge other hypotheses.

Your peers' findings are in:
- .planning/debug/${slug}-investigator-1.md (binary search)
- .planning/debug/${slug}-investigator-2.md (working backwards)

TASK: Send CHALLENGE messages to investigators 1 and 2:

1. Read their hypothesis files
2. Identify weaknesses, missing tests, or alternative explanations
3. Use SendMessage(type="message", recipient="investigator-1", content="CHALLENGE: ...") to send your critique to investigator 1
4. Use SendMessage(type="message", recipient="investigator-2", content="CHALLENGE: ...") to send your critique to investigator 2
5. Wait for incoming challenges from them
6. Update your hypothesis file with responses to their challenges
7. Report final confidence level (low/medium/high)

DO NOT update other investigators' files. Use SendMessage for peer-to-peer communication.
```

```
SendMessage(
  type="message",
  recipient="investigator-3",
  content=round2_message_inv3
)
```

**H6. Round 2 Wait**

Wait for all 3 investigators to finish challenging and report idle:

```
Wait for 3 idle notifications
```

**H7. Lead Convergence and Synthesis**

Team lead (this orchestrator) reads all 3 hypothesis files and synthesizes findings:

```bash
# Read hypothesis files
cat .planning/debug/${slug}-investigator-1.md
cat .planning/debug/${slug}-investigator-2.md
cat .planning/debug/${slug}-investigator-3.md
```

Convergence logic:

1. **If all 3 agree on same root cause with high confidence:** ROOT CAUSE FOUND
2. **If 2+ agree on same root cause:** ROOT CAUSE FOUND (with note about dissent)
3. **If all 3 have different hypotheses but collectively eliminated key possibilities:** Update Eliminated section, continue investigation (INVESTIGATION INCONCLUSIVE)
4. **If any investigator needs checkpoint:** CHECKPOINT REACHED

Synthesize into canonical debug file:

```bash
# Update .planning/debug/${slug}.md with:
# - Status: root_cause_found | inconclusive | checkpoint_needed
# - Eliminated: [combined eliminations from all 3]
# - Evidence: [combined evidence supporting conclusion]
# - Resolution: [synthesis of agreed-upon root cause OR summary of disagreement]
```

**H8. Cleanup Hypothesis Files**

Delete temporary hypothesis files:

```bash
rm .planning/debug/${slug}-investigator-1.md
rm .planning/debug/${slug}-investigator-2.md
rm .planning/debug/${slug}-investigator-3.md
```

**H9. Shutdown Investigators**

Send shutdown requests to all 3:

```bash
SendMessage(type="shutdown_request", recipient="investigator-1", content="Investigation complete. Thank you.")
SendMessage(type="shutdown_request", recipient="investigator-2", content="Investigation complete. Thank you.")
SendMessage(type="shutdown_request", recipient="investigator-3", content="Investigation complete. Thank you.")
```

**H10. Delete Team**

```bash
TeamDelete(team_name="${TEAM_NAME}")
```

**H11. Return Results**

Return to Step 4 with structured format matching classic mode:

- If root cause found: `## ROOT CAUSE FOUND` (includes evidence summary)
- If checkpoint needed: `## CHECKPOINT REACHED` (includes checkpoint details)
- If inconclusive: `## INVESTIGATION INCONCLUSIVE` (includes eliminated possibilities)

### Branch: Classic Mode (Single Debugger)

If `USE_HYBRID=false` OR `FALLBACK_TO_CLASSIC=true`, use single-agent investigation:

Fill prompt and spawn:

```markdown
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

<objective>
Investigate issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: true
goal: find_and_fix
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Debug {slug}"
)
```

## 4. Handle Agent Return

**If `## ROOT CAUSE FOUND`:**

**If AGENT_MODE=true:**

Auto-decide next action (default: Fix now):

```bash
DECISION=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Root cause found. Fix now or plan fix?" --options '["Fix now","Plan fix"]' --raw)

if [ "$DECISION" = "Fix now" ]; then
  # Spawn fix subagent
  # [existing fix agent spawn logic]
else
  # Log plan suggestion
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Next action after root cause found" \
    --decision "Plan fix using /gsd:plan-phase --gaps" \
    --rationale "Auto-decided to plan rather than immediate fix"
fi
```

**If AGENT_MODE=false (classic):**

Display root cause and evidence summary. Offer options:
- "Fix now" - spawn fix subagent
- "Plan fix" - suggest /gsd:plan-phase --gaps
- "Manual fix" - done

---

**If `## CHECKPOINT REACHED`:**

**If AGENT_MODE=true:**

Auto-handle checkpoint by type:

```bash
# Read checkpoint type from agent return
CHECKPOINT_TYPE=$(grep "^**Type:**" debug_output.md | sed 's/.*Type:\*\* //')

case "$CHECKPOINT_TYPE" in
  human-verify)
    # Auto-approve verification checkpoint
    node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type approval --question "Checkpoint: human-verify" --options '["Approved"]' --raw
    # Spawn continuation agent with approval
    ;;
  decision)
    # Use auto-decide with checkpoint options
    CHECKPOINT_OPTIONS=$(grep "^**Options:**" debug_output.md | sed 's/.*Options:\*\* //')
    DECISION=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Checkpoint decision" --options "$CHECKPOINT_OPTIONS" --raw)
    # Spawn continuation agent with decision
    ;;
  human-action)
    # HALT - cannot proceed without human
    mkdir -p .planning/debug
    cat > .planning/debug/HALT.md <<'EOF'
---
status: blocked
reason: human_action_required
checkpoint_type: human-action
---

# Debug Halted: Human Action Required

Agent mode cannot complete human-only actions (email verification, 2FA codes, physical device access, etc.).

**Checkpoint Details:**
[Details from agent return]

**Required Action:**
[Action from agent return]

**After Action:**
Run: [Verification command from agent return]

Then resume with: /gsd:debug [issue-slug]
EOF
    exit 1
    ;;
esac
```

**If AGENT_MODE=false (classic):**

Present checkpoint details to user. Get user response. Spawn continuation agent (see step 5).

---

**If `## INVESTIGATION INCONCLUSIVE`:**

**If AGENT_MODE=true:**

Auto-decide to continue or add context (default: Continue):

```bash
DECISION=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Investigation inconclusive. Continue or add context?" --options '["Continue investigating","Add more context"]' --raw)

if [ "$DECISION" = "Continue investigating" ]; then
  # Spawn new agent with additional context
  # [existing continuation logic]
else
  # Log need for more context and halt
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Investigation inconclusive outcome" \
    --decision "Need more context" \
    --rationale "Automated investigation exhausted available context"
  exit 1
fi
```

**If AGENT_MODE=false (classic):**

Show what was checked and eliminated. Offer options:
- "Continue investigating" - spawn new agent with additional context
- "Manual investigation" - done
- "Add more context" - gather more symptoms, spawn again

## 5. Spawn Continuation Agent (After Checkpoint)

When user responds to checkpoint (or agent-mode auto-handles), spawn fresh agent:

```markdown
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @.planning/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
```

```
Task(
  prompt=continuation_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Continue debug {slug}"
)
```

</process>

<success_criteria>
- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] gsd-debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing
</success_criteria>

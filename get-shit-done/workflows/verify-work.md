<purpose>
Validate built features through conversational testing with persistent state. Creates UAT.md that tracks test progress, survives /clear, and feeds gaps into /gsd:plan-phase --gaps.

User tests, Claude records. One test at a time. Plain text responses.
</purpose>

<tool_rule>
CRITICAL: After EVERY AskUserQuestion call, STOP your response immediately.
Do NOT generate any follow-up text, analysis, or actions in the same response.
The AskUserQuestion tool call must be the LAST thing in your response.
Wait for the user's selection before generating your next response.
This prevents the tool from auto-resolving before the user sees it.
</tool_rule>

<philosophy>
**Show expected, ask if reality matches.**

Claude presents what SHOULD happen. User confirms or describes what's different.
- "yes" / "y" / "next" / empty → pass
- Anything else → logged as issue, severity inferred

No Pass/Fail buttons. No severity questions. Just: "Here's what should happen. Does it?"
</philosophy>

<template>
@~/.claude/get-shit-done/templates/UAT.md
</template>

<process>


## 0. Project Resolution

```bash
PROJECT_ALIAS=""
if echo "$ARGUMENTS" | grep -q '\-\-project'; then
  PROJECT_ALIAS=$(echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--project[[:space:]]\+[[:graph:]]\+//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
fi

if [ -n "$PROJECT_ALIAS" ]; then
  PROJECT_DIR=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS" --raw)
  if [ -z "$PROJECT_DIR" ]; then
    echo "[X] ERROR: Project alias '$PROJECT_ALIAS' not found"
    node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS"
    # Stop execution
  fi
  PROJECT_ROOT=$(dirname "$PROJECT_DIR")
  cd "$PROJECT_ROOT"
  echo ">> Resolved --project $PROJECT_ALIAS -> $PROJECT_ROOT"
fi
```

<step name="resolve_model_profile" priority="first">
```bash
PLANNER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-planner --raw)
CHECKER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-plan-checker --raw)
```

**Detect agent mode:**

```bash
# Agent mode only activates during /gsd:auto sessions (runtime marker)
AGENT_MODE=$( [ -f .planning/.auto-dispatch-active ] && echo "true" || echo "false")

# IMPORTANT: When AGENT_MODE=true, do NOT call `gsd-tools.js auto-decide`.
# Instead, YOU (Claude) decide what is best by reading project context
# (ROADMAP.md, REQUIREMENTS.md, STATE.md, relevant plans), reasoning about
# the tradeoffs, and logging your decision via:
#   node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
#     --type freeform --question "<question>" \
#     --decision "<your choice>" --rationale "<why>"
```
</step>

<step name="check_active_session">
**First: Check for active UAT sessions**

```bash
find .planning/phases -name "*-UAT.md" -type f 2>/dev/null | head -5
```

**If AGENT_MODE=true AND active sessions exist AND no $ARGUMENTS:**

Auto-select session with most pending tests:

```bash
ACTIVE_SESSIONS=$(find .planning/phases -name "*-UAT.md" -type f 2>/dev/null)
if [ -n "$ACTIVE_SESSIONS" ] && [ -z "$ARGUMENTS" ]; then
  # Count pending tests per session
  MAX_PENDING=0
  SELECTED_SESSION=""
  for session in $ACTIVE_SESSIONS; do
    PENDING=$(grep -c "result: \[pending\]" "$session" 2>/dev/null || echo "0")
    if [ "$PENDING" -gt "$MAX_PENDING" ]; then
      MAX_PENDING=$PENDING
      SELECTED_SESSION="$session"
    fi
  done

  # Log auto-selection
  PHASE=$(basename "$SELECTED_SESSION" | sed 's/-UAT.md//')
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Select UAT session to resume" \
    --decision "$PHASE ($MAX_PENDING pending tests)" \
    --rationale "Session with most pending tests (auto-selected in agent mode)"

  # Load that file, go to resume_from_file
fi
```

**If AGENT_MODE=false (classic) AND active sessions exist AND no $ARGUMENTS provided:**

Read each file's frontmatter (status, phase) and Current Test section.

Display inline:

```
## Active UAT Sessions

| # | Phase | Status | Current Test | Progress |
|---|-------|--------|--------------|----------|
| 1 | 04-comments | testing | 3. Reply to Comment | 2/6 |
| 2 | 05-auth | testing | 1. Login Form | 0/4 |

Reply with a number to resume, or provide a phase number to start new.
```

Wait for user response.

- If user replies with number (1, 2) → Load that file, go to `resume_from_file`
- If user replies with phase number → Treat as new session, go to `create_uat_file`

**If active sessions exist AND $ARGUMENTS provided:**

Check if session exists for that phase. If yes, offer to resume or restart.
If no, continue to `create_uat_file`.

**If no active sessions AND no $ARGUMENTS:**

```
No active UAT sessions.

Provide a phase number to start testing (e.g., /gsd:verify-work 4)
```

**If no active sessions AND $ARGUMENTS provided:**

Continue to `create_uat_file`.
</step>

<step name="find_summaries">
**Find what to test:**

Parse $ARGUMENTS as phase number (e.g., "4") or plan number (e.g., "04-02").

```bash
PHASE_DIR=$(node ~/.claude/get-shit-done/bin/gsd-tools.js find-phase "${PHASE_ARG}" --raw)

# Find SUMMARY files
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
```

Read each SUMMARY.md to extract testable deliverables.
</step>

<step name="extract_tests">
**Extract testable deliverables from SUMMARY.md:**

Parse for:
1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions

Focus on USER-OBSERVABLE outcomes, not implementation details.

For each deliverable, create a test:
- name: Brief test name
- expected: What the user should see/experience (specific, observable)

Examples:
- Accomplishment: "Added comment threading with infinite nesting"
  → Test: "Reply to a Comment"
  → Expected: "Clicking Reply opens inline composer below comment. Submitting shows reply nested under parent with visual indentation."

Skip internal/non-observable items (refactors, type changes, etc.).
</step>

<step name="create_uat_file">
**Create UAT file with all tests:**

```bash
mkdir -p "$PHASE_DIR"
```

Build test list from extracted deliverables.

Create file:

```markdown
---
status: testing
phase: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [first test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: [pending]

...

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[none yet]
```

Write to `.planning/phases/XX-name/{phase}-UAT.md`

Proceed to `present_test`.
</step>

<step name="present_test">
**If AGENT_MODE=true:**

Auto-assess current test programmatically:

```bash
# Read test from UAT file
TEST_NUMBER=$(sed -n '/^## Current Test/,/^## /p' "$UAT_FILE" | grep "^number:" | cut -d: -f2 | tr -d ' ')
TEST_NAME=$(sed -n '/^## Current Test/,/^## /p' "$UAT_FILE" | grep "^name:" | cut -d: -f2-)
TEST_EXPECTED=$(sed -n '/^## Current Test/,/^## /p' "$UAT_FILE" | sed -n '/^expected:/,/^awaiting:/p' | grep -v "^expected:" | grep -v "^awaiting:")

# Determine if test is programmatically verifiable
IS_VERIFIABLE=false
VERIFICATION_RESULT=""
VERIFICATION_EVIDENCE=""

# Check if test involves API, file existence, grep-checkable output
if echo "$TEST_EXPECTED" | grep -qi "API returns\|file exists\|endpoint\|status code\|log contains\|database\|query"; then
  IS_VERIFIABLE=true

  # Run automated check based on test type
  # Example checks (orchestrator implements specific logic):
  # - API test: curl and check status/response
  # - File test: check file existence
  # - Log test: grep log files
  # - Database test: query and verify

  # If check passes definitively:
  VERIFICATION_RESULT="PASS"
  VERIFICATION_EVIDENCE="[Evidence from automated check]"

  # If check fails definitively:
  # VERIFICATION_RESULT="FAIL"
  # VERIFICATION_EVIDENCE="[Failure evidence]"
fi

# Check if test requires human judgment
if echo "$TEST_EXPECTED" | grep -qi "visual\|UI\|user experience\|UX\|interactive\|click\|navigate\|appearance\|layout\|design"; then
  IS_VERIFIABLE=false
fi

# Process result
if [ "$IS_VERIFIABLE" = "true" ] && [ "$VERIFICATION_RESULT" = "PASS" ]; then
  # Update test as PASS with evidence
  # Update UAT.md Tests section
  # Log decision
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Test $TEST_NUMBER: $TEST_NAME" \
    --decision "PASS" \
    --rationale "Automated check confirmed: $VERIFICATION_EVIDENCE"

elif [ "$IS_VERIFIABLE" = "true" ] && [ "$VERIFICATION_RESULT" = "FAIL" ]; then
  # Update test as FAIL with evidence
  # Update UAT.md Tests section and Gaps
  # Log decision
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Test $TEST_NUMBER: $TEST_NAME" \
    --decision "FAIL" \
    --rationale "Automated check failed: $VERIFICATION_EVIDENCE"

else
  # Mark as SKIPPED - requires human assessment
  # Update UAT.md Tests section
  # Log decision
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Test $TEST_NUMBER: $TEST_NAME" \
    --decision "SKIPPED" \
    --rationale "Requires human assessment (visual/UX/interactive test)"
fi

# Update UAT.md and continue to next test
```

**Conservative principle:** Only PASS when check definitively confirms. Ambiguous cases mark as SKIPPED for human review.

**If AGENT_MODE=false (classic):**

Present current test to user.

Read Current Test section from UAT file.

Display using checkpoint box format:

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

**Test {number}: {name}**

{expected}

──────────────────────────────────────────────────────────────
→ Type "pass" or describe what's wrong
──────────────────────────────────────────────────────────────
```

Wait for user response (plain text, no AskUserQuestion).
</step>

<step name="process_response">
**Process user response and update file:**

**If response indicates pass:**
- Empty response, "yes", "y", "ok", "pass", "next", "approved", "✓"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: pass
```

**If response indicates skip:**
- "skip", "can't test", "n/a"

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: skipped
reason: [user's reason if provided]
```

**If response is anything else:**
- Treat as issue description

Infer severity from description:
- Contains: crash, error, exception, fails, broken, unusable → blocker
- Contains: doesn't work, wrong, missing, can't → major
- Contains: slow, weird, off, minor, small → minor
- Contains: color, font, spacing, alignment, visual → cosmetic
- Default if unclear: major

Update Tests section:
```
### {N}. {name}
expected: {expected}
result: issue
reported: "{verbatim user response}"
severity: {inferred}
```

Append to Gaps section (structured YAML for plan-phase --gaps):
```yaml
- truth: "{expected behavior from test}"
  status: failed
  reason: "User reported: {verbatim user response}"
  severity: {inferred}
  test: {N}
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
```

**After any response:**

Update Summary counts.
Update frontmatter.updated timestamp.

If more tests remain → Update Current Test, go to `present_test`
If no more tests → Go to `complete_session`
</step>

<step name="resume_from_file">
**Resume testing from UAT file:**

Read the full UAT file.

Find first test with `result: [pending]`.

Announce:
```
Resuming: Phase {phase} UAT
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

Update Current Test section with the pending test.
Proceed to `present_test`.
</step>

<step name="complete_session">
**Complete testing and commit:**

Update frontmatter:
- status: complete
- updated: [now]

Clear Current Test section:
```
## Current Test

[testing complete]
```

Commit the UAT file:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "test({phase}): complete UAT - {passed} passed, {issues} issues" --files ".planning/phases/XX-name/{phase}-UAT.md"
```

Present summary:
```
## UAT Complete: Phase {phase}

| Result | Count |
|--------|-------|
| Passed | {N}   |
| Issues | {N}   |
| Skipped| {N}   |

[If issues > 0:]
### Issues Found

[List from Issues section]
```

**If issues > 0:** Proceed to `diagnose_issues`

**If issues == 0:**
```
All tests passed. Ready to continue.

- `/gsd:plan-phase {next}` — Plan next phase
- `/gsd:execute-phase {next}` — Execute next phase
```
</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

```
---

{N} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @~/.claude/get-shit-done/workflows/diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Update UAT.md with root causes
- Proceed to `plan_gap_closure`

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously, so overhead is minimal and fixes are more accurate.
</step>

<step name="plan_gap_closure">
**Auto-plan fixes from diagnosed gaps:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner for gap closure...
```

Spawn gsd-planner in --gaps mode:

```
Task(
  prompt="""
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- YOU decide what is best based on project context (requirements, roadmap, codebase state)
- Read the relevant files, reason about tradeoffs, then log your decision:
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question "<the question>" --decision "<your decision>" --rationale "<why this is best>"
</auto_mode>

<planning_context>

**Phase:** {phase_number}
**Mode:** gap_closure

**UAT with diagnoses:**
@.planning/phases/{phase_dir}/{phase}-UAT.md

**Project State:**
@.planning/STATE.md

**Roadmap:**
@.planning/ROADMAP.md

</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase
Plans must be executable prompts.
</downstream_consumer>
""",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Plan gap fixes for Phase {phase}"
)
```

On return:
- **PLANNING COMPLETE:** Proceed to `verify_gap_plans`
- **PLANNING INCONCLUSIVE:** Report and offer manual intervention
</step>

<step name="verify_gap_plans">
**Verify fix plans with checker:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING FIX PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

Initialize: `iteration_count = 1`

Spawn gsd-plan-checker:

```
Task(
  prompt="""
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- YOU decide what is best based on project context (requirements, roadmap, codebase state)
- Read the relevant files, reason about tradeoffs, then log your decision:
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question "<the question>" --decision "<your decision>" --rationale "<why this is best>"
</auto_mode>

<verification_context>

**Phase:** {phase_number}
**Phase Goal:** Close diagnosed gaps from UAT

**Plans to verify:**
@.planning/phases/{phase_dir}/*-PLAN.md

</verification_context>

<expected_output>
Return one of:
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
""",
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} fix plans"
)
```

On return:
- **VERIFICATION PASSED:** Proceed to `present_ready`
- **ISSUES FOUND:** Proceed to `revision_loop`
</step>

<step name="revision_loop">
**Iterate planner ↔ checker until plans pass (max 3):**

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

Spawn gsd-planner with revision context:

```
Task(
  prompt="""
{IF AGENT_MODE=true, prepend:}
<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- YOU decide what is best based on project context (requirements, roadmap, codebase state)
- Read the relevant files, reason about tradeoffs, then log your decision:
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question "<the question>" --decision "<your decision>" --rationale "<why this is best>"
</auto_mode>

<revision_context>

**Phase:** {phase_number}
**Mode:** revision

**Existing plans:**
@.planning/phases/{phase_dir}/*-PLAN.md

**Checker issues:**
{structured_issues_from_checker}

</revision_context>

<instructions>
Read existing PLAN.md files. Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
</instructions>
""",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns → spawn checker again (verify_gap_plans logic)
Increment iteration_count

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain.`

**If AGENT_MODE=true:**

Auto-decide action (default: Force proceed):

```bash
DECISION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Max revision iterations reached. Force proceed or abandon?" --options '["Force proceed","Abandon"]' --raw)

if [ "$DECISION" = "Force proceed" ]; then
  # Log and continue to present_ready
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Revision loop max iterations" \
    --decision "Force proceed with $N unresolved issues" \
    --rationale "Auto-decided to proceed (max iterations reached)"
else
  # Log and exit
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Revision loop max iterations" \
    --decision "Abandoned gap closure" \
    --rationale "Auto-decided to abandon after max iterations"
  exit 1
fi
```

**If AGENT_MODE=false (classic):**

Offer options:
1. Force proceed (execute despite issues)
2. Provide guidance (user gives direction, retry)
3. Abandon (exit, user runs /gsd:plan-phase manually)

Wait for user response.
</step>

<step name="present_ready">
**Present completion and next steps:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FIXES READY ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} gap(s) diagnosed, {M} fix plan(s) created

| Gap | Root Cause | Fix Plan |
|-----|------------|----------|
| {truth 1} | {root_cause} | {phase}-04 |
| {truth 2} | {root_cause} | {phase}-04 |

Plans verified and ready for execution.

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute fixes** — run fix plans

`/clear` then `/gsd:execute-phase {phase} --gaps-only`

───────────────────────────────────────────────────────────────
```
</step>

</process>

<update_rules>
**Batched writes for efficiency:**

Keep results in memory. Write to file only when:
1. **Issue found** — Preserve the problem immediately
2. **Session complete** — Final write before commit
3. **Checkpoint** — Every 5 passed tests (safety net)

| Section | Rule | When Written |
|---------|------|--------------|
| Frontmatter.status | OVERWRITE | Start, complete |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test | OVERWRITE | On any file write |
| Tests.{N}.result | OVERWRITE | On any file write |
| Summary | OVERWRITE | On any file write |
| Gaps | APPEND | When issue found |

On context reset: File shows last checkpoint. Resume from there.
</update_rules>

<severity_inference>
**Infer severity from user's natural language:**

| User says | Infer |
|-----------|-------|
| "crashes", "error", "exception", "fails completely" | blocker |
| "doesn't work", "nothing happens", "wrong behavior" | major |
| "works but...", "slow", "weird", "minor issue" | minor |
| "color", "spacing", "alignment", "looks off" | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<success_criteria>
- [ ] UAT file created with all tests from SUMMARY.md
- [ ] Tests presented one at a time with expected behavior
- [ ] User responses processed as pass/issue/skip
- [ ] Severity inferred from description (never asked)
- [ ] Batched writes: on issue, every 5 passes, or completion
- [ ] Committed on completion
- [ ] If issues: parallel debug agents diagnose root causes
- [ ] If issues: gsd-planner creates fix plans (gap_closure mode)
- [ ] If issues: gsd-plan-checker verifies fix plans
- [ ] If issues: revision loop until plans pass (max 3 iterations)
- [ ] Ready for `/gsd:execute-phase --gaps-only` when complete
</success_criteria>

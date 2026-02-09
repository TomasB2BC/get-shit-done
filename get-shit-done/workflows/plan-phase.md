<purpose>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification. Default flow: Research (if needed) -> Plan -> Verify -> Done. Orchestrates gsd-phase-researcher, gsd-planner, and gsd-plan-checker agents with a revision loop (max 3 iterations).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@C:\Users\tomas\.claude/get-shit-done/references/ui-brand.md
</required_reading>

<process>

## 1. Validate Environment and Resolve Model Profile

```bash
PLANNING_EXISTS=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning --raw)
echo "$PLANNING_EXISTS"
```

**If not found:** Error — run `/gsd:new-project` first.

**Resolve models:**

```bash
RESEARCHER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-phase-researcher --raw)
PLANNER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-planner --raw)
CHECKER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-plan-checker --raw)
```

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**If no phase number:** Detect next unplanned phase from roadmap.

**Find phase directory:**

```bash
PHASE_INFO=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js find-phase "$PHASE")
PHASE_DIR=$(echo "$PHASE_INFO" | grep -o '"directory":"[^"]*"' | cut -d'"' -f4)
```

If `found` is false, validate phase exists in ROADMAP.md. If valid, create the directory:
```bash
PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //')
PHASE_SLUG=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js generate-slug "$PHASE_NAME" --raw)
PADDED=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js find-phase "$PHASE" --raw | grep -o '^[0-9]*' || printf "%02d" "$PHASE")
mkdir -p ".planning/phases/${PADDED}-${PHASE_SLUG}"
PHASE_DIR=".planning/phases/${PADDED}-${PHASE_SLUG}"
```

**Check for existing research and plans:**

```bash
ls ${PHASE_DIR}/*-RESEARCH.md 2>/dev/null
ls ${PHASE_DIR}/*-PLAN.md 2>/dev/null
```

## 3. Validate Phase

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

**If not found:** Error with available phases. **If found:** Extract phase number, name, description.

## 4. Load CONTEXT.md

```bash
CONTEXT_CONTENT=$(cat "${PHASE_DIR}"/*-CONTEXT.md 2>/dev/null)
```

**CRITICAL:** Store `CONTEXT_CONTENT` now — pass to researcher, planner, checker, and revision agents.

If CONTEXT.md exists, display: `Using phase context from: ${PHASE_DIR}/*-CONTEXT.md`

## 5. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or config `workflow.research=false` (without `--research` override).

```bash
WORKFLOW_RESEARCH=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js state load --raw | grep '^research=' | cut -d= -f2)
```

**If RESEARCH.md exists AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

### Spawn gsd-phase-researcher

```bash
PHASE_DESC=$(grep -A3 "Phase ${PHASE}:" .planning/ROADMAP.md)
REQUIREMENTS=$(cat .planning/REQUIREMENTS.md 2>/dev/null | grep -A100 "## Requirements" | head -50)
DECISIONS=$(grep -A20 "### Decisions Made" .planning/STATE.md 2>/dev/null)
```

Research prompt:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<phase_context>
IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /gsd:discuss-phase.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Claude's Discretion** = Freedom areas — research options, recommend
- **Deferred Ideas** = Out of scope — ignore

{context_content}
</phase_context>

<additional_context>
**Phase description:** {phase_description}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

### Detect Orchestration Mode

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check
  AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "[!] WARNING: orchestration=hybrid but Agent Teams not available or research not enabled"
  echo "[!] Falling back to classic mode"
fi
```

### Branch: Hybrid Research (Agent Teams - 3-Perspective Debate)

**If `USE_HYBRID=true`:**

Display hybrid indicator:
```
>> Using Agent Teams for phase research (hybrid mode)
>> 3-round debate protocol: optimist + devil's advocate + explorer
```

**Step H1: Create research team**

```bash
PADDED_PHASE=$(printf "%02d" "$PHASE")
TEAM_NAME="phase-${PADDED_PHASE}-research"
```

```
TeamCreate(
  team_name="${TEAM_NAME}",
  description="Phase ${PHASE} research - 3 perspectives (optimist, advocate, explorer)"
)
```

**Handle TeamCreate failure:**
```bash
FALLBACK_TO_CLASSIC=false
# If TeamCreate fails, set FALLBACK_TO_CLASSIC=true and display warning:
# "[!] WARNING: Agent Teams team creation failed, falling back to classic mode"
```

**Step H2: Spawn 3 researcher teammates**

Spawn all 3 in parallel. Each Task prompt includes:
- `<mode>teammate</mode>`
- `<team_name>${TEAM_NAME}</team_name>`
- `<role>optimist</role>` (or devil's-advocate, or explorer)
- Reference to agent file
- Research prompt content

**Optimist teammate:**
```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n<mode>teammate</mode>\n<team_name>${TEAM_NAME}</team_name>\n<role>optimist</role>\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase} (optimist)",
  team_name="${TEAM_NAME}",
  name="optimist"
)
```

**Devil's Advocate teammate:**
```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n<mode>teammate</mode>\n<team_name>${TEAM_NAME}</team_name>\n<role>devil's-advocate</role>\n\n" + research_prompt_modified_for_advocate,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase} (devil's advocate)",
  team_name="${TEAM_NAME}",
  name="devil's-advocate"
)
```

Note: For devil's advocate, modify output section:
```
<output>
Write to: {phase_dir}/${PADDED_PHASE}-ADVOCATE-NOTES.md
</output>
```

**Explorer teammate:**
```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n<mode>teammate</mode>\n<team_name>${TEAM_NAME}</team_name>\n<role>explorer</role>\n\n" + research_prompt_modified_for_explorer,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase} (explorer)",
  team_name="${TEAM_NAME}",
  name="explorer"
)
```

Note: For explorer, modify output section:
```
<output>
Write to: {phase_dir}/${PADDED_PHASE}-EXPLORER-NOTES.md
</output>
```

**Handle spawn failures:**
```bash
SPAWNED_COUNT=3  # Or actual count from successful spawns
if [ "$SPAWNED_COUNT" -lt 2 ]; then
  FALLBACK_TO_CLASSIC=true
  echo "[!] WARNING: Fewer than 2 teammates spawned successfully, falling back to classic mode"
fi
```

**Step H3: Wait for Round 1 completion**

Wait for all spawned teammates to report idle.

```bash
# Verify draft files exist
ls "${PHASE_DIR}"/*-RESEARCH.md 2>/dev/null
ls "${PHASE_DIR}"/${PADDED_PHASE}-ADVOCATE-NOTES.md 2>/dev/null
ls "${PHASE_DIR}"/${PADDED_PHASE}-EXPLORER-NOTES.md 2>/dev/null
```

**Step H4: Prompt Round 2 (Challenge Exchange)**

Send messages to active teammates:

```
SendMessage(
  type="message",
  recipient="devil's-advocate",
  content="Round 2: Review the optimist's draft RESEARCH.md in ${PHASE_DIR}/. Send your challenges directly to the optimist using SendMessage(type='message', recipient='optimist', content='CHALLENGE: ...', summary='Challenge on [topic]'). Send one message per distinct challenge (2-3 sentences each with specific evidence). Stop when all challenges are sent.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="explorer",
  content="Round 2: Review the optimist's draft RESEARCH.md in ${PHASE_DIR}/. Send your alternative perspectives directly to the optimist using SendMessage(type='message', recipient='optimist', content='ALTERNATIVE: ...', summary='Alternative on [topic]'). Send one message per distinct insight (2-3 sentences each). Stop when all alternatives are sent.",
  summary="Start Round 2 alternatives"
)

SendMessage(
  type="message",
  recipient="optimist",
  content="Round 2: Wait for challenge messages from devil's advocate and explorer. They will send you direct messages with challenges and alternatives. Review each one and prepare to address them in Round 3. Stop after reviewing all incoming messages.",
  summary="Wait for Round 2 challenges"
)
```

**Step H5: Wait for Round 2 completion**

Wait for all active teammates to go idle.

**Step H6: Prompt Round 3 (Optimist Finalizes)**

```
SendMessage(
  type="message",
  recipient="optimist",
  content="Round 3: Finalize ${PHASE_DIR}/*-RESEARCH.md. Incorporate valid challenges and alternatives. Add a 'Dissenting Views / Risks & Alternatives' section summarizing the devil's advocate concerns and explorer insights. This is the final version.",
  summary="Start Round 3 finalization"
)
```

Wait for optimist to go idle.

**Step H7: Clean up perspective notes**

```bash
rm -f "${PHASE_DIR}"/${PADDED_PHASE}-ADVOCATE-NOTES.md
rm -f "${PHASE_DIR}"/${PADDED_PHASE}-EXPLORER-NOTES.md
```

**Step H8: Shutdown teammates**

```
SendMessage(
  type="shutdown_request",
  recipient="optimist",
  content="Research complete. Thank you for your work."
)

SendMessage(
  type="shutdown_request",
  recipient="devil's-advocate",
  content="Research complete. Thank you for your work."
)

SendMessage(
  type="shutdown_request",
  recipient="explorer",
  content="Research complete. Thank you for your work."
)
```

**Step H9: Clean up team**

```
TeamDelete(team_name="${TEAM_NAME}")
```

**Step H10: Continue to research complete handling**

Display: `>> Research complete (hybrid mode -- 3-perspective debate)`

Proceed to step 6.

### Branch: Classic Research (Single Task)

**If `USE_HYBRID=false` OR `FALLBACK_TO_CLASSIC=true`:**

**If FALLBACK_TO_CLASSIC was triggered after TeamCreate succeeded:**
```
TeamDelete(team_name="${TEAM_NAME}")
```

**Classic research path (unchanged):**

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Handle Researcher Return

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.

## 7. Read Context Files

Read and store for planner agent (`@` syntax doesn't work across Task() boundaries):

```bash
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null)
RESEARCH_CONTENT=$(cat "${PHASE_DIR}"/*-RESEARCH.md 2>/dev/null)
VERIFICATION_CONTENT=$(cat "${PHASE_DIR}"/*-VERIFICATION.md 2>/dev/null)
UAT_CONTENT=$(cat "${PHASE_DIR}"/*-UAT.md 2>/dev/null)
```

## 8. Spawn gsd-planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

Planner prompt:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: If context exists below, it contains USER DECISIONS from /gsd:discuss-phase.
- **Decisions** = LOCKED — honor exactly, do not revisit
- **Claude's Discretion** = Freedom — make implementation choices
- **Deferred Ideas** = Out of scope — do NOT include

{context_content}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

## 9. Handle Planner Return

- **`## PLANNING COMPLETE`:** Display plan count. If `--skip-verify` or config `workflow.plan_check=false`: skip to step 13. Otherwise: step 10.
  ```bash
  WORKFLOW_PLAN_CHECK=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js state load --raw | grep '^plan_checker=' | cut -d= -f2)
  ```
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

## 10. Spawn gsd-plan-checker Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Claude's Discretion** = Freedom areas — plans can choose approach
- **Deferred Ideas** = Out of scope — plans must NOT include

{context_content}
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

## 11. Handle Checker Return

- **`## VERIFICATION PASSED`:** Display confirmation, proceed to step 13.
- **`## ISSUES FOUND`:** Display issues, check iteration count, proceed to step 12.

## 12. Revision Loop (Max 3 Iterations)

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision

**Existing plans:** {plans_content}
**Checker issues:** {structured_issues_from_checker}

**Phase Context:**
Revisions MUST still honor user decisions.
{context_content}
</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns -> spawn checker again (step 10), increment iteration_count.

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon

## 13. Present Final Status

Route to `<offer_next>`.

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/gsd:execute-phase {X}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase-dir}/*-PLAN.md — review plans
- /gsd:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] gsd-phase-researcher spawned with CONTEXT.md
- [ ] Existing plans checked
- [ ] gsd-planner spawned with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] gsd-plan-checker spawned with CONTEXT.md
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>

<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md and config.json before any operation.
</required_reading>

<process>

<step name="resolve_model_profile" priority="first">

```bash
EXECUTOR_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-executor --raw)
VERIFIER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-verifier --raw)
```

</step>

<step name="load_project_state">

```bash
cat .planning/STATE.md 2>/dev/null
```

**If exists:** Parse current position, accumulated decisions, blockers.
**If missing but .planning/ exists:** Offer reconstruct from artifacts or continue without state.
**If .planning/ missing:** Error — project not initialized.

**Load configs:**

```bash
GSD_CONFIG=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js state load --raw)
COMMIT_PLANNING_DOCS=$(echo "$GSD_CONFIG" | grep '^commit_docs=' | cut -d= -f2)
PARALLELIZATION=$(echo "$GSD_CONFIG" | grep '^parallelization=' | cut -d= -f2)
BRANCHING_STRATEGY=$(echo "$GSD_CONFIG" | grep '^branching_strategy=' | cut -d= -f2)
PHASE_BRANCH_TEMPLATE=$(echo "$GSD_CONFIG" | grep '^phase_branch_template=' | cut -d= -f2)
MILESTONE_BRANCH_TEMPLATE=$(echo "$GSD_CONFIG" | grep '^milestone_branch_template=' | cut -d= -f2)
```

When `PARALLELIZATION=false`, plans within a wave execute sequentially.
</step>

<step name="handle_branching">
Create or switch to branch based on `BRANCHING_STRATEGY`.

**"none":** Skip, continue on current branch.

**"phase":**
```bash
PHASE_NAME=$(basename "$PHASE_DIR" | sed 's/^[0-9]*-//')
PHASE_SLUG=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js generate-slug "$PHASE_NAME" --raw)
BRANCH_NAME=$(echo "$PHASE_BRANCH_TEMPLATE" | sed "s/{phase}/$PADDED_PHASE/g" | sed "s/{slug}/$PHASE_SLUG/g")
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

**"milestone":**
```bash
MILESTONE_VERSION=$(grep -oE 'v[0-9]+\.[0-9]+' .planning/ROADMAP.md | head -1 || echo "v1.0")
MILESTONE_NAME=$(grep -A1 "## .*$MILESTONE_VERSION" .planning/ROADMAP.md | tail -1 | sed 's/.*- //' | cut -d'(' -f1 | tr -d ' ' || echo "milestone")
MILESTONE_SLUG=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js generate-slug "$MILESTONE_NAME" --raw)
BRANCH_NAME=$(echo "$MILESTONE_BRANCH_TEMPLATE" | sed "s/{milestone}/$MILESTONE_VERSION/g" | sed "s/{slug}/$MILESTONE_SLUG/g")
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">

```bash
PHASE_INFO=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js find-phase "${PHASE_ARG}")
PHASE_DIR=$(echo "$PHASE_INFO" | grep -o '"directory":"[^"]*"' | cut -d'"' -f4)
if [ -z "$PHASE_DIR" ]; then
  echo "ERROR: No phase directory matching '${PHASE_ARG}'"
  exit 1
fi

PLAN_COUNT=$(ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$PLAN_COUNT" -eq 0 ]; then
  echo "ERROR: No plans found in $PHASE_DIR"
  exit 1
fi
```

Report: "Found {N} plans in {phase_dir}"
</step>

<step name="discover_plans">

```bash
ls -1 "$PHASE_DIR"/*-PLAN.md 2>/dev/null | sort
ls -1 "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null | sort
```

For each plan, read frontmatter: `wave`, `autonomous`, `gap_closure`.

Build inventory: path, plan ID, wave, autonomous flag, gap_closure flag, completion (SUMMARY exists = complete).

**Filtering:** Skip completed plans. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.
</step>

<step name="group_by_wave">

```bash
for plan in $PHASE_DIR/*-PLAN.md; do
  wave=$(grep "^wave:" "$plan" | cut -d: -f2 | tr -d ' ')
  autonomous=$(grep "^autonomous:" "$plan" | cut -d: -f2 | tr -d ' ')
  echo "$plan:$wave:$autonomous"
done
```

Group by wave number. **No dependency analysis needed** — waves pre-computed during `/gsd:plan-phase`.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Read files and spawn agents:**

   Content must be inlined — `@` syntax doesn't work across Task() boundaries.

   ```bash
   PLAN_CONTENT=$(cat "{plan_path}")
   STATE_CONTENT=$(cat .planning/STATE.md)
   CONFIG_CONTENT=$(cat .planning/config.json 2>/dev/null)
   ```

   Each agent prompt:

   ```
   <objective>
   Execute plan {plan_number} of phase {phase_number}-{phase_name}.
   Commit each task atomically. Create SUMMARY.md. Update STATE.md.
   </objective>

   <execution_context>
   @C:\Users\tomas\.claude/get-shit-done/workflows/execute-plan.md
   @C:\Users\tomas\.claude/get-shit-done/templates/summary.md
   @C:\Users\tomas\.claude/get-shit-done/references/checkpoints.md
   @C:\Users\tomas\.claude/get-shit-done/references/tdd.md
   </execution_context>

   <context>
   Plan:
   {plan_content}

   Project state:
   {state_content}

   Config (if exists):
   {config_content}
   </context>

   <success_criteria>
   - [ ] All tasks executed
   - [ ] Each task committed individually
   - [ ] SUMMARY.md created in plan directory
   - [ ] STATE.md updated with position and decisions
   </success_criteria>
   ```

3. **Wait for all agents in wave to complete.**

4. **Report completion — spot-check claims first:**

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

5. **Handle failures:** Report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Flow:**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Phase {X}: {Name} Execution Complete

**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

**Detect orchestration mode:**

Read config for hybrid mode detection using the canonical compound detection pattern:

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check
  AGENT_TEAMS_VERIFICATION=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"verification"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_VERIFICATION" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "[!] WARNING: orchestration=hybrid but Agent Teams not available or verification not enabled"
  echo "[!] Falling back to classic mode"
fi
```

**If USE_HYBRID=true: Hybrid Verification (Agent Teams -- Adversarial Team)**

Display hybrid indicator:
```
>> Using Agent Teams for verification (hybrid mode)
>> Adversarial protocol: validator + breaker + reviewer
```

**Step V1: Create verification team**

```
TeamCreate(
  team_name="phase-${PADDED_PHASE}-verification",
  description="Phase ${PHASE} verification -- adversarial team (validator, breaker, reviewer)"
)
```

If TeamCreate fails, display warning and set FALLBACK_TO_CLASSIC=true:
```
[!] WARNING: Agent Teams team creation failed, falling back to classic mode
```

**Step V2: Gather verification context**

Before spawning teammates, prepare the context they need:

```bash
# Collect must-haves from all PLAN.md files in this phase
MUST_HAVES=""
for plan in "$PHASE_DIR"/*-PLAN.md; do
  plan_must_haves=$(sed -n '/^must_haves:/,/^---$/p' "$plan" 2>/dev/null)
  MUST_HAVES="${MUST_HAVES}\n\n## From $(basename $plan):\n${plan_must_haves}"
done

# Get phase goal from ROADMAP.md
GOAL=$(grep -A2 "Phase ${PHASE_NUM}" .planning/ROADMAP.md 2>/dev/null | grep "Goal:" | sed 's/.*Goal:\*\* //')

# List all SUMMARY.md files
SUMMARIES=$(ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null)

# Get padded phase number for file naming
PADDED_PHASE=$(printf "%02d" "$PHASE_NUM")
```

**Step V3: Spawn 3 verification teammates**

Spawn all 3 in parallel using Task with team_name and name parameters. The {PHASE_DIR}, {GOAL}, {MUST_HAVES}, {PADDED_PHASE}, and {VERIFIER_MODEL} are already resolved.

```
Task(prompt="First, read C:\Users\tomas\.claude/agents/gsd-verifier.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-${PADDED_PHASE}-verification</team_name>
<role>validator</role>

<objective>
Verify phase ${PHASE_NUM} goal achievement.
Focus: Positive verification -- check must-haves are met, artifacts exist and are wired correctly.
Apply 3-level checks (exists, substantive, wired) to all artifacts.
</objective>

<context>
Phase directory: ${PHASE_DIR}
Phase goal: ${GOAL}

Must-haves from plans:
${MUST_HAVES}

SUMMARY files to cross-reference:
${SUMMARIES}
</context>

<findings_file>
Write to: ${PHASE_DIR}/${PADDED_PHASE}-VALIDATOR-FINDINGS.md
</findings_file>",
  subagent_type="general-purpose",
  model="${VERIFIER_MODEL}",
  description="Verify Phase ${PHASE_NUM} (validator role)",
  team_name="phase-${PADDED_PHASE}-verification",
  name="validator"
)

Task(prompt="First, read C:\Users\tomas\.claude/agents/gsd-verifier.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-${PADDED_PHASE}-verification</team_name>
<role>breaker</role>

<objective>
Verify phase ${PHASE_NUM} goal achievement.
Focus: Adversarial -- actively hunt for stubs, broken wiring, placeholder implementations, TODO comments, empty handlers, orphaned files.
Prioritize key links first (highest impact), then systematic file scan.
Be aggressive -- false positives are acceptable, false negatives are not.
</objective>

<context>
Phase directory: ${PHASE_DIR}
Phase goal: ${GOAL}

Must-haves from plans:
${MUST_HAVES}

SUMMARY files to cross-reference:
${SUMMARIES}
</context>

<findings_file>
Write to: ${PHASE_DIR}/${PADDED_PHASE}-BREAKER-FINDINGS.md
</findings_file>",
  subagent_type="general-purpose",
  model="${VERIFIER_MODEL}",
  description="Verify Phase ${PHASE_NUM} (breaker role)",
  team_name="phase-${PADDED_PHASE}-verification",
  name="breaker"
)

Task(prompt="First, read C:\Users\tomas\.claude/agents/gsd-verifier.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-${PADDED_PHASE}-verification</team_name>
<role>reviewer</role>

<objective>
Verify phase ${PHASE_NUM} goal achievement.
Focus: Completeness -- check requirements coverage, scan for anti-patterns, identify human verification needs.
Read all PLAN.md and SUMMARY.md files to verify planned work was actually executed.
Validate that SUMMARY.md claims match actual codebase state.
</objective>

<context>
Phase directory: ${PHASE_DIR}
Phase goal: ${GOAL}

Must-haves from plans:
${MUST_HAVES}

SUMMARY files to cross-reference:
${SUMMARIES}

Requirements file: .planning/REQUIREMENTS.md
</context>

<findings_file>
Write to: ${PHASE_DIR}/${PADDED_PHASE}-REVIEWER-FINDINGS.md
</findings_file>",
  subagent_type="general-purpose",
  model="${VERIFIER_MODEL}",
  description="Verify Phase ${PHASE_NUM} (reviewer role)",
  team_name="phase-${PADDED_PHASE}-verification",
  name="reviewer"
)
```

If any teammate fails to spawn, log warning. If fewer than 2 teammates spawn successfully (0-1 succeed), set FALLBACK_TO_CLASSIC=true. If 2 spawn, continue with available teammates.

**Step V4: Wait for Round 1 completion**

**IMPORTANT: The orchestrator MUST wait here. Do NOT start writing or modifying any files.** Idle notifications are delivered automatically. Do NOT proceed to Round 2 until all spawned teammates have gone idle.

After all teammates go idle, verify findings files exist:

```bash
ls "${PHASE_DIR}/${PADDED_PHASE}-VALIDATOR-FINDINGS.md"
ls "${PHASE_DIR}/${PADDED_PHASE}-BREAKER-FINDINGS.md"
ls "${PHASE_DIR}/${PADDED_PHASE}-REVIEWER-FINDINGS.md"
```

If zero findings files exist, set FALLBACK_TO_CLASSIC=true. If 1-2 exist, continue with available teammates.

**Step V5: Prompt Round 2 (Challenge Exchange)**

Send messages to each teammate to begin Round 2. Each message tells the teammate to read the OTHER teammates' findings files and send role-appropriate challenges:

```
SendMessage(
  type="message",
  recipient="validator",
  content="Round 2: Read the breaker's findings at ${PHASE_DIR}/${PADDED_PHASE}-BREAKER-FINDINGS.md and the reviewer's findings at ${PHASE_DIR}/${PADDED_PHASE}-REVIEWER-FINDINGS.md. Respond to any challenges from breaker about items you marked as VERIFIED. If breaker's evidence is valid, update your findings file. Also address any completeness gaps from reviewer. Stop when all challenges are evaluated.",
  summary="Start Round 2 defense"
)

SendMessage(
  type="message",
  recipient="breaker",
  content="Round 2: Read the validator's findings at ${PHASE_DIR}/${PADDED_PHASE}-VALIDATOR-FINDINGS.md and the reviewer's findings at ${PHASE_DIR}/${PADDED_PHASE}-REVIEWER-FINDINGS.md. For each item validator marked as VERIFIED, check for evidence that it should fail. Send CHALLENGE messages to validator: SendMessage(type='message', recipient='validator', content='CHALLENGE: You marked [X] as VERIFIED, but I found [issue] in [file:line]. Evidence: [details]', summary='Challenge on [topic]'). Also review reviewer's completeness gaps. Stop when all challenges sent.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="reviewer",
  content="Round 2: Read the validator's findings at ${PHASE_DIR}/${PADDED_PHASE}-VALIDATOR-FINDINGS.md and the breaker's findings at ${PHASE_DIR}/${PADDED_PHASE}-BREAKER-FINDINGS.md. Send COMPLETENESS GAP messages to validator for any requirements or must-haves not in their findings: SendMessage(type='message', recipient='validator', content='COMPLETENESS GAP: Requirement [X] has no verification. Must-have [Y] from plan [Z] missing.', summary='Gap on [requirement]'). Stop when all gaps sent.",
  summary="Start Round 2 completeness check"
)
```

**Step V6: Wait for Round 2 completion**

**IMPORTANT: Wait here for all active teammates to go idle again.** Idle notifications are delivered automatically. Do NOT proceed until all have gone idle.

**Step V7: Lead Synthesis -- Create VERIFICATION.md**

Read ALL 3 findings files. Synthesize into a single VERIFICATION.md using the EXACT SAME FORMAT as classic mode. This is critical -- downstream tools (like plan-phase --gaps) expect specific frontmatter fields and YAML structure.

1. Read validator findings: extract truth verification statuses, artifact check results, key link statuses
2. Read breaker findings: extract issues found -- any STUB, ORPHANED, or MISSING items that validator missed must be incorporated
3. Read reviewer findings: extract requirements coverage, anti-patterns, human verification needs

**Resolution logic for conflicting findings:**
- If breaker found a valid issue that validator marked VERIFIED, change to FAILED (breaker wins on adversarial findings)
- If reviewer found a completeness gap (missing requirement verification), add it as a gap
- If evidence is ambiguous, mark as UNCERTAIN and add to human_verification items

**Determine overall status:**
- **passed**: All truths VERIFIED by validator, no valid breaker challenges, no completeness gaps
- **gaps_found**: Any truths FAILED, valid breaker challenges accepted, or completeness gaps
- **human_needed**: All automated checks pass but reviewer flagged items for human verification

**Write VERIFICATION.md** at `${PHASE_DIR}/${PADDED_PHASE}-VERIFICATION.md` using the EXACT classic format (see existing `<output>` section in gsd-verifier.md for the template).

Add a `**Mode:** Hybrid (adversarial team: validator + breaker + reviewer)` line to the report body to differentiate from classic.

**Step V8: Clean up findings files**

Delete temporary findings files BEFORE shutdown:

```bash
rm "${PHASE_DIR}/${PADDED_PHASE}-VALIDATOR-FINDINGS.md" 2>/dev/null
rm "${PHASE_DIR}/${PADDED_PHASE}-BREAKER-FINDINGS.md" 2>/dev/null
rm "${PHASE_DIR}/${PADDED_PHASE}-REVIEWER-FINDINGS.md" 2>/dev/null
```

**Step V9: Shutdown teammates**

```
SendMessage(type="shutdown_request", recipient="validator", content="Verification complete. Thank you for your work.")
SendMessage(type="shutdown_request", recipient="breaker", content="Verification complete. Thank you for your work.")
SendMessage(type="shutdown_request", recipient="reviewer", content="Verification complete. Thank you for your work.")
```

Wait for shutdown confirmations.

**Step V10: Clean up team**

```
TeamDelete()
```

Display:
```
>> Verification complete (hybrid mode -- adversarial team)
```

**Step V11: Read verification status and continue**

After synthesis, read verification status exactly as classic mode does:

```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

Continue to the SAME status handling logic that exists after the classic branch (passed, human_needed, gaps_found). The verification status routing is SHARED between both branches -- it works the same regardless of which branch produced the VERIFICATION.md.

---

**If USE_HYBRID=false OR FALLBACK_TO_CLASSIC=true: Classic Verification (existing code)**

**If FALLBACK_TO_CLASSIC was set after TeamCreate succeeded (team exists but verification failed), clean up the team first:**
```
TeamDelete()
```

Display:
```
[!] Hybrid mode failed, using classic verification mode
```

The existing classic code block (the Task spawn to gsd-verifier):

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Check must_haves against actual codebase. Create VERIFICATION.md.",
  subagent_type="gsd-verifier",
  model="{verifier_model}"
)
```

---

**Status Routing (Shared between both branches):**

Read status:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd:plan-phase {phase} --gaps` |

**If human_needed:**
```
## ✓ Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From VERIFICATION.md human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## ⚠ Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## ▶ Next Up

`/gsd:plan-phase {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: `cat {phase_dir}/{phase}-VERIFICATION.md` — full report
Also: `/gsd:verify-work {X}` — manual testing first
```

Gap closure cycle: `/gsd:plan-phase {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/gsd:execute-phase {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
Mark phase complete in ROADMAP.md (date, status).

```bash
node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/{phase_dir}/*-VERIFICATION.md .planning/REQUIREMENTS.md
```
</step>

<step name="offer_next">

**If more phases:**
```
## Next Up

**Phase {X+1}: {Name}** — {Goal}

`/gsd:plan-phase {X+1}`

<sub>`/clear` first for fresh context</sub>
```

**If milestone complete:**
```
MILESTONE COMPLETE!

All {N} phases executed.

`/gsd:complete-milestone`
```
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md
</failure_handling>

<resumption>
Re-run `/gsd:execute-phase {phase}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>

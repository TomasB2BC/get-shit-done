<purpose>
Research how to implement a phase. Spawns gsd-phase-researcher with phase context.

Standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

@~/.claude/get-shit-done/references/model-profile-resolution.md

Resolve model for:
- `gsd-phase-researcher`


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

## Step 1: Normalize and Validate Phase

@~/.claude/get-shit-done/references/phase-argument-parsing.md

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found: Error and exit.

**Detect agent mode:**

```bash
AGENT_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"agent_mode"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

## Step 2: Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/RESEARCH.md 2>/dev/null
```

If exists: Offer update/view/skip options.

## Step 3: Gather Phase Context

```bash
grep -A20 "Phase ${PHASE}:" .planning/ROADMAP.md
cat .planning/REQUIREMENTS.md 2>/dev/null
cat .planning/phases/${PHASE}-*/*-CONTEXT.md 2>/dev/null
grep -A30 "### Decisions Made" .planning/STATE.md 2>/dev/null

# Resolve PHASE_DIR for use in Step 3.5 and beyond
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
```

## Step 3.5: Explorer Recon (Optional)

**Auto-skip checks (run BEFORE any probe work):**

```bash
# Skip condition 1: User already provided domain context (hard rule)
CONTEXT_EXISTS=$(ls "${PHASE_DIR}"/*-CONTEXT.md 2>/dev/null | wc -l)

# Skip condition 2: Recon already completed for this phase (reuse existing)
RECON_EXISTS=$(ls "${PHASE_DIR}/recon/RECON.md" 2>/dev/null | wc -l)

# Skip condition 3: Config toggle off (default true -- recon runs unless explicitly disabled)
EXPLORER_RECON=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"explorer_recon"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")

if [ "$EXPLORER_RECON" = "false" ] || [ "$CONTEXT_EXISTS" -gt 0 ] || [ "$RECON_EXISTS" -gt 0 ]; then
  SKIP_REASON="config off"
  [ "$CONTEXT_EXISTS" -gt 0 ] && SKIP_REASON="CONTEXT.md exists"
  [ "$RECON_EXISTS" -gt 0 ] && SKIP_REASON="RECON.md exists (reusing)"
  echo ">> Skipping recon: $SKIP_REASON"
  # Jump to Step 4
fi
```

**If NOT skipped, proceed with recon:**

```
>> Explorer Recon: spawning field probes...
```

**Step R1: Create recon directory and spawn 3 parallel Explore Tasks**

```bash
mkdir -p "${PHASE_DIR}/recon"
```

Spawn 3 parallel Tasks. Each MUST use `subagent_type="Explore"` (NOT general-purpose).
**NOTE:** Explore agents are read-only (no Write tool). They return their digest as the Task result. The orchestrator captures return values and writes RECON.md.

**Problem-space probe:**
```
Task(
  prompt="You are a field recon explorer. Your job is narrow: answer ONE question.

Question: What is the core technical problem for this phase? What existing code, prior phases, or related files are directly relevant?

Phase: Phase {phase_number}: {phase_name}
Phase description: {phase_description}

Resources: read local project files only (.planning/, relevant source files from phase description).
Do NOT do web research -- that is reserved for the full research team.

Return a 200-400 word digest. No padding. Dense and actionable.
Focus: facts the research team needs to start well-oriented.",
  subagent_type="Explore",
  description="Recon probe: problem-space"
)
```

**Ecosystem-scan probe:**
```
Task(
  prompt="You are a field recon explorer. Your job is narrow: answer ONE question.

Question: What patterns, tools, or conventions already exist in this codebase that relate to this domain?

Phase: Phase {phase_number}: {phase_name}
Phase description: {phase_description}

Resources: read local project files only (.planning/, relevant source files from phase description).
Do NOT do web research -- that is reserved for the full research team.

Return a 200-400 word digest. No padding. Dense and actionable.
Focus: facts the research team needs to start well-oriented.",
  subagent_type="Explore",
  description="Recon probe: ecosystem-scan"
)
```

**Constraint-finder probe:**
```
Task(
  prompt="You are a field recon explorer. Your job is narrow: answer ONE question.

Question: What are the constraints: existing code to integrate with, config patterns, non-obvious limits, adjacent phases that must stay compatible?

Phase: Phase {phase_number}: {phase_name}
Phase description: {phase_description}

Resources: read local project files only (.planning/, relevant source files from phase description).
Do NOT do web research -- that is reserved for the full research team.

Return a 200-400 word digest. No padding. Dense and actionable.
Focus: facts the research team needs to start well-oriented.",
  subagent_type="Explore",
  description="Recon probe: constraint-finder"
)
```

**Step R2: Capture probe results from Task return values**

Store each Task's return value as PROBE_PROBLEM, PROBE_ECOSYSTEM, PROBE_CONSTRAINTS.

**Step R3: Write RECON.md from captured results**

Use the 3 captured probe results to fill the RECON.md template (the orchestrator LLM fills values, not structure -- the template is mandatory):

```markdown
# Recon: Phase {N} - {Name}

## Problem Space
[200 words max -- from problem-space probe]

## Ecosystem Signals
[200 words max -- from ecosystem-scan probe]

## Constraints
[200 words max -- from constraint-finder probe]

## Recon Verdict
[1 paragraph orchestrator synthesis]

---
composition_hint: [adversarial | collaborative | domain-specialist | minimal]
proposed_roles:
  - optimist
  - [devil's-advocate | domain-specialist | integration-specialist]
  - [explorer | skip]
composition_rationale: [1 sentence]
---

<recon_injection>
PROBLEM: [2-3 sentence dense summary of the core problem]
EXISTING: [key existing code/patterns directly relevant]
CONSTRAINTS: [non-obvious limits the researcher must respect]
NOT-ABOUT: [what the researcher should NOT spend time discovering -- already covered by recon]
TEAM-HINT: [composition_hint value + 1-sentence rationale]
</recon_injection>
```

The `composition_hint` field uses a closed vocabulary: `adversarial`, `collaborative`, `domain-specialist`, `minimal`. Write the completed RECON.md to `${PHASE_DIR}/recon/RECON.md`.

**Step R4: (no cleanup needed -- probes return via Task result, no files to delete)**

**Step R5: Human checkpoint for team composition (or auto-decide in agent mode)**

Read `composition_hint` and `proposed_roles` from RECON.md.

**If AGENT_MODE=true:**

```bash
COMP_HINT=$(grep "^composition_hint:" "${PHASE_DIR}/recon/RECON.md" | awk '{print $2}')

SELECTED_COMPOSITION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide \
  --type choice \
  --question "Which researcher team composition based on recon?" \
  --options '["adversarial","collaborative","domain-specialist","minimal"]' \
  --context "recon says: $COMP_HINT" \
  --raw)
```

The `SELECTED_COMPOSITION` value drives the spawn list in Step 4 -- this is NOT a log-and-forget call.

**If AGENT_MODE=false (interactive):**

Display the RECON.md narrative sections and proposed team composition:

```
>> Recon complete. Field report:

[Display Problem Space, Ecosystem Signals, Constraints, Recon Verdict sections]

>> Proposed research team:
   [1] optimist
   [2] [second role from proposed_roles]
   [3] [third role from proposed_roles]

Options:
  P  - Proceed with proposed team
  E  - Edit team composition (type role names)
  A  - Add context to recon before proceeding
  S  - Skip recon (proceed with defaults)
```

Store the selected composition as `SELECTED_COMPOSITION` for use in Step 4.

**Step R6: Store recon context for injection into researcher prompts**

Read the `<recon_injection>` block from RECON.md and store it as `RECON_CONTEXT`:

```bash
RECON_CONTEXT=$(sed -n '/<recon_injection>/,/<\/recon_injection>/p' "${PHASE_DIR}/recon/RECON.md")
```

**Step R7: Map composition to spawn list for Step 4**

Use `SELECTED_COMPOSITION` to determine which roles to spawn:

| SELECTED_COMPOSITION | Roles to Spawn |
|---------------------|---------------|
| adversarial | optimist + devil's-advocate + explorer |
| collaborative | optimist + domain-specialist |
| domain-specialist | optimist + [domain-specific role from RECON.md proposed_roles] |
| minimal | optimist only (fall through to Classic Research regardless of USE_HYBRID) |

Store the role list as `RECON_SPAWN_LIST`. When Step 4 (Spawn Researcher) runs, if recon was performed:
- Use `RECON_SPAWN_LIST` instead of the default 3-role team
- If `SELECTED_COMPOSITION` is "minimal", force `USE_HYBRID=false` and use Classic Research path
- Inject `<recon_context>{RECON_CONTEXT}</recon_context>` into every researcher's prompt (after the existing `<context>` section)
- The `recon_context` tag contains only the recon_injection block, NOT the full RECON.md narrative

## Step 4: Spawn Researcher

**Detect orchestration mode:**

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
  echo "WARNING: orchestration=hybrid but Agent Teams not available or research not enabled"
  echo "Falling back to classic mode"
fi
```

### Hybrid Research (Agent Teams -- 3-Perspective Debate)

**If USE_HYBRID=true:**

Display:
```
>> Using Agent Teams for phase research (hybrid mode)
>> 3-round debate protocol: optimist + devil's advocate + explorer
```

**Step H1: Create research team**

```
TeamCreate(
  team_name="phase-{padded_phase}-research",
  description="Phase {phase} research - 3 perspectives (optimist, advocate, explorer)"
)
```

If fails, set `FALLBACK_TO_CLASSIC=true` and jump to Classic Research.

**Step H2: Spawn 3 researcher teammates**

If recon was performed (Step 3.5), use `RECON_SPAWN_LIST` to determine which roles to spawn (may be fewer than 3). Include `<recon_context>{RECON_CONTEXT}</recon_context>` in each teammate's Task prompt after the `</context>` section.

Each with `<mode>teammate</mode>`, `<team_name>`, and `<role>` tags.

**Optimist (owns RESEARCH.md):**

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-{padded_phase}-research</team_name>
<role>optimist</role>

<objective>
Research implementation approach for Phase {phase}: {name}
Answer: 'What do I need to know to PLAN this phase well?'
Focus: Strengths, opportunities, established patterns that apply well.
</objective>

<context>
Phase description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Phase context: {context_md}
</context>

{If RECON_CONTEXT is set from Step 3.5:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>

<debate_protocol>
Round 1: Draft your research perspective
Round 2: Review teammates' ${PHASE}-ADVOCATE-NOTES.md and ${PHASE}-EXPLORER-NOTES.md, strengthen your analysis
Round 3: Finalize RESEARCH.md with a 'Dissenting Views / Risks & Alternatives' section incorporating teammate perspectives
</debate_protocol>",
  subagent_type="general-purpose",
  teammate_name="optimist",
  model="{researcher_model}",
  description="Research Phase {phase} (optimist perspective)"
)
```

**Devil's Advocate (owns ${PHASE}-ADVOCATE-NOTES.md -- temporary):**

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-{padded_phase}-research</team_name>
<role>devil's advocate</role>

<objective>
Research implementation approach for Phase {phase}: {name}
Answer: 'What do I need to know to PLAN this phase well?'
Focus: Risks, challenges, edge cases, why this might fail.
</objective>

<context>
Phase description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Phase context: {context_md}
</context>

{If RECON_CONTEXT is set from Step 3.5:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-ADVOCATE-NOTES.md
</output>

<debate_protocol>
Round 1: Draft your critical perspective
Round 2: Review teammates' RESEARCH.md and ${PHASE}-EXPLORER-NOTES.md, refine your challenges
(Round 3: Optimist incorporates your perspective -- you do not write in Round 3)
</debate_protocol>",
  subagent_type="general-purpose",
  teammate_name="devil's-advocate",
  model="{researcher_model}",
  description="Research Phase {phase} (devil's advocate perspective)"
)
```

**Explorer (owns ${PHASE}-EXPLORER-NOTES.md -- temporary):**

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>phase-{padded_phase}-research</team_name>
<role>explorer</role>

<objective>
Research implementation approach for Phase {phase}: {name}
Answer: 'What do I need to know to PLAN this phase well?'
Focus: Alternative approaches, innovative patterns, unconventional solutions.
</objective>

<context>
Phase description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Phase context: {context_md}
</context>

{If RECON_CONTEXT is set from Step 3.5:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-EXPLORER-NOTES.md
</output>

<debate_protocol>
Round 1: Draft your exploratory perspective
Round 2: Review teammates' RESEARCH.md and ${PHASE}-ADVOCATE-NOTES.md, expand alternatives
(Round 3: Optimist incorporates your perspective -- you do not write in Round 3)
</debate_protocol>",
  subagent_type="general-purpose",
  teammate_name="explorer",
  model="{researcher_model}",
  description="Research Phase {phase} (explorer perspective)"
)
```

If fewer than 2 teammates spawn successfully, set `FALLBACK_TO_CLASSIC=true` and jump to Classic Research.

**Step H3: Wait for Round 1 complete**

Wait for all 3 teammates to become idle.

```bash
# Verify all perspective files exist
ls .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md 2>/dev/null
ls .planning/phases/${PHASE}-{slug}/${PHASE}-ADVOCATE-NOTES.md 2>/dev/null
ls .planning/phases/${PHASE}-{slug}/${PHASE}-EXPLORER-NOTES.md 2>/dev/null
```

Display: `>> Round 1 complete -- all perspectives drafted`

**Step H4: Round 2 -- Challenge Exchange**

Send message to all 3 teammates:

```
SendMessage(
  type="message",
  recipient="devil's-advocate",
  content="Round 2: Review the optimist's draft RESEARCH.md. Send your challenges directly to the optimist using SendMessage(type='message', recipient='optimist', content='CHALLENGE: ...', summary='Challenge on [topic]'). Send one message per distinct challenge (2-3 sentences each with specific evidence). Stop when all challenges are sent.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="explorer",
  content="Round 2: Review the optimist's draft RESEARCH.md. Send your alternative perspectives directly to the optimist using SendMessage(type='message', recipient='optimist', content='ALTERNATIVE: ...', summary='Alternative on [topic]'). Send one message per distinct insight (2-3 sentences each). Stop when all alternatives are sent.",
  summary="Start Round 2 alternatives"
)

SendMessage(
  type="message",
  recipient="optimist",
  content="Round 2: Wait for challenge messages from devil's advocate and explorer. They will send you direct messages with challenges and alternatives. Review each one and prepare to address them in Round 3. Stop after reviewing all incoming messages.",
  summary="Wait for Round 2 challenges"
)
```

**Step H5: Wait for Round 2 complete**

Wait for all 3 teammates to become idle again.

Display: `>> Round 2 complete -- perspectives refined`

**Step H6: Round 3 -- Optimist Finalizes**

Send message to optimist only:

```
SendMessage(
  type="message",
  recipient="optimist",
  content="Round 3 (FINAL): Add a 'Dissenting Views / Risks & Alternatives' section to RESEARCH.md incorporating key points from ${PHASE}-ADVOCATE-NOTES.md and ${PHASE}-EXPLORER-NOTES.md. This is the final deliverable. Reply with 'Research finalized' when done.",
  summary="Start Round 3 finalization"
)
```

Wait for optimist to become idle.

Display: `>> Round 3 complete -- RESEARCH.md finalized with dissenting views`

**Step H7: Clean up perspective notes**

```bash
rm .planning/phases/${PHASE}-{slug}/${PHASE}-ADVOCATE-NOTES.md 2>/dev/null
rm .planning/phases/${PHASE}-{slug}/${PHASE}-EXPLORER-NOTES.md 2>/dev/null
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
TeamDelete(team_name="phase-{padded_phase}-research")
```

Display:
```
>> Research complete (hybrid mode -- 3-perspective debate)
```

Continue to Step 5.

---

### Classic Research (Single Task)

**If USE_HYBRID=false OR FALLBACK_TO_CLASSIC=true:**

If `FALLBACK_TO_CLASSIC=true` after TeamCreate succeeded, call `TeamDelete()` first.

If `FALLBACK_TO_CLASSIC=true`, display: `[!] Hybrid mode failed, using classic research mode`

If recon was performed (Step 3.5), include `<recon_context>{RECON_CONTEXT}</recon_context>` after the `</context>` section in the prompt below.

```
Task(
  prompt="<objective>
Research implementation approach for Phase {phase}: {name}
</objective>

<context>
Phase description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Phase context: {context_md}
</context>

{If RECON_CONTEXT is set from Step 3.5:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>",
  subagent_type="gsd-phase-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — Display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>

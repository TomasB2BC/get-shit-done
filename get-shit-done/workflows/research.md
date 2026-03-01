<purpose>
Research any topic using GSD's full research engine (recon + hybrid debate) without needing a phase.
Takes a topic or question instead of a phase number. Output goes to .planning/research/<slug>/.
</purpose>

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

## Step 0: Resolve Model Profile

```bash
RESEARCHER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-phase-researcher --raw)
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

## Step 1: Parse Topic and Create Output Directory

**If no arguments:** Error -- topic required.
```
ERROR: Topic required
Usage: /gsd:research <topic or question>
Example: /gsd:research WebSocket vs SSE for real-time updates
```

**Extract topic from $ARGUMENTS:**

```bash
TOPIC="$ARGUMENTS"
SLUG=$(node ~/.claude/get-shit-done/bin/gsd-tools.js generate-slug "$TOPIC" --raw)
RESEARCH_DIR=".planning/research/${SLUG}"
mkdir -p "$RESEARCH_DIR"
```

Display:
```
>> Researching: {TOPIC}
>> Output: {RESEARCH_DIR}/
```

## Step 2: Check Existing Research

```bash
ls "${RESEARCH_DIR}/RESEARCH.md" 2>/dev/null
```

**If exists:** Offer: 1) Re-research, 2) View existing, 3) Cancel.
**If doesn't exist:** Continue.

## Step 3: Gather Context

No ROADMAP or REQUIREMENTS lookup. Instead, gather general project context:

```bash
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null)
PROJECT_CONTENT=$(cat .planning/PROJECT.md 2>/dev/null | head -50)
DECISIONS=$(grep -A20 "### Decisions" .planning/STATE.md 2>/dev/null)
```

## Step 3.5: Explorer Recon (Optional)

**Auto-skip checks:**

```bash
# Skip condition 1: Recon already completed (reuse existing)
RECON_EXISTS=$(ls "${RESEARCH_DIR}/recon/RECON.md" 2>/dev/null | wc -l)

# Skip condition 2: Config toggle off (default true -- recon runs unless explicitly disabled)
EXPLORER_RECON=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"explorer_recon"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")

if [ "$EXPLORER_RECON" = "false" ] || [ "$RECON_EXISTS" -gt 0 ]; then
  SKIP_REASON="config off"
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
mkdir -p "${RESEARCH_DIR}/recon"
```

Spawn 3 parallel Tasks. Each MUST use `subagent_type="Explore"`.
**NOTE:** Explore agents are read-only (no Write tool). They return their digest as the Task result. The orchestrator captures return values and writes RECON.md.

| Role | Question |
|------|----------|
| problem-space | "What is the core problem or question here: '{TOPIC}'? What existing code, files, or project context is directly relevant?" |
| ecosystem-scan | "What patterns, tools, conventions, or prior work already exist in this codebase that relate to: '{TOPIC}'?" |
| constraint-finder | "What are the constraints for '{TOPIC}': existing code to integrate with, config patterns, non-obvious limits, things that must stay compatible?" |

Each probe prompt follows:
```
Task(
  prompt="You are a field recon explorer. Your job is narrow: answer ONE question.

Question: [specific question from table above]

Topic: {TOPIC}
Project context: {PROJECT_CONTENT first 50 lines}

Resources: read local project files only (.planning/, relevant source files).
Do NOT do web research -- that is reserved for the full research team.

Return a 200-400 word digest. No padding. Dense and actionable.
Focus: facts the research team needs to start well-oriented.",
  subagent_type="Explore",
  description="Recon probe: [role]"
)
```

**Step R2: Capture probe results from Task return values**

Store each Task's return value as PROBE_PROBLEM, PROBE_ECOSYSTEM, PROBE_CONSTRAINTS.

**Step R3: Write RECON.md from captured results**

Use the 3 captured probe results to fill the RECON.md template:

```markdown
# Recon: {TOPIC}

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
PROBLEM: [2-3 sentence dense summary]
EXISTING: [key existing code/patterns directly relevant]
CONSTRAINTS: [non-obvious limits]
NOT-ABOUT: [what the researcher should NOT spend time discovering]
TEAM-HINT: [composition_hint value + 1-sentence rationale]
</recon_injection>
```

Write to `${RESEARCH_DIR}/recon/RECON.md`.

**Step R4: (no cleanup needed -- probes return via Task result, no files to delete)**

**Step R5: Human checkpoint for team composition (or auto-decide in agent mode)**

Same as plan-phase.md Stage 4.5 -- read composition_hint, present checkpoint or auto-decide, store SELECTED_COMPOSITION.

**Step R6: Store recon context**

```bash
RECON_CONTEXT=$(sed -n '/<recon_injection>/,/<\/recon_injection>/p' "${RESEARCH_DIR}/recon/RECON.md")
```

**Step R7: Map composition to spawn list**

Same mapping table as plan-phase.md.

## Step 4: Spawn Researcher

**Detect orchestration mode:**

```bash
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
    USE_HYBRID=true
  fi
fi
```

Display banner:
```
>> RESEARCHING: {TOPIC}
```

### Hybrid Research (Agent Teams -- 3-Perspective Debate)

**If USE_HYBRID=true:**

```
>> Using Agent Teams for research (hybrid mode)
>> 3-round debate protocol
```

**Step H1: Create research team**

```bash
TEAM_SLUG=$(echo "$SLUG" | cut -c1-20)
TEAM_NAME="research-${TEAM_SLUG}"
```

```
TeamCreate(
  team_name="${TEAM_NAME}",
  description="Research: ${TOPIC}"
)
```

If fails, set FALLBACK_TO_CLASSIC=true.

**Step H2: Spawn researcher teammates**

If recon was performed, use RECON_SPAWN_LIST for roles. Otherwise default 3-role team.

Each teammate prompt uses TOPIC instead of phase description:

**Optimist:**
```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>${TEAM_NAME}</team_name>
<role>optimist</role>

{If AGENT_MODE=true, include auto_mode block}

<objective>
Research: {TOPIC}
Answer: 'What do I need to know about this topic?'
Focus: Established patterns, practical approaches, what works well.
</objective>

<context>
Topic: {TOPIC}
Project context: {PROJECT_CONTENT}
Prior decisions: {DECISIONS}
</context>

{If RECON_CONTEXT is set:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: ${RESEARCH_DIR}/RESEARCH.md
</output>",
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research (optimist): ${TOPIC}",
  team_name="${TEAM_NAME}",
  name="optimist"
)
```

**Devil's Advocate:** Same pattern, role=devil's-advocate, output to `${RESEARCH_DIR}/ADVOCATE-NOTES.md`

**Explorer:** Same pattern, role=explorer, output to `${RESEARCH_DIR}/EXPLORER-NOTES.md`

**Steps H3-H9: Same 3-round debate protocol as research-phase.md**

- H3: Wait for Round 1
- H4: Round 2 challenge exchange (devil's-advocate and explorer send challenges to optimist)
- H5: Wait for Round 2
- H6: Round 3 finalization (optimist incorporates, adds Dissenting Views section)
- H7: Clean up ADVOCATE-NOTES.md and EXPLORER-NOTES.md
- H8: Shutdown teammates
- H9: TeamDelete

Display: `>> Research complete (hybrid mode -- 3-perspective debate)`

Continue to Step 5.

---

### Classic Research (Single Task)

**If USE_HYBRID=false OR FALLBACK_TO_CLASSIC=true:**

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.

{If AGENT_MODE=true, include auto_mode block}

<objective>
Research: {TOPIC}
Answer: 'What do I need to know about this topic?'
</objective>

<context>
Topic: {TOPIC}
Project context: {PROJECT_CONTENT}
Prior decisions: {DECISIONS}
</context>

{If RECON_CONTEXT is set:}
<recon_context>
{RECON_CONTEXT}
</recon_context>

<output>
Write to: ${RESEARCH_DIR}/RESEARCH.md
</output>",
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research: ${TOPIC}"
)
```

## Step 5: Handle Return and Present Results

Display:
```
>> Research complete: ${RESEARCH_DIR}/RESEARCH.md

---

## >> What's Next

**Your research is at:** ${RESEARCH_DIR}/RESEARCH.md

**Options:**
- Review: cat ${RESEARCH_DIR}/RESEARCH.md
- If this should become a phase: /gsd:add-phase <description>
- If this informs a decision: /gsd:elevate-decision
- Research more: /gsd:research <follow-up topic>

---
```

</process>

<success_criteria>
- [ ] Topic parsed from arguments
- [ ] Output directory created at .planning/research/<slug>/
- [ ] Recon ran (if explorer_recon enabled)
- [ ] Research completed (hybrid or classic)
- [ ] RESEARCH.md written to output directory
- [ ] User knows where the output is and what to do next
</success_criteria>

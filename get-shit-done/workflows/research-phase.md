<purpose>
Research how to implement a phase. Spawns gsd-phase-researcher with phase context.

Standalone research command. For most workflows, use `/gsd:plan-phase` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

@C:\Users\tomas\.claude/get-shit-done/references/model-profile-resolution.md

Resolve model for:
- `gsd-phase-researcher`

## Step 1: Normalize and Validate Phase

@C:\Users\tomas\.claude/get-shit-done/references/phase-argument-parsing.md

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found: Error and exit.

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
```

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

Each with `<mode>teammate</mode>`, `<team_name>`, and `<role>` tags.

**Optimist (owns RESEARCH.md):**

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.

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

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>

<debate_protocol>
Round 1: Draft your research perspective
Round 2: Review teammates' ADVOCATE-NOTES.md and EXPLORER-NOTES.md, strengthen your analysis
Round 3: Finalize RESEARCH.md with a 'Dissenting Views / Risks & Alternatives' section incorporating teammate perspectives
</debate_protocol>",
  subagent_type="general-purpose",
  teammate_name="optimist",
  model="{researcher_model}",
  description="Research Phase {phase} (optimist perspective)"
)
```

**Devil's Advocate (owns ADVOCATE-NOTES.md -- temporary):**

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.

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

<output>
Write to: .planning/phases/${PHASE}-{slug}/ADVOCATE-NOTES.md
</output>

<debate_protocol>
Round 1: Draft your critical perspective
Round 2: Review teammates' RESEARCH.md and EXPLORER-NOTES.md, refine your challenges
(Round 3: Optimist incorporates your perspective -- you do not write in Round 3)
</debate_protocol>",
  subagent_type="general-purpose",
  teammate_name="devil's-advocate",
  model="{researcher_model}",
  description="Research Phase {phase} (devil's advocate perspective)"
)
```

**Explorer (owns EXPLORER-NOTES.md -- temporary):**

```
Task(
  prompt="First, read C:\Users\tomas\.claude/agents/gsd-phase-researcher.md for your role and instructions.

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

<output>
Write to: .planning/phases/${PHASE}-{slug}/EXPLORER-NOTES.md
</output>

<debate_protocol>
Round 1: Draft your exploratory perspective
Round 2: Review teammates' RESEARCH.md and ADVOCATE-NOTES.md, expand alternatives
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
ls .planning/phases/${PHASE}-{slug}/ADVOCATE-NOTES.md 2>/dev/null
ls .planning/phases/${PHASE}-{slug}/EXPLORER-NOTES.md 2>/dev/null
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
rm .planning/phases/${PHASE}-{slug}/ADVOCATE-NOTES.md 2>/dev/null
rm .planning/phases/${PHASE}-{slug}/EXPLORER-NOTES.md 2>/dev/null
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

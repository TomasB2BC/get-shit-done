<purpose>
Extract, validate, and propagate architectural decisions through a 6-pass pipeline.
The human has an intuition or seed idea. This skill extracts the full shape, validates it adversarially, and propagates it surgically across planning artifacts.

Always interactive -- this skill requires human in the loop by design.
Even when agent_mode=true, the extraction passes are never auto-decided.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/get-shit-done/references/ui-brand.md
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


## 1. Validate Environment

```bash
PLANNING_EXISTS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning --raw)
echo "$PLANNING_EXISTS"
```

**If not found:** Error -- run `/gsd:new-project` first.

**Detect agent mode** (informational only -- this skill is always interactive):

```bash
AGENT_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"agent_mode"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**Parse $ARGUMENTS for initial statement:**

After stripping --project flag in Step 0, the remaining $ARGUMENTS text (if any) is the initial decision statement for Pass 1. If empty, Pass 1 will prompt for one.

```bash
INITIAL_STATEMENT="$ARGUMENTS"
```

Display:
```
>> elevate-decision
>> 6-pass extraction pipeline
>> Always interactive -- human in the loop by design
```


## 2. Pass 1 -- Seed Understanding

```
>> Pass 1: Seed Understanding
>> "Where can I learn more?"
```

**Sub-step 2.1: Get initial statement**

If `$INITIAL_STATEMENT` is non-empty, use it as the seed. Otherwise, prompt the human:

```
What decision or architectural idea are you thinking about?
(A sentence or two is enough -- I will read the context.)
```

Wait for human response. Store as `SEED_STATEMENT`.

**Sub-step 2.2: Produce minimal draft**

Read the seed statement. Produce a MINIMAL first draft -- assume as little as possible, leave gaps visible with explicit `[?]` markers:

```
>> Draft Understanding (gaps marked with [?]):
   [Draft text with explicit [?] markers where information is missing or uncertain]

>> What I need to learn more about:
   - [gap 1 -- specific aspect that is unclear]
   - [gap 2 -- missing context]
   - [gap 3 -- assumption that needs verification]
```

**Sub-step 2.3: Ask for sources**

```
Where can I learn more? Point me to files, docs, prior conversations, or research.
(Or type "skip" if the draft is sufficient.)
```

Wait for human response.

**Sub-step 2.4: If human points to sources**

Parse the response for file paths, URLs, or document references. Spawn 1-3 parallel Explore Tasks to read those sources:

```bash
mkdir -p .scratch/elevate
```

```
Task(
  prompt="Read the following source and extract information relevant to this decision:

Decision seed: {SEED_STATEMENT}

Source to read: {source_path_or_reference}

Extract:
- Facts relevant to the decision
- Prior art or existing patterns
- Constraints or requirements mentioned
- Open questions or tensions

Write your findings to .scratch/elevate/pass1-probe-{N}.md",
  subagent_type="Explore",
  description="Pass 1 source reading: {source_name}"
)
```

Wait for all probes to complete.

**Sub-step 2.5: Produce grounded second draft**

Read all probe output files from `.scratch/elevate/pass1-probe-*.md`. Incorporate findings into a more complete draft:

```
>> Updated Understanding (after reading sources):
   [More complete draft incorporating source findings, still showing any remaining [?] gaps]

>> Remaining gaps (if any):
   - [gap still unresolved]
```

**Sub-step 2.6: Clean up**

```bash
rm .scratch/elevate/pass1-probe-*.md 2>/dev/null
```

**Sub-step 2.7: If human said "skip"**

The first draft stands as-is. Proceed to Pass 2 with gaps noted.


## 3. Pass 2 -- Landscape Integrity Check

```
>> Pass 2: Landscape Integrity Check
>> "Fix the ground before building on it"
```

**Sub-step 3.1: Explain purpose**

Display:
```
Before writing this decision into planning docs, let me verify they are accurate.
```

**Sub-step 3.2: Invoke integrity-check**

Call the integrity-check skill via SlashCommand:

```
SlashCommand("/gsd:integrity-check")
```

Wait for integrity-check to complete. It will return one of:
- `## INTEGRITY CHECK PASSED` -- no gaps found
- `## INTEGRITY CHECK COMPLETE` -- gaps found and handled
- `## INTEGRITY CHECK BLOCKED` -- critical gaps need investigation

**Sub-step 3.3: Report and continue**

**If PASSED:**
```
>> Planning docs are clean. Continuing with extraction.
```

**If COMPLETE:**
```
>> Fixed {N} gaps. Planning docs are now current. Continuing with extraction.
```

**If BLOCKED:**
```
>> [!] Integrity check found critical gaps that need investigation.
>> Review the gaps above, then type "continue" to proceed with extraction anyway,
>> or resolve the gaps first and re-run /gsd:elevate-decision.
```

Wait for human response if BLOCKED. If human says "continue", proceed. Otherwise, halt.


## 4. Pass 3 -- Deep Dig

```
>> Pass 3: Deep Dig
>> "Extracting the full shape of the decision"
```

**Sub-step 4.1: Generate question set**

Based on the seed understanding from Pass 1, generate a set of 5 questions. Each question targets a specific aspect of the decision that is unclear, under-specified, or has multiple valid approaches.

Each question has 3-4 lettered pre-digested options (informed by context and sources) plus a "write your own" option:

```
## Deep Dig: Question Set {round}

**Q1: [Question about a specific aspect of the decision]**
  a) [Pre-digested option informed by context -- 1 sentence]
  b) [Pre-digested option -- 1 sentence]
  c) [Pre-digested option -- 1 sentence]
  d) Write your own

**Q2: [Question about another aspect]**
  a) [Pre-digested option -- 1 sentence]
  b) [Pre-digested option -- 1 sentence]
  c) [Pre-digested option -- 1 sentence]
  d) Write your own

**Q3: [Question]**
  a) [Option]
  b) [Option]
  c) [Option]
  d) Write your own

**Q4: [Question]**
  a) [Option]
  b) [Option]
  c) [Option]
  d) Write your own

**Q5: [Question]**
  a) [Option]
  b) [Option]
  c) [Option]
  d) Write your own

---
>> Which questions would you like to answer? (e.g., "1a, 2b, 3-custom, 5c" or "all")
>> For any, you can pick a letter OR write a custom response.
>> Type "enough" if you feel the picture is complete.
```

**Sub-step 4.2: Parse response**

Parse the human's selections:
- Letter selections (e.g., "1a") -- record the pre-digested answer
- Custom responses (e.g., "3-custom: my custom answer") -- record verbatim
- Skipped questions -- note as still open
- "all" -- prompt for each question sequentially
- "enough" -- proceed to Pass 4

Update the decision understanding based on all answers.

**Sub-step 4.3: Recursive branching check**

After processing answers, check if any answer surfaced a SECOND decision -- a distinct architectural choice that emerged during the discussion but is not the current focus.

If a branching decision is detected:

```
>> I'm hearing a second decision here: "[name of branching decision]"
   a) Explore now (nested extraction -- Passes 3-6 for this branch)
   b) Park as todo (/gsd:add-todo with full context)
   c) Note it and continue (capture in decision record, don't interrupt)
```

Wait for human response.

**If human selects "a" (explore now):**
- Enter nested extraction loop: Passes 3-6 for the branching decision
- Display depth marker: `>> [Branch: {child-name}]`
- Nested branches are limited to 1 level deep -- if the child branch itself surfaces a third decision, force it to option "b" (park as todo)
- When branch completes, display: `>> Resuming main decision: {parent-name}` and continue the main flow

**If human selects "b" (park as todo):**
- Call `/gsd:add-todo` via SlashCommand with full context about the branching decision
- Continue main flow

**If human selects "c" (note and continue):**
- Capture the branching decision name and brief description in the decision record's "Connections" section
- Continue main flow

**Sub-step 4.4: Loop control**

After each question set round, evaluate:

**If human said "enough":** Proceed to Pass 4.

**If AI assesses "full picture"** (all [?] gaps from Pass 1 are resolved, understanding is internally consistent, no contradictions):

```
>> I think I have the full picture. Here is my current understanding:
   [2-3 paragraph summary of the decision as currently understood]

>> Continue with more questions or move to boundaries (Pass 4)?
```

Wait for human response. If confirmed, proceed to Pass 4. If "more questions", generate next set.

**Otherwise:** Generate the next question set, informed by all prior answers. Focus new questions on:
- Aspects revealed by previous answers
- Remaining [?] gaps
- Tensions or contradictions between answers
- Implications not yet addressed

Repeat from Sub-step 4.1.

**Sub-step 4.5: Maximum rounds**

After 5 question-set rounds without the human saying "enough", proactively suggest:

```
>> We have covered significant ground across 5 rounds. I recommend moving to boundaries (Pass 4).
>> Continue digging or proceed?
```

Wait for human response. Respect their choice -- if they want more rounds, continue.


## 5. Pass 4 -- Boundaries
<!-- Plan 19-03 implements this section -->
<!-- Same question-set pattern as Pass 3 but focused on edge cases and scope -->
<!-- Output: "This decision governs [X, Y, Z]. Does NOT govern [A, B, C]." -->


## 6. Pass 5 -- Stress Test
<!-- Plan 19-03 implements this section -->
<!-- Adversarial challenge: strongest counterargument + 5 attack-angle questions -->
<!-- Always run -- no shortcuts, no --trusted flag -->


## 7. Pass 6 -- Crystallization + Close
<!-- Plan 19-03 implements this section -->
<!-- Final statement, structured record, edit target discovery, batch execution -->
<!-- Commit with provenance, rollback offer -->


## 8. Session Complete
<!-- Plan 19-03 implements this section -->
<!-- Final summary display -->


</process>

<context_efficiency>
Orchestrator runs all passes sequentially in a single session (interactive). Explore probes in Pass 1 get fresh context. integrity-check in Pass 2 runs as a full separate command invocation via SlashCommand. The interactive nature means context accumulates naturally across passes -- this is intentional since the human conversation IS the context.
</context_efficiency>

<failure_handling>
- **Pass 1 probe fails:** Report which source could not be read. Continue with available probe outputs. Note gaps in draft.
- **Pass 2 integrity-check fails:** Report the error. Offer to skip integrity check and continue. Note that planning docs were not verified.
- **Human stops mid-session:** All progress is lost (no intermediate persistence). The human can re-run with their accumulated context.
- **Recursive branch goes too deep:** Force park-as-todo at depth > 1. Display: "This branch has its own branches -- parking as a todo for a separate session."
</failure_handling>

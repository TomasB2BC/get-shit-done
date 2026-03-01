<purpose>
Extract, validate, and propagate architectural decisions through a 6-pass pipeline.
The human has an intuition or seed idea. This skill extracts the full shape, validates it adversarially, and propagates it surgically across planning artifacts.

Always interactive -- this skill requires human in the loop by design.
Even when agent_mode=true, the extraction passes are never auto-decided.
</purpose>

<tool_rule>
CRITICAL: After EVERY AskUserQuestion call, STOP your response immediately.
Do NOT generate any follow-up text, analysis, or actions in the same response.
The AskUserQuestion tool call must be the LAST thing in your response.
Wait for the user's selection before generating your next response.
This prevents the tool from auto-resolving before the user sees it.
</tool_rule>

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
# Agent mode only activates during /gsd:auto sessions (runtime marker)
AGENT_MODE=$( [ -f .planning/.auto-dispatch-active ] && echo "true" || echo "false")
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

Each question has 3 pre-digested options (informed by context and sources). AskUserQuestion adds "Other" automatically for custom responses.

**Present questions using AskUserQuestion (batch of 4, then 1):**

First batch (4 questions):
```
AskUserQuestion:
  questions:
    - header: "Deep Dig {round}"
      question: "[Question about a specific aspect of the decision]"
      multiSelect: false
      options:
        - label: "[Pre-digested option A]"
          description: "[1 sentence explanation informed by context]"
        - label: "[Pre-digested option B]"
          description: "[1 sentence explanation]"
        - label: "[Pre-digested option C]"
          description: "[1 sentence explanation]"
    - header: "Deep Dig {round}"
      question: "[Question about another aspect]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Deep Dig {round}"
      question: "[Question 3]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Deep Dig {round}"
      question: "[Question 4]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
```

Second batch (1 question + continue signal):
```
AskUserQuestion:
  questions:
    - header: "Deep Dig {round}"
      question: "[Question 5]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Continue?"
      question: "More questions or is the picture complete?"
      multiSelect: false
      options:
        - label: "More questions"
          description: "Generate another round of questions"
        - label: "Enough"
          description: "Picture is complete, move to boundaries"
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

If a branching decision is detected, present via AskUserQuestion:

```
AskUserQuestion:
  questions:
    - header: "Branch detected"
      question: "I'm hearing a second decision: '[name of branching decision]'. How should we handle it?"
      multiSelect: false
      options:
        - label: "Explore now"
          description: "Nested extraction -- Passes 3-6 for this branch"
        - label: "Park as todo"
          description: "Save to /gsd:add-todo with full context for later"
        - label: "Note and continue"
          description: "Capture in decision record, don't interrupt current flow"
```

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

```
>> Pass 4: Boundaries
>> "What does this govern? What doesn't it touch?"
```

**Sub-step 5.1: Generate edge-case question set**

Based on the decision understanding from Passes 1-3, generate a set of 5 edge-case questions. Each tests the scope boundary: "Does this also apply to X?", "Does this override Y?", "What happens when Z?"

**Present boundary questions using AskUserQuestion (same batching as Pass 3):**

First batch (4 questions):
```
AskUserQuestion:
  questions:
    - header: "Boundaries"
      question: "[Edge case: does this apply to X?]"
      multiSelect: false
      options:
        - label: "Applies"
          description: "[applies to this case because...]"
        - label: "Does not apply"
          description: "[does NOT apply because...]"
        - label: "Partially"
          description: "[partially applies with conditions...]"
    - header: "Boundaries"
      question: "[Edge case: does this override existing behavior Y?]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Boundaries"
      question: "[Edge case: what happens at boundary condition Z?]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Boundaries"
      question: "[Edge case: interaction with adjacent system/decision]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
```

Second batch (1 question + continue signal):
```
AskUserQuestion:
  questions:
    - header: "Boundaries"
      question: "[Edge case: temporal -- does this apply retroactively?]"
      multiSelect: false
      options:
        - label: "[Option A]"
          description: "[explanation]"
        - label: "[Option B]"
          description: "[explanation]"
        - label: "[Option C]"
          description: "[explanation]"
    - header: "Continue?"
      question: "More boundary questions or are the edges clear?"
      multiSelect: false
      options:
        - label: "More questions"
          description: "Explore more edge cases"
        - label: "Clear"
          description: "Boundaries are defined, move to scope statement"
```

**Sub-step 5.2: Parse responses**

Parse the human's selections (same parsing logic as Pass 3). Update scope understanding based on answers.

**If human says "clear":** Skip remaining boundary questions and proceed to scope statement.

**Sub-step 5.3: Loop control**

After each boundary round, evaluate:
- If all scope questions are addressed or human says "clear" -- proceed to scope statement
- If more edge cases need exploration -- generate another round
- Maximum 3 rounds for boundaries (tighter than Deep Dig's 5 -- boundaries are more constrained)

After 3 rounds without "clear" signal:
```
>> 3 rounds of boundary questions complete. Generating scope statement.
```

**Sub-step 5.4: Produce scope statement**

Based on all boundary answers, produce a clean scope statement:

```
>> Scope Statement:
   This decision governs:
   - [X -- specific domain, system, or behavior]
   - [Y -- specific domain, system, or behavior]
   - [Z -- specific domain, system, or behavior]

   This decision does NOT govern:
   - [A -- explicitly out of scope]
   - [B -- explicitly out of scope]
   - [C -- explicitly out of scope]

>> Confirm scope or adjust?
```

Wait for human response.

**Sub-step 5.5: Confirmation**

If human confirms: Store the final scope statement for Pass 6 crystallization.
If human adjusts: Apply their adjustments to the scope statement, re-display, confirm again.


## 6. Pass 5 -- Stress Test

```
>> Pass 5: Stress Test
>> "The strongest case against this decision"
```

**IMPORTANT:** Always run the full stress test. No --trusted flag, no shortcuts, no skipping. Even well-debated decisions benefit from one adversarial pass.

**Sub-step 6.1: Construct counterargument**

Based on everything gathered in Passes 1-4, construct the strongest possible counterargument. This must be genuine, not a strawman:

```
>> The best case against this decision:
   [2-3 paragraph counterargument -- steel-man the opposition.
    Consider: what would a thoughtful skeptic say?
    What evidence supports NOT making this decision?
    What are the real costs and risks?]
```

**Sub-step 6.2: Present 5 attack-angle questions**

**Present attack angles using AskUserQuestion (batch of 4, then 1):**

First batch (4 attack angles):
```
AskUserQuestion:
  questions:
    - header: "Contradiction"
      question: "Does this contradict any existing decisions?"
      multiSelect: false
      options:
        - label: "[Specific contradiction]"
          description: "[contradiction identified with existing decision X]"
        - label: "No contradiction"
          description: "[compatible because...]"
        - label: "Partial tension"
          description: "[tension with Y but manageable because...]"
    - header: "Scalability"
      question: "Will this hold up as the project grows?"
      multiSelect: false
      options:
        - label: "Scales well"
          description: "[scales well because...]"
        - label: "Needs revision later"
          description: "[will need revision at specific threshold]"
        - label: "Acceptable for now"
          description: "[does not scale, but acceptable for current scope]"
    - header: "Dependency Risk"
      question: "What breaks if a dependency changes?"
      multiSelect: false
      options:
        - label: "Low risk"
          description: "[dependencies are stable/minimal]"
        - label: "Specific risk"
          description: "[if X changes, then Y breaks]"
        - label: "Mitigated"
          description: "[risk exists but mitigated by...]"
    - header: "Opportunity Cost"
      question: "What are we giving up by choosing this?"
      multiSelect: false
      options:
        - label: "[Specific tradeoff]"
          description: "[alternative we are foregoing and why acceptable]"
        - label: "Minimal cost"
          description: "[no strong alternatives exist]"
        - label: "Significant but justified"
          description: "[cost of foregoing X but justified because...]"
```

Second batch (1 attack angle):
```
AskUserQuestion:
  questions:
    - header: "Second-Order"
      question: "What downstream changes does this force?"
      multiSelect: false
      options:
        - label: "[Specific effect]"
          description: "[downstream effect that needs attention]"
        - label: "No effects"
          description: "[no significant downstream effects expected]"
        - label: "Needs mitigation"
          description: "[downstream effects exist and need mitigation]"
```

Wait for human responses.

**Sub-step 6.3: Process attack results**

Parse responses. For each attack angle, evaluate whether it reveals a genuine weakness.

If any attack angle reveals a genuine weakness, present via AskUserQuestion:

```
AskUserQuestion:
  questions:
    - header: "Weakness found"
      question: "This challenge has merit: [brief description]. How should we handle it?"
      multiSelect: false
      options:
        - label: "Modify decision"
          description: "Update the decision to address this weakness"
        - label: "Accept risk"
          description: "Document the risk with rationale and proceed"
        - label: "Revisit Deep Dig"
          description: "Return to Pass 3 with this as a new constraint"
```

**If "a" (modify):** Update the decision understanding to incorporate the modification. Note the modification source (which attack angle prompted it).

**If "b" (accept risk):** Record the accepted risk with the human's rationale. This becomes part of the decision record in Pass 6.

**If "c" (revisit):** Return to Pass 3 (Deep Dig) with the new constraint as context. The constraint becomes an additional input to question generation.

**Sub-step 6.4: Stress test conclusion**

```
>> Stress test complete. Decision [survived intact | was modified to address {attack angle}].
>> Proceeding to crystallization.
```


## 7. Pass 6 -- Crystallization + Close

```
>> Pass 6: Crystallization + Close
>> "Record, propagate, commit"
```

**Sub-step 7.1: Present final decision statement**

Distill everything from Passes 1-5 into a crisp 1-3 sentence decision statement:

```
>> Final Decision Statement:
   [1-3 sentence crystallized decision -- precise, actionable, unambiguous]
```

**Sub-step 7.2: Present structured record**

```
## Decision Record: [Name]

**Statement:** [1-3 sentences -- what we decided]
**Rationale:** [What informed it -- research findings, discussion points, evidence from Passes 1-5]
**Provenance:** Session [YYYY-MM-DD], during [context -- phase discussion, research review, architecture planning, etc.]
**Scope:**
  - Governs: [from Pass 4 scope statement]
  - Does NOT govern: [from Pass 4 scope statement]
**Accepted Risks:** [from Pass 5, if any -- "None" if decision survived intact]
**Connections:** [Extends/modifies/supersedes which existing decisions, if any. Branching decisions noted in Pass 3, if any.]
**Date:** [YYYY-MM-DD]
```

**Sub-step 7.3: Human confirms**

```
>> Review the decision record above. Confirm or adjust before propagation.
```

Wait for human response. If adjustments requested, apply them and re-display. This is the final shape of the decision -- once confirmed, propagation begins.

**Sub-step 7.4: Edit target discovery**

Spawn 3-5 parallel Explore recon probes to discover which files need updates:

```bash
mkdir -p .scratch/elevate
```

**Probe A: PROJECT.md**
```
Task(
  prompt="You are an edit-target recon agent. Scan .planning/PROJECT.md for sections affected by this decision:

Decision: {final_decision_statement}
Scope: {governs_list} / Does NOT govern: {not_governs_list}

Look for:
- Key Decisions table -- does it need a new row?
- Kitchen model or architecture section -- does it reference this domain?
- Any section where this decision changes the current description

For each potential edit target, output:
TARGET: [file path]
SECTION: [heading or table name]
CURRENT: [what it currently says, brief quote]
PROPOSED: [what it should say after this decision]
CONFIDENCE: [HIGH | MEDIUM | LOW]

Write to: .scratch/elevate/pass6-targets-A.md
If PROJECT.md does not exist, write: NO TARGETS FOUND",
  subagent_type="Explore",
  description="Edit target discovery: PROJECT.md"
)
```

**Probe B: ROADMAP.md + STATE.md**
```
Task(
  prompt="You are an edit-target recon agent. Scan .planning/ROADMAP.md and .planning/STATE.md for sections affected by this decision:

Decision: {final_decision_statement}
Scope: {governs_list} / Does NOT govern: {not_governs_list}

Look for:
- ROADMAP.md phase descriptions that reference this domain
- STATE.md Accumulated Context / Decisions section
- STATE.md Pending Todos that this decision resolves
- Any claims that this decision supersedes or modifies

For each potential edit target, output:
TARGET: [file path]
SECTION: [heading or table name]
CURRENT: [what it currently says, brief quote]
PROPOSED: [what it should say after this decision]
CONFIDENCE: [HIGH | MEDIUM | LOW]

Write to: .scratch/elevate/pass6-targets-B.md",
  subagent_type="Explore",
  description="Edit target discovery: ROADMAP + STATE"
)
```

**Probe C: REQUIREMENTS.md + active PLAN.md files**
```
Task(
  prompt="You are an edit-target recon agent. Scan .planning/REQUIREMENTS.md and any active (incomplete) PLAN.md files for sections affected by this decision:

Decision: {final_decision_statement}
Scope: {governs_list} / Does NOT govern: {not_governs_list}

Look for:
- Requirements that this decision clarifies or constrains
- Plan assumptions that this decision changes
- Plan context sections that should reference this decision

For each potential edit target, output:
TARGET: [file path]
SECTION: [heading or table name]
CURRENT: [what it currently says, brief quote]
PROPOSED: [what it should say after this decision]
CONFIDENCE: [HIGH | MEDIUM | LOW]

Write to: .scratch/elevate/pass6-targets-C.md
If REQUIREMENTS.md does not exist, check for active plans only.",
  subagent_type="Explore",
  description="Edit target discovery: REQUIREMENTS + active plans"
)
```

**Probe D: MEMORY.md + other .planning/ root files** (only if MEMORY.md exists)
```
Task(
  prompt="You are an edit-target recon agent. Scan .planning/MEMORY.md and any other .planning/ root-level markdown files for sections affected by this decision:

Decision: {final_decision_statement}
Scope: {governs_list} / Does NOT govern: {not_governs_list}

Look for:
- Memory entries that this decision extends or modifies
- Any .planning/ file that discusses this domain
- Stale references that this decision supersedes

IMPORTANT: MEMORY.md edits are sensitive -- only propose HIGH confidence changes.

For each potential edit target, output:
TARGET: [file path]
SECTION: [heading or table name]
CURRENT: [what it currently says, brief quote]
PROPOSED: [what it should say after this decision]
CONFIDENCE: [HIGH | MEDIUM | LOW]

Write to: .scratch/elevate/pass6-targets-D.md
If MEMORY.md does not exist, scan other .planning/ root files only.",
  subagent_type="Explore",
  description="Edit target discovery: MEMORY + other planning files"
)
```

Wait for all probes to complete.

**Sub-step 7.5: Present edit targets with lettered options**

Read all probe output files. Deduplicate targets (same file + same section = one target). Filter out LOW confidence targets unless no HIGH/MEDIUM targets exist.

Present each target using AskUserQuestion (batches of up to 4 targets per call).

For each target, create one question with the target details in the question text and 3 options:

```
AskUserQuestion:
  questions:
    - header: "{file_path}"
      question: "{section name} -- Current: {brief quote}. Proposed: {proposed change}. Confidence: {HIGH|MEDIUM}"
      multiSelect: false
      options:
        - label: "Apply"
          description: "Apply this edit as proposed"
        - label: "Skip"
          description: "Do not modify this target"
        - label: "Adjust"
          description: "Apply with modifications (describe in Other)"
    [... up to 4 targets per AskUserQuestion call]
```

If more than 4 targets, batch into multiple AskUserQuestion calls (max 4 questions each).

Wait for human response to each batch before proceeding.

**CRITICAL: MEMORY.md edits require explicit human approval.** Never auto-apply MEMORY.md changes even if confidence is HIGH. Always present them for review.

**Sub-step 7.6: Execute approved edits**

For each target where human selected "a" (apply):
1. Read the target file
2. Read the surrounding content to calibrate style (column widths, heading format, list format, voice, detail level)
3. Apply the proposed edit using Edit tool -- MATCH the file's existing style
4. Track the changed file path

For each target where human selected "c" (adjust):
1. Apply the edit with the human's modification
2. Track the changed file path

For each target where human selected "b" (skip):
- No action needed

**Sub-step 7.7: Clean up probe files**

```bash
rm .scratch/elevate/pass6-targets-*.md 2>/dev/null
```

If `.scratch/elevate/` is empty:
```bash
rmdir .scratch/elevate/ 2>/dev/null
```

If `.scratch/` is empty:
```bash
rmdir .scratch/ 2>/dev/null
```

**Sub-step 7.8: Commit with provenance**

If any files were changed:

```bash
git add [all changed files]
git commit -m "docs: elevate decision -- [decision name] (source: [session context])"
```

The commit message MUST follow this format:
- Prefix: `docs: elevate decision --`
- Name: the decision name from the record
- Source: where this decision originated (e.g., "phase 19 discussion", "research review", "architecture planning")

**Sub-step 7.9: Display completion and rollback offer**

```
>> Decision crystallized and propagated.
   Changed {N} files: [list of file paths]
   Commit: [short hash]

   To undo: git revert HEAD
```

If no files were changed (all targets skipped):
```
>> Decision recorded but no planning docs were updated.
   The decision record is captured in this conversation.
   Run /gsd:elevate-decision again to propagate if needed.
```


## 8. Session Complete

```
>> elevate-decision complete.
   Decision: [decision name]
   Passes completed: 6/6
   Files updated: {N}

   The decision is now recorded and propagated across planning artifacts.
```


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

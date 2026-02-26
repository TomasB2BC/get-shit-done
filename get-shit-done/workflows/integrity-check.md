<purpose>
Cross-reference .planning/ document claims against ground truth sources (git history, actual file existence, phase directory contents, cross-references). Present gaps with lettered fix options. Batch corrections committed.

Callable standalone, from elevate-decision Pass 2, or from any workflow that needs doc freshness verification before proceeding.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
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


## 1. Validate Environment and Parse Flags

```bash
PLANNING_EXISTS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning --raw)
echo "$PLANNING_EXISTS"
```

**If not found:** Error -- run `/gsd:new-project` first.

**Detect agent mode:**

```bash
AGENT_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"agent_mode"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**Parse flags from $ARGUMENTS:**

```bash
SCOPE="all"
FIX_ALL=false

if echo "$ARGUMENTS" | grep -q '\-\-scope'; then
  SCOPE=$(echo "$ARGUMENTS" | grep -oP '(?<=--scope\s)\S+')
fi

if echo "$ARGUMENTS" | grep -q '\-\-fix-all'; then
  FIX_ALL=true
fi
```

Valid scope values: `all`, `state`, `roadmap`, `references`

Display:
```
>> Integrity Check
>> Scope: {SCOPE} | Agent mode: {AGENT_MODE} | Fix-all: {FIX_ALL}
```


## 2. Discover Evidence Sources

Do NOT hardcode paths. Use dynamic discovery to find what evidence is available:

```bash
# Git history (always available if in a git repo)
GIT_AVAILABLE=false
if git rev-parse --is-inside-work-tree 2>/dev/null; then
  GIT_AVAILABLE=true
  git log --oneline -30 2>/dev/null
fi

# Planning files
ls .planning/*.md 2>/dev/null
ls .planning/phases/*/*.md 2>/dev/null

# Session logs (discover location -- projects vary)
ls .planning/logs/ .planning/sessions/ logs/ 2>/dev/null

# Task/todo logs
ls .planning/tasks/ .planning/todos/ todos/ 2>/dev/null

# Project-specific files
ls .planning/config.json .planning/PROJECT.md .planning/REQUIREMENTS.md .planning/MEMORY.md 2>/dev/null
```

Build an evidence source inventory: which sources exist, which are available for cross-reference.


## 3. Spawn Parallel Recon Probes

Spawn 3-4 parallel `Task(subagent_type="Explore")` probes. Each probe answers ONE narrow question and writes structured findings to `.scratch/integrity/`.

**Scope filtering:** If `SCOPE` is not "all", only spawn the matching probe(s).

```bash
mkdir -p .scratch/integrity
```

**Probe A: State Accuracy** (scope: `all` or `state`)

```
Task(
  prompt="You are a state-accuracy recon probe. Your job is to cross-reference STATE.md claims against evidence.

Read .planning/STATE.md. For each factual claim, check against evidence:
- 'Current Position' phase/plan numbers -- compare against actual phase directories: ls .planning/phases/
- 'Status' claims -- compare against actual PLAN.md and SUMMARY.md file counts
- 'Last activity' dates -- compare against: git log --oneline -10
- 'Progress' percentage -- verify math against plan counts
- 'Pending Todos' -- verify items listed match actual state
- 'Next action' -- verify it makes sense given current state

For each discrepancy found, output in this EXACT format:
GAP: [description of discrepancy]
CLAIM: [what STATE.md says]
EVIDENCE: [what reality shows]
SEVERITY: [stale | missing | inaccurate | minor]
FIX: [proposed correction -- be specific about what text to change]
---

Write your findings to .scratch/integrity/probe-state.md
If no gaps found, write: NO GAPS FOUND",
  subagent_type="Explore",
  description="Integrity probe: state accuracy"
)
```

**Probe B: Roadmap Alignment** (scope: `all` or `roadmap`)

```
Task(
  prompt="You are a roadmap-alignment recon probe. Your job is to cross-reference ROADMAP.md claims against evidence.

Read .planning/ROADMAP.md. For each phase entry, check:
- Plan counts (e.g., '3 plans') -- compare against actual PLAN.md files: ls .planning/phases/{phase-dir}/*-PLAN.md
- Completion checkmarks [x] vs [ ] -- compare against actual SUMMARY.md files: ls .planning/phases/{phase-dir}/*-SUMMARY.md
- Completion dates -- compare against git log for commits mentioning that phase
- Status column in Progress table -- compare against actual plan/summary counts
- Plan list entries (19-01-PLAN.md etc.) -- verify files actually exist

For each discrepancy found, output in this EXACT format:
GAP: [description of discrepancy]
CLAIM: [what ROADMAP.md says]
EVIDENCE: [what reality shows]
SEVERITY: [stale | missing | inaccurate | minor]
FIX: [proposed correction -- be specific about what text to change]
---

Write your findings to .scratch/integrity/probe-roadmap.md
If no gaps found, write: NO GAPS FOUND",
  subagent_type="Explore",
  description="Integrity probe: roadmap alignment"
)
```

**Probe C: Cross-References** (scope: `all` or `references`)

```
Task(
  prompt="You are a cross-reference recon probe. Your job is to verify that file references in planning docs point to files that actually exist.

Scan all PLAN.md files in .planning/phases/ for:
- @-references in <context> sections -- verify each referenced file exists
- execution_context @-references -- verify each referenced file exists
- files_modified entries in frontmatter -- note these as 'to be created' (not gaps unless plan is marked complete)
- key_links 'from' and 'to' paths -- verify both endpoints exist (for completed plans only)

Also check:
- .planning/STATE.md references to other files (SESSION.md, PROJECT.md, etc.)
- .planning/ROADMAP.md references to archive files or other docs

For each broken reference found, output in this EXACT format:
GAP: [description -- which file references what, and what is missing]
CLAIM: [the reference as written]
EVIDENCE: [file does not exist at that path / file exists but at different path]
SEVERITY: [stale | missing | inaccurate | minor]
FIX: [proposed correction -- remove reference, update path, or note as expected]
---

Write your findings to .scratch/integrity/probe-references.md
If no gaps found, write: NO GAPS FOUND",
  subagent_type="Explore",
  description="Integrity probe: cross-references"
)
```

**Probe D: Decision Currency** (scope: `all` only, and only if PROJECT.md exists)

```
Task(
  prompt="You are a decision-currency recon probe. Your job is to check whether KEY decisions in PROJECT.md are still current.

Read .planning/PROJECT.md (if it exists). Look for a Key Decisions table or section. For each decision:
- Check the date against recent git activity -- has the project evolved past this decision?
- Check if the decision references components or phases that have changed since it was recorded
- Look for contradictions between decisions and current ROADMAP.md phase descriptions

Also check:
- Are there decisions referenced in STATE.md 'Accumulated Context' that are NOT in PROJECT.md?
- Are there recent significant changes (new phases, completed milestones) with no corresponding decision record?

For each staleness signal found, output in this EXACT format:
GAP: [description of staleness or missing decision]
CLAIM: [what the decision says or what is missing]
EVIDENCE: [what current state shows]
SEVERITY: [stale | missing | inaccurate | minor]
FIX: [proposed correction or addition]
---

Write your findings to .scratch/integrity/probe-decisions.md
If no gaps found, write: NO GAPS FOUND",
  subagent_type="Explore",
  description="Integrity probe: decision currency"
)
```

Wait for all probes to complete.


## 4. Synthesize Gap Report

Read all probe output files from `.scratch/integrity/`:

```bash
cat .scratch/integrity/probe-state.md 2>/dev/null
cat .scratch/integrity/probe-roadmap.md 2>/dev/null
cat .scratch/integrity/probe-references.md 2>/dev/null
cat .scratch/integrity/probe-decisions.md 2>/dev/null
```

**If all probes report "NO GAPS FOUND":**

Display:
```
>> Integrity check complete -- no gaps found.
   All .planning/ claims match ground truth.
```

Skip to Step 8 (clean up) and return `## INTEGRITY CHECK PASSED`.

**Otherwise:**

Parse all GAP entries. Deduplicate (same file + same claim = one gap). Sort by severity:
1. `inaccurate` -- doc says something provably wrong
2. `stale` -- doc is outdated but was once true
3. `missing` -- expected content not present
4. `minor` -- cosmetic or low-impact discrepancy

Assign sequential letters to each gap. Present the gap report:

```
## Integrity Check: {N} Gaps Found

**Gap A: {description}**
  CLAIM: {what doc says}
  EVIDENCE: {what reality shows}
  Severity: {severity}

  a) Fix now -- {proposed correction}
  b) Park as todo
  c) Not actually a gap (misread)
  d) Needs investigation

**Gap B: {description}**
  CLAIM: {what doc says}
  EVIDENCE: {what reality shows}
  Severity: {severity}

  a) Fix now -- {proposed correction}
  b) Park as todo
  c) Not actually a gap (misread)
  d) Needs investigation

[... additional gaps ...]

---
>> Select for each gap (e.g., "Aa, Bb, Ca, Dc" or "all-a" to fix everything)
```


## 5. Collect Responses

**If AGENT_MODE=true OR FIX_ALL=true:**

Auto-select responses based on severity:
- `inaccurate` gaps: select "a" (fix now)
- `stale` gaps: select "a" (fix now)
- `missing` gaps: select "a" (fix now) if the fix is clearly defined, otherwise "d" (needs investigation)
- `minor` gaps: select "c" (not actually a gap / dismiss)

Log the auto-decision:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type approval --question "Integrity check: auto-fix {N} gaps" --options '["Fix all confirmed gaps"]' --raw
```

**If AGENT_MODE=false and FIX_ALL=false:**

Present the full gap report from Step 4. Prompt the human:
```
>> Select for each gap (e.g., "Aa, Bb, Ca, Dc" or "all-a" to fix everything)
```

Parse the response to determine action per gap.


## 6. Execute Fixes

**For each gap where response is "a" (fix now):**

1. Read the target file
2. Locate the specific claim that needs correction
3. Apply the proposed fix using Edit tool -- CRITICAL: match the target file's existing style (indentation, markdown formatting, column widths, voice, detail level)
4. Track the changed file path

```bash
# Example: fixing a stale plan count in ROADMAP.md
# Read surrounding context first to calibrate style
# Then apply surgical edit
```

**For each gap where response is "b" (park as todo):**

Create a todo entry with context about the gap:
- Description: the gap description
- Source: integrity-check probe finding
- Severity: from the gap

If `/gsd:add-todo` is available via SlashCommand, use it. Otherwise, append to STATE.md Pending Todos section directly.

**For each gap where response is "c" (not a gap):**

Skip -- no action needed.

**For each gap where response is "d" (needs investigation):**

Note in the final report. These are unresolved items.


## 7. Commit and Report

**If any files were changed:**

```bash
git add [all changed files]
git commit -m "chore: sync planning docs with reality"
```

**Display summary:**

```
>> Integrity check complete
   Gaps found: {total}
   Fixed: {count_a}
   Parked as todo: {count_b}
   Dismissed: {count_c}
   Needs investigation: {count_d}
```

**If no files were changed** (all gaps dismissed or parked):

```
>> Integrity check complete -- no fixes applied
   Gaps found: {total}
   Parked as todo: {count_b}
   Dismissed: {count_c}
   Needs investigation: {count_d}
```


## 8. Clean Up

Remove all probe output files:

```bash
rm -rf .scratch/integrity/ 2>/dev/null
```

If `.scratch/` directory is now empty, remove it too:

```bash
rmdir .scratch/ 2>/dev/null
```


## 9. Return Structured Result

Return one of three structured results based on outcome:

**If no gaps found OR all gaps resolved (fixed or dismissed):**
```
## INTEGRITY CHECK PASSED

All .planning/ claims verified against ground truth.
{Summary of any fixes applied}
```

**If gaps were found and some action was taken:**
```
## INTEGRITY CHECK COMPLETE

Gaps found: {N}
Fixed: {M} | Parked: {P} | Dismissed: {D} | Investigating: {I}
{List of investigation items if any}
```

**If critical gaps need investigation and cannot be auto-resolved:**
```
## INTEGRITY CHECK BLOCKED

{N} gaps require investigation before proceeding:
{List of investigation items with severity}
```


</process>

<context_efficiency>
Orchestrator: ~10% context for coordination. Recon probes: fresh context each via Task(subagent_type="Explore"). Probe files in .scratch/integrity/ are session-ephemeral and cleaned up after synthesis.
</context_efficiency>

<failure_handling>
- **Probe fails to write output:** Skip that probe's findings, continue with available probe outputs. Note the missing probe in final report.
- **No evidence sources found:** Report "No evidence sources available for cross-reference" and exit with PASSED (cannot disprove claims without evidence).
- **Git not available:** Probes that rely on git history skip those checks. State and roadmap probes still check file existence.
- **Edit fails:** Report which file could not be edited. Offer manual fix instructions.
</failure_handling>

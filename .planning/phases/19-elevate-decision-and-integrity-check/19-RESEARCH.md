# Phase 19: Elevate Decision + Integrity Check - Research

**Researched:** 2026-02-26
**Domain:** GSD skill authoring (markdown command + workflow files, recon agent orchestration)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two skills, shared architecture: integrity-check (standalone, reusable) and elevate-decision (6-pass pipeline that calls integrity-check as Pass 2)
- Skill layer separation: superpower (Pass 1 extraction, Pass 5 adversarial), GSD command (Pass 2 integrity, Pass 4 boundaries, Pass 6 propagation), standalone (integrity-check)
- The 6-pass pipeline: seed understanding, landscape integrity check, deep dig, boundaries, stress test, crystallization+close
- Lettered options (a, b, c, d) for ALL human interaction -- avoids AskUserQuestion auto-select collision with numbers
- Integrity-check interaction: parallel recon agents scan, gaps with lettered fix options (fix/park/not-gap/investigate), batch corrections committed
- Ground truth sources discovered (not hardcoded): git history, session logs, session digests, task logs, running system evidence
- Edit target discovery (not hardcoded): recon agents scan .planning/ to find sections referencing the decision's domain
- Recursive branching: nested decision extraction during Deep Dig with park-as-todo option via /gsd:add-todo
- Style-matched edits: each propagated edit matches target file's existing voice, format, column widths, detail level
- Provenance in commits: `docs: elevate decision -- [name] (source: [session/research])` for elevate-decision, `chore: sync planning docs with reality` for integrity-check
- Existing verification commands (verify-work, audit-milestone, verify-phase) are complementary, NOT replaced

### Claude's Discretion
- How to structure the command .md files (single file per skill vs command + workflow split)
- Recon agent spawn strategy (how many, what scope per agent)
- How to persist state across 6 passes within a single session (context threading vs intermediate files)
- Whether to add CLI commands to gsd-tools.js for lettered option handling or handle entirely in markdown
- Exact format of the structured decision record in Pass 6
- How to detect and present the "full picture" signal in Pass 3 (AI judgment vs explicit criteria)
- How deeply to integrate with existing GSD agent definitions vs creating new agent files

### Deferred Ideas (OUT OF SCOPE)
- Automated integrity-check scheduling
- Decision database / index beyond PROJECT.md Key Decisions table
- Multi-project integrity checking
- Agent Teams orchestration (use Task sub-agents from Phase 18 pattern)
- Per-pass skip flags (always challenge, no shortcuts)
- Integration with auto-dispatch (interactive-only by nature)
- SendMessage-based lead routing for decision approval
- Persistent decision provenance database
- Template system for decision records
</user_constraints>

## Summary

Phase 19 builds two new GSD skills that are fundamentally **orchestrator-style markdown commands** -- the same category as plan-phase, discuss-phase, and verify-work. The domain is not external library research; it is internal architecture: how GSD command files, workflow files, and agent definitions interconnect, and how to compose them for a multi-pass interactive pipeline.

The key architectural challenge is that elevate-decision is the most complex single-session interactive workflow in GSD to date. Its 6-pass pipeline must maintain conversation state across passes, spawn parallel recon agents at multiple points (Pass 1 source reading, Pass 2 integrity scan, Pass 6 edit target discovery), and handle recursive branching when secondary decisions surface. The integrity-check skill is simpler but must be both standalone AND callable as a sub-step within elevate-decision.

**Primary recommendation:** Use the command + workflow split pattern (command .md provides frontmatter + routing; workflow .md contains the full process logic). Create two command files, two workflow files, and NO new agent definition files -- reuse Explore subagent_type for all recon probes.

## Standard Stack

### Core (GSD Internal Patterns)

| Pattern | Reference | Purpose | Why Standard |
|---------|-----------|---------|--------------|
| Command + workflow split | `commands/gsd/plan-phase.md` + `workflows/plan-phase.md` | Command frontmatter routes to workflow process | Every complex GSD skill uses this pattern; keeps command files clean |
| Task(subagent_type="Explore") | Phase 18 plan-phase.md Stage 4.5 | Parallel recon agent spawning | Established pattern -- lightweight, no web research, focused probes |
| Lettered options via AskUserQuestion | `commands/gsd/discuss-phase.md` | User interaction with letter choices | AskUserQuestion is the standard GSD user-interaction tool |
| gsd-tools.js utilities | `bin/gsd-tools.js` | verify-path-exists, find-phase, state load, auto-decide | Consistent CLI interface for all workflows |
| AGENT_MODE detection | `config.json` agent_mode field | Branch between interactive and auto-decide paths | All workflows detect this to handle both modes |

### Supporting

| Pattern | Reference | Purpose | When to Use |
|---------|-----------|---------|-------------|
| Project Resolution (Step 0) | `workflows/plan-phase.md` Step 0 | --project flag handling | First step in both command workflows |
| Git commit with provenance | `references/git-integration.md` | Structured commit messages | After integrity fixes (integrity-check) and decision propagation (Pass 6) |
| SlashCommand tool | `commands/gsd/progress.md` | Calling one GSD skill from another | Pass 2 of elevate-decision calling /gsd:integrity-check |
| STATE.md updates | `workflows/add-todo.md` | Persisting accumulated context | After decision crystallization (Pass 6) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Command + workflow split | Single command file with inline process | Single-file simpler but gets unwieldy at 500+ lines; plan-phase.md workflow is 900+ lines |
| Task(Explore) recon agents | Task(general-purpose) agents | general-purpose can edit files but recon only needs read access; Explore is cheaper and prevents drift |
| AskUserQuestion for lettered options | Custom CLI tool in gsd-tools.js | AskUserQuestion already works; adding CLI tool adds maintenance without clear benefit |
| SlashCommand for Pass 2 call | Inline integrity-check logic in elevate-decision workflow | Breaks reusability -- integrity-check must be standalone |

## Architecture Patterns

### Recommended File Structure

```
commands/gsd/
  integrity-check.md          # Command frontmatter + routing
  elevate-decision.md         # Command frontmatter + routing

get-shit-done/workflows/
  integrity-check.md          # Full process logic for integrity scanning
  elevate-decision.md         # Full process logic for 6-pass pipeline
```

### Pattern 1: Command + Workflow Split (Mandatory)

**What:** Command .md files contain frontmatter (name, description, argument-hint, allowed-tools) + `<objective>`, `<execution_context>`, `<context>`, `<process>` sections. The `<execution_context>` references the workflow file. The `<process>` delegates entirely to the workflow.

**When to use:** Always for GSD skills with non-trivial process logic.

**Example (from plan-phase.md):**
```markdown
---
name: gsd:plan-phase
description: Create detailed execution plan for a phase (PLAN.md) with verification loop
argument-hint: "[--project <alias>] [phase] [--research] [--skip-research] [--gaps] [--skip-verify]"
agent: gsd-planner
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - mcp__context7__*
---
<objective>
...
</objective>
<execution_context>
@~/.claude/get-shit-done/workflows/plan-phase.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>
<process>
Execute the plan-phase workflow from @~/.claude/get-shit-done/workflows/plan-phase.md end-to-end.
</process>
```

### Pattern 2: Parallel Recon Agent Spawning (Phase 18 Established)

**What:** Spawn multiple Task(subagent_type="Explore") agents in parallel, each answering ONE narrow question. Wait for all to complete. Synthesize results.

**When to use:** When multiple independent read-only investigations are needed before proceeding.

**Example (from plan-phase.md Stage 4.5):**
```markdown
Task(
  prompt="You are a field recon explorer. Your job is narrow: answer ONE question.
  Question: What is the core technical problem for this phase?
  ...
  Write your digest to: ${PHASE_DIR}/recon/probe-problem.md",
  subagent_type="Explore",
  description="Recon probe: problem-space"
)
```

**For integrity-check:** Spawn 3-5 parallel probes: git-history scanner, planning-doc scanner, session-log scanner, state-claim verifier, cross-reference matcher.

**For elevate-decision Pass 1:** Spawn 2-3 parallel probes to read sources the human points to.

**For elevate-decision Pass 6:** Spawn 3-5 parallel probes to identify edit targets in .planning/ files.

### Pattern 3: Interactive Question-Set Loop (New Pattern for This Phase)

**What:** Present N questions with lettered pre-digested options. Human selects which to answer, picks options or writes custom. Loop until "enough" or "full picture" signal.

**When to use:** Passes 3, 4, and 5 of elevate-decision.

**Architecture:** This is a conversation loop, not a sub-agent spawn. The orchestrator LLM generates questions, presents them, reads responses, and loops. No Task spawning needed for the question loop itself.

**Key design:** Use AskUserQuestion with a structured prompt showing lettered options. Parse the response to determine which questions were answered and what options were selected.

**State management:** The question-answer history accumulates in the conversation context. No intermediate files needed -- the LLM maintains state across loop iterations within a single session.

### Pattern 4: Sub-Skill Invocation via SlashCommand

**What:** One GSD command calling another as a sub-step.

**When to use:** Pass 2 of elevate-decision calling /gsd:integrity-check.

**Caveat:** The SlashCommand tool is listed in progress.md's allowed-tools. Elevate-decision must include SlashCommand in its allowed-tools list. The integrity-check command will run inline in the same session context, which is correct -- its results (fixed docs) persist before the pipeline continues.

### Anti-Patterns to Avoid

- **Spawning Task agents for interactive loops:** Passes 3, 4, 5 are conversation loops, NOT sub-agent spawns. The human is in the loop -- you cannot delegate human interaction to a sub-agent.
- **Hardcoding file paths in integrity-check:** The design explicitly says "discovered, not hardcoded" for both ground truth sources and edit targets. Recon agents scan to find relevant files.
- **Creating new agent definition files:** The existing Explore subagent_type and general-purpose type cover all needs. No gsd-integrity-checker.md or gsd-decision-extractor.md needed.
- **Intermediate state files between passes:** The 6-pass pipeline runs in a single session. Conversation context is the state mechanism. Writing intermediate files creates cleanup burden with no benefit.
- **Numbered options:** The design mandates letters (a, b, c, d). This is a hard requirement to avoid AskUserQuestion auto-select collision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User interaction with choices | Custom prompt formatting | AskUserQuestion with lettered options | Standard GSD interaction tool, handles agent mode branching |
| Recon agent orchestration | Custom agent spawn logic | Task(subagent_type="Explore") pattern from Phase 18 | Proven, tested, handles failures gracefully |
| Git commit with message | Manual git commands | gsd-tools.js commit (or direct git via Bash with structured message) | Consistent commit message formatting |
| Phase directory resolution | Manual path construction | gsd-tools.js find-phase | Handles padding, slug generation, edge cases |
| Agent mode detection | Custom config parsing | config.json agent_mode field + standard grep pattern | Every workflow uses this same detection |

**Key insight:** Both new skills are orchestrators -- they coordinate reads, writes, user interactions, and sub-agent probes. The orchestration patterns already exist in plan-phase.md, discuss-phase.md, and verify-work.md. Reuse these patterns, don't invent new coordination mechanisms.

## Common Pitfalls

### Pitfall 1: Context Window Exhaustion in 6-Pass Pipeline
**What goes wrong:** The 6-pass pipeline accumulates significant context: initial statement, integrity-check results, multiple question-answer rounds (Passes 3, 4, 5), and edit target analysis. A complex decision could exhaust the context window.
**Why it happens:** Each pass adds to the conversation. Passes 3 and 4 can loop multiple times. Pass 6 reads and presents multiple file sections.
**How to avoid:** Keep each question set focused (5 questions max per round). Summarize prior pass results before starting the next pass. The workflow should include explicit summarization steps between passes.
**Warning signs:** Responses getting shorter or less detailed in later passes. Loss of early context.

### Pitfall 2: Integrity-Check Scope Creep
**What goes wrong:** Integrity-check tries to validate everything -- code correctness, test coverage, deployment state -- instead of focusing on planning doc claims vs evidence.
**Why it happens:** The concept of "ground truth" is broad. Without clear boundaries, recon agents will scan irrelevant evidence.
**How to avoid:** Scope recon probes narrowly: "Does STATE.md's claimed phase status match git history?" not "Is the deployment healthy?" The integrity-check workflow must define probe scopes explicitly.
**Warning signs:** Probes returning findings about code quality rather than doc accuracy.

### Pitfall 3: Recursive Branching Depth Explosion
**What goes wrong:** During Pass 3 Deep Dig, a branching decision spawns its own Passes 3-6, which surfaces another branch, which surfaces another. The session becomes unmanageable.
**Why it happens:** The design allows recursive branching with no explicit depth limit.
**How to avoid:** Limit recursive depth to 1 level (branch decisions get Passes 3-6 but cannot themselves branch further -- they park as todos). Display depth indicator: "[Branch: child-decision]" vs "[Main: parent-decision]".
**Warning signs:** More than 2 active decision contexts in a single session.

### Pitfall 4: Style-Matched Edit Drift
**What goes wrong:** The "style-matched" edit requirement leads to over-engineering. The AI tries to perfectly mimic file voice and fails, producing neither its natural style nor the file's style.
**Why it happens:** Style matching is a soft requirement -- there is no algorithm for "voice matching."
**How to avoid:** Read the existing section/row format, match column widths and detail level (measurable), match heading style and list format (measurable). Accept that voice matching has limits -- functional accuracy matters more.
**Warning signs:** Edits that look noticeably different from surrounding content.

### Pitfall 5: SlashCommand Invocation Context Loss
**What goes wrong:** When elevate-decision calls /gsd:integrity-check via SlashCommand, the integrity-check runs in the same session but may not have access to all the context the 6-pass pipeline has accumulated.
**Why it happens:** SlashCommand invocation resets the command context -- the called command reads its own workflow file and starts fresh.
**How to avoid:** Before calling integrity-check, ensure any context needed by integrity-check is available in .planning/ files (which it will read) rather than only in conversation memory. Pass 2 should explicitly state what integrity-check should focus on.
**Warning signs:** Integrity-check scanning irrelevant files or missing the decision domain.

## Architecture Recommendations (Claude's Discretion Areas)

### File Structure: Command + Workflow Split (RECOMMENDED)

**Rationale:** Every complex GSD skill (plan-phase, discuss-phase, verify-work, execute-phase) uses this split. The command file is 20-40 lines of frontmatter + routing. The workflow file contains the full process logic (200-900 lines). This keeps command files scannable while allowing detailed process documentation.

**Structure:**
```
commands/gsd/integrity-check.md    (~25 lines)
commands/gsd/elevate-decision.md   (~30 lines)
workflows/integrity-check.md       (~300 lines estimated)
workflows/elevate-decision.md      (~600 lines estimated)
```

### Recon Agent Strategy: Purpose-Scoped Probes (RECOMMENDED)

**For integrity-check (3-5 probes):**

| Probe | Scope | Output |
|-------|-------|--------|
| git-state | Compare STATE.md phase/plan status claims against git log | List of status mismatches |
| roadmap-alignment | Compare ROADMAP.md plan counts and completion claims against actual phase directories | List of count/status mismatches |
| cross-reference | Check that files referenced in plans, research, context actually exist | List of broken references |
| decision-currency | Compare PROJECT.md Key Decisions dates against recent git activity | List of potentially stale decisions |

**For elevate-decision Pass 1 (2-3 probes):** Determined dynamically based on what the human points to -- these are not pre-defined.

**For elevate-decision Pass 6 (3-5 probes):**

| Probe | Scope | Output |
|-------|-------|--------|
| decision-table | Scan PROJECT.md Key Decisions for related entries | Proposed edit or new row |
| roadmap-impact | Scan ROADMAP.md for phases affected by the decision | Proposed description updates |
| state-context | Scan STATE.md for accumulated context that should reference the decision | Proposed context note |
| plan-references | Scan active PLAN.md files for superseded assumptions | List of affected plans |
| requirements-impact | Scan REQUIREMENTS.md for requirements affected by the decision | Proposed requirement updates |

### State Persistence: Conversation Context (RECOMMENDED)

**Rationale:** The 6-pass pipeline runs in a single interactive session. The LLM maintains full context across passes. Writing intermediate state files creates cleanup overhead and the files would be session-ephemeral anyway.

**Exception:** Pass 6 crystallization output (the structured decision record) should be captured in a temporary format before propagation begins, so the user can review before edits execute. This can be displayed inline rather than written to a file.

### Lettered Option Handling: Markdown in AskUserQuestion (RECOMMENDED)

**Rationale:** No gsd-tools.js changes needed. Format lettered options as markdown within the AskUserQuestion prompt. Parse the response as text. The letters are a UX convention, not a technical mechanism.

**Format:**
```
a) [Pre-digested option with context]
b) [Pre-digested option with context]
c) [Pre-digested option with context]
d) Write your own: [describe what kind of answer]
```

### Decision Record Format (RECOMMENDED)

Based on the existing PROJECT.md Key Decisions table pattern:

```markdown
## Decision Record: [Name]

**Statement:** [1-3 sentences -- what we decided]
**Rationale:** [What informed it -- research, discussion, evidence]
**Provenance:** [Session date, phase context, conversation source]
**Scope:**
- Governs: [X, Y, Z]
- Does NOT govern: [A, B, C]
**Connections:** [Extends/modifies which existing decisions]
**Date:** [YYYY-MM-DD]
```

### Full Picture Signal: Combined AI Judgment + User Opt-Out (RECOMMENDED)

**For Pass 3 "full picture" detection:**
- AI signals when it believes coverage is sufficient: "I think I have the full picture. Here is my understanding: [summary]. Want to continue or is this enough?"
- Human can always say "enough" or "give me another set" regardless of AI assessment
- After 3 question-set rounds without new substantive information, AI should proactively suggest wrapping up

### Agent Integration: No New Agent Files (RECOMMENDED)

**Rationale:** The existing Explore subagent_type covers all recon probe needs. The orchestrator LLM (running the workflow) handles the interactive passes (3, 4, 5) directly. No new agent definition files needed.

## Code Examples

### Integrity-Check Command File Pattern
```markdown
---
name: gsd:integrity-check
description: Cross-reference planning docs against ground truth sources
argument-hint: "[--project <alias>] [--scope <planning|state|all>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
---
<objective>
Cross-reference .planning/ claims against evidence sources (git history, logs, system state).
Present gaps with lettered fix options. Batch corrections and commit.
</objective>
<execution_context>
@~/.claude/get-shit-done/workflows/integrity-check.md
</execution_context>
<process>
Execute the integrity-check workflow end-to-end.
</process>
```

### Elevate-Decision Command File Pattern
```markdown
---
name: gsd:elevate-decision
description: Extract, validate, and propagate architectural decisions through 6-pass pipeline
argument-hint: "[--project <alias>] [optional initial statement]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - SlashCommand
---
<objective>
6-pass decision extraction pipeline: seed understanding, integrity check,
deep dig, boundaries, stress test, crystallization+close.
</objective>
<execution_context>
@~/.claude/get-shit-done/workflows/elevate-decision.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>
<process>
Execute the elevate-decision workflow end-to-end.
</process>
```

### Recon Probe Spawn Pattern (Integrity-Check)
```markdown
Task(
  prompt="You are an integrity recon agent. Your job is narrow: answer ONE question.

Question: Does STATE.md's reported phase status and plan completion counts
match the actual git history and phase directory contents?

Scan:
- .planning/STATE.md (claims about current phase, plan counts, completion status)
- .planning/ROADMAP.md (claimed plan counts per phase)
- .planning/phases/ (actual directories and files)
- git log --oneline -20 (recent commit evidence)

Write a gap report (200-400 words) to: ${SCRATCH_DIR}/probe-state-accuracy.md
Format: one gap per line, structured as:
CLAIM: [what the doc says]
EVIDENCE: [what reality shows]
VERDICT: [accurate | stale | missing]",
  subagent_type="Explore",
  description="Integrity probe: state accuracy"
)
```

### Lettered Options Interaction Pattern
```markdown
## Deep Dig: Question Set 1

Based on your initial statement and context research, here are 5 questions:

**Q1: How should integrity-check handle files it cannot parse?**
a) Skip with warning -- report "could not parse [file], skipping"
b) Fail the check -- any unparseable file is itself an integrity issue
c) Best-effort extraction -- pull what you can, flag uncertainty
d) Write your own approach

**Q2: Should the stress test (Pass 5) be skippable for trivial decisions?**
a) Never skip -- the design says "always challenge, no shortcuts"
b) Allow skip with --quick flag for simple naming/formatting decisions
c) Auto-skip if the decision affects fewer than 2 files
d) Write your own approach

[Q3-Q5...]

---
>> Which questions would you like to answer? (e.g., "1, 3, 5" or "all")
>> For each, pick a letter or write your own.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual decision propagation | elevate-decision 6-pass pipeline | Phase 19 (new) | Eliminates manual file-by-file editing after decisions surface |
| No doc integrity checking | integrity-check parallel recon | Phase 19 (new) | Catches stale docs before they mislead new sessions |
| Numbered option lists | Lettered option lists | Phase 19 (new, AskUserQuestion collision fix) | Prevents auto-select collision when user adds notes to selections |

## Open Questions

1. **SlashCommand Availability**
   - What we know: SlashCommand is listed as allowed-tool in progress.md but not in most other commands
   - What's unclear: Whether SlashCommand works reliably when called from within a workflow (not just from a command file)
   - Recommendation: Test SlashCommand invocation of integrity-check early in development. If unreliable, implement integrity-check as an inline workflow step that reads the integrity-check.md workflow directly rather than invoking the command

2. **AskUserQuestion in Agent Mode**
   - What we know: In agent mode, AskUserQuestion calls auto-decide. But elevate-decision is interactive by nature.
   - What's unclear: Should elevate-decision even support agent mode? The design says "interactive-only (requires human in the loop by nature)"
   - Recommendation: Include AGENT_MODE detection but make elevate-decision always interactive (ignore agent mode for this skill). Integrity-check should support agent mode for its fix-option selection (auto-fix all gaps).

3. **Recursive Branch State Management**
   - What we know: Parent decision pauses, child branch runs Passes 3-6, parent resumes
   - What's unclear: How to signal "resume parent" cleanly in the conversation flow
   - Recommendation: Use explicit markers: ">> [Branch: child-name] starting..." and ">> [Branch: child-name] complete. Resuming [parent-name]..." with indented output for the branch

## Sources

### Primary (HIGH confidence)
- `commands/gsd/plan-phase.md` -- command file pattern reference (inspected directly)
- `get-shit-done/workflows/plan-phase.md` -- workflow process pattern, Stage 4.5 recon agent pattern (inspected directly)
- `commands/gsd/discuss-phase.md` -- interactive questioning pattern reference (inspected directly)
- `commands/gsd/verify-work.md` -- command frontmatter pattern (inspected directly)
- `agents/gsd-phase-researcher.md` -- agent definition pattern (inspected directly)
- `docs/plans/2026-02-26-elevate-decision-design.md` -- approved design document (inspected directly)
- `.planning/phases/19-elevate-decision-and-integrity-check/19-CONTEXT.md` -- user decisions (inspected directly)
- `.planning/phases/18-explorer-recon-step-for-research/18-01-PLAN.md` -- Phase 18 recon pattern (inspected directly)

### Secondary (MEDIUM confidence)
- Existing GSD command inventory (29 commands, 31 workflows) -- structural pattern analysis

## Metadata

**Confidence breakdown:**
- Standard stack (GSD patterns): HIGH -- directly inspected 8+ reference files
- Architecture (file structure, recon agents): HIGH -- follows established Phase 18 patterns
- Pitfalls: MEDIUM -- context window exhaustion and recursive depth are theoretical concerns based on design complexity, not observed failures
- Interaction patterns (lettered options, question loops): MEDIUM -- new pattern for GSD, based on design doc requirements

**Research date:** 2026-02-26
**Valid until:** Indefinite (internal architecture, not external dependencies)

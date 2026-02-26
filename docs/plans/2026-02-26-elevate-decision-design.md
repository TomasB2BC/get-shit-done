# Design: Elevate Decision + Integrity Check

**Date:** 2026-02-26
**Status:** Approved
**Source:** Brainstorming session from /gsd:check-todos >> todo #2

---

## Problem

When architectural decisions surface during discussions, research, or execution, there is no streamlined way to:

1. **Extract the full idea** from a human who has an intuition but can't write it all out
2. **Verify planning docs are accurate** before writing new decisions into them
3. **Propagate decisions surgically** across all relevant planning artifacts

The friction is multi-dimensional: planning docs drift from reality (STATE.md says "pending" when git shows "deployed"), decisions get partially captured, and downstream work (plans, execution) inherits stale assumptions.

**Real example:** During a `/gsd:discuss-phase 18` session in B2BC, the "Intelligence Escalation" principle emerged. It needed to propagate to PROJECT.md (Key Decisions table + kitchen model), MEMORY.md, and STATE.md. The human had to manually walk through each change. Meanwhile, STATE.md was lying about Phase 22.1 deployment status, which caused a new session to give wrong advice.

## Two Skills

### 1. `/gsd:integrity-check` (standalone, reusable)

Cross-references `.planning/` claims against ground truth sources. Finds gaps, presents fixes, batches corrections.

**Ground truth sources (project-agnostic discovery):**
- Git history (commits prove what was built/deployed)
- Daily session logs (if they exist -- skill asks "where are your logs?")
- Session digests (JSONL structured records)
- Task logs
- Running system evidence (deployment status, monitoring)

**Interaction pattern:**
- Parallel recon agents scan `.planning/` and evidence sources
- Gaps presented as a set with lettered options per gap:
  - a) Fix now (AI edits the stale doc)
  - b) Park as todo
  - c) Not actually a gap (AI misread)
  - d) Needs investigation
- Human skims and chooses fast
- Fixes batched and committed: `chore: sync planning docs with reality`

**Callable from:** elevate-decision (Pass 2), progress, plan-phase, or standalone.

**What GSD already has (not duplicated):**
- `verify-work` checks built features vs SUMMARY claims (code vs plans)
- `audit-milestone` checks requirements satisfaction at milestone scope
- `verify-phase` checks codebase against phase goals
- All are reactive (post-execution). integrity-check is continuous (are docs still true?).

### 2. `/gsd:elevate-decision` (extraction + propagation pipeline)

The human-to-AI knowledge transfer interface. Calls integrity-check as Pass 2.

**Architecture:** Superpower layer (extraction + adversarial) + GSD command (propagation).

## The 6-Pass Pipeline

### Pass 1: Seed Understanding

**Purpose:** Get oriented. The human has a seed idea -- the AI's job is to understand enough to know where to look.

**Steps:**
1. AI reads initial statement
2. AI produces a minimal draft -- assumes as little as possible, leaves gaps visible
3. AI asks: "Where can I learn more?" -- human points to repos, research files, docs, prior conversations
4. AI reads what the human pointed to (Explore agents, file reads)
5. AI produces a second draft grounded in real context

**Principle:** The human writes less, the AI reads more. The draft is not "deliberately imperfect" -- it's a first pass that the human fills in.

### Pass 2: Landscape Integrity Check

**Purpose:** Ensure planning docs are telling the truth before writing a new decision into them.

**Steps:**
1. Calls `/gsd:integrity-check` (standalone skill)
2. Recon agents cross-reference `.planning/` claims vs evidence sources
3. Gaps presented with lettered fix options
4. Human skims and approves fixes
5. Stale docs corrected and committed

**Principle:** You can't write a good decision into a document that's lying about current state. Fix the ground first.

### Pass 3: Deep Dig

**Purpose:** Extract the full shape of the idea through structured questioning.

**Interaction pattern:**
1. AI proposes a **set of 5 questions** based on its research and synthesis
2. Each question has **lettered pre-digested options** (a, b, c, d) -- AI's best guesses informed by context
3. Human **selects which questions to answer** (maybe all 5, maybe just 3)
4. Human **chooses options** (fast, low effort) or writes custom when none fit
5. AI processes answers, updates understanding
6. If human wants more: "give me another set" -- AI generates 5 more informed by previous answers
7. Loop until human says "enough" or AI says "I have the full picture"

**Principle:** Write little, skim fast, choose options, realize implications together. Recursive -- answers may generate new question sets.

**Why letters not numbers:** Avoids AskUserQuestion auto-select collision when human types "b, but also X" (number "2" would auto-select instead of capturing the note).

### Pass 4: Boundaries

**Purpose:** Define scope. Prevent over-application downstream.

**Interaction pattern:** Same as Pass 3 -- set of 5 edge-case questions with lettered options. Each tests: "Does this also apply to X?" or "Does this override Y?"

**Output:** Clean scope statement: "This decision governs [X, Y, Z]. Does NOT govern [A, B, C]."

**Principle:** A decision about cost controls shouldn't accidentally reshape the research workflow.

### Pass 5: Stress Test

**Purpose:** Adversarial challenge. Find the weak spot before propagation.

**Steps:**
1. AI constructs the strongest counterargument based on everything it read
2. AI presents it clearly: "The best case against this is..."
3. AI proposes 5 attack-angle questions with lettered options:
   - Contradiction with existing decisions
   - Scalability concern
   - Dependency risk
   - Opportunity cost
   - Second-order effects
4. Human selects and answers
5. Decision either survives stronger or gets modified

**Principle:** Always challenge. No shortcuts, no --trusted flag. Even well-debated decisions benefit from one final adversarial pass.

### Pass 6: Crystallization + Close

**Purpose:** Turn the extraction into a structured record, propagate, commit.

**Steps:**
1. AI presents the final decision statement (1-3 sentences, crisp)
2. AI shows the structured record:
   - **Decision statement** -- what we decided
   - **Rationale** -- what informed it (research, discussion, evidence)
   - **Provenance** -- which session, conversation, phase
   - **Scope** -- where it applies, where it doesn't (from Pass 4)
   - **Connections** -- extends/modifies which existing decisions
3. Human confirms or adjusts
4. Recon agents identify edit targets (which files, which sections)
5. AI presents edit targets with lettered options:
   - a) Apply this edit
   - b) Skip this target
   - c) Adjust the edit
6. Batch execute all approved edits (style-matched to each target file)
7. Git commit: `docs: elevate decision -- [name] (source: [session/research])`
8. Summary + rollback offer: "Changed N files. `git revert HEAD` to undo."

**Edit priority path (discovered, not hardcoded):**
Recon agents determine which files need updates. Common targets:
- PROJECT.md Key Decisions table
- ROADMAP.md phase descriptions (if decision changes scope/approach)
- REQUIREMENTS.md (if decision adds/modifies requirements)
- STATE.md accumulated context
- Active PLAN.md files (if they reference superseded assumptions)
- MEMORY.md (if warranted, with human approval)

**Style matching:** Each edit matches the target file's existing voice. AI reads existing rows/sections and follows the same format, column widths, and level of detail.

## Recursive Branching

During any pass (especially Pass 3 Deep Dig), the extraction may surface a second idea. When this happens:

1. AI names it: "I'm hearing a second decision here -- [name]"
2. Human chooses:
   - a) Explore now (enter a nested extraction loop)
   - b) Park as todo (`/gsd:add-todo` with full context)
   - c) Note it and continue (capture for later, don't interrupt flow)

Each branch that's explored now goes through its own Passes 3-6. The parent decision resumes where it left off.

## Skill Layers

| Layer | Owns | Reason |
|-------|------|--------|
| Superpower | Pass 1 (extraction dialogue), Pass 5 (adversarial challenge) | Project-agnostic patterns |
| GSD command | Pass 2 (integrity-check), Pass 4 (boundaries with .planning/ context), Pass 6 (propagation) | Needs .planning/ awareness |
| Standalone | integrity-check | Reusable from other workflows |

## Auditability

Every change carries provenance. The commit message references the decision name and source. The decision record in PROJECT.md includes rationale and date. STATE.md gets an accumulated context note. The trail is: conversation >> extraction >> crystallization >> commit >> planning docs.

## Key Design Principles

1. **Extraction is the core value** -- the human's time in the loop is the most valuable resource. Spend it fully.
2. **Write little, skim fast** -- pre-digested options, lettered choices, select-which-to-answer pattern.
3. **Fix the ground before building on it** -- integrity check before writing new decisions.
4. **Always challenge** -- adversarial stress test, no shortcuts.
5. **Surgical edits, not rewrites** -- each edit fits the target file's existing voice.
6. **Auditable trail** -- every change carries its reasoning and source.
7. **Recursive by nature** -- ideas branch, and the skill handles branching gracefully.

---

*Design approved 2026-02-26. Next: implementation planning via writing-plans skill.*

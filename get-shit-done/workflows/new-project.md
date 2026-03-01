<purpose>
Initialize a new project through unified flow: questioning, research (optional), requirements, roadmap. This is the most leveraged moment in any project — deep questioning here means better plans, better execution, better outcomes. One workflow takes you from idea to ready-for-planning.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

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

## 1. Setup

**MANDATORY FIRST STEP — Execute these checks before ANY user interaction:**

1. **Abort if project exists:**
   ```bash
   PROJECT_EXISTS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning/PROJECT.md --raw)
   [ "$PROJECT_EXISTS" = "true" ] && echo "ERROR: Project already initialized. Use /gsd:progress" && exit 1
   ```

2. **Initialize git repo in THIS directory** (required even if inside a parent repo):
   ```bash
   if [ -d .git ] || [ -f .git ]; then
       echo "Git repo exists in current directory"
   else
       git init
       echo "Initialized new git repo"
   fi
   ```

3. **Detect existing code (brownfield detection):**
   ```bash
   CODE_FILES=$(find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" 2>/dev/null | grep -v node_modules | grep -v .git | head -20)
   HAS_PACKAGE=$([ -f package.json ] || [ -f requirements.txt ] || [ -f Cargo.toml ] || [ -f go.mod ] || [ -f Package.swift ] && echo "yes")
   HAS_CODEBASE_MAP=$(node ~/.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning/codebase --raw)
   [ "$HAS_CODEBASE_MAP" = "true" ] && HAS_CODEBASE_MAP="yes"
   ```

   **You MUST run all bash commands above using the Bash tool before proceeding.**

4. **Detect agent mode:**
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

## 2. Brownfield Offer

**If existing code detected and .planning/codebase/ doesn't exist:**

Check the results from setup step:
- If `CODE_FILES` is non-empty OR `HAS_PACKAGE` is "yes"
- AND `HAS_CODEBASE_MAP` is NOT "yes"

**If AGENT_MODE=true:**

Auto-decide: Skip mapping (agent mode proceeds directly -- codebase mapping is a separate workflow that can run independently).

Log decision:
```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Map codebase first?" --options '["Skip mapping","Map codebase first"]' --raw
```

Continue to Step 3.

**If AGENT_MODE=false (classic):**

Use AskUserQuestion:
- header: "Existing Code"
- question: "I detected existing code in this directory. Would you like to map the codebase first?"
- options:
  - "Map codebase first" — Run /gsd:map-codebase to understand existing architecture (Recommended)
  - "Skip mapping" — Proceed with project initialization

**If "Map codebase first":**
```
Run `/gsd:map-codebase` first, then return to `/gsd:new-project`
```
Exit command.

**If "Skip mapping":** Continue to Step 3.

**If no existing code detected OR codebase already mapped:** Continue to Step 3.

## 3. Deep Questioning

**Display stage banner:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If AGENT_MODE=true:**

Synthesize project description from available context:

1. Check for existing project context files:
   ```bash
   [ -f .planning/PROJECT.md ] && HAS_PROJECT="yes"
   [ -f .planning/ROADMAP.md ] && HAS_ROADMAP="yes"
   [ -f AGENT-MODE-GSD.md ] && HAS_DESIGN_DOC="yes"
   ```

2. Read available context sources:
   - If PROJECT.md exists: read for brownfield project context
   - If ROADMAP.md exists: read for milestone context
   - If design docs exist (AGENT-MODE-GSD.md, etc.): read for project vision

3. Generate comprehensive project description synthesizing all available context. Focus on:
   - What is being built and why
   - Core value proposition
   - Key constraints or requirements already known
   - Milestone or phase context if this is subsequent milestone

4. Log the synthesis:
   ```bash
   node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
     --type freeform \
     --question "What do you want to build?" \
     --decision "[your synthesized description]" \
     --rationale "Synthesized from [list of source documents used]"
   ```

5. Use the synthesized description as if the user had provided it.

6. Skip the follow-up questioning loop -- proceed directly to Step 4 (Write PROJECT.md).

**If AGENT_MODE=false (classic):**

**Open the conversation:**

Ask inline (freeform, NOT AskUserQuestion):

"What do you want to build?"

Wait for their response. This gives you the context needed to ask intelligent follow-up questions.

**Follow the thread:**

Based on what they said, ask follow-up questions that dig into their response. Use AskUserQuestion with options that probe what they mentioned — interpretations, clarifications, concrete examples.

Keep following threads. Each answer opens new threads to explore. Ask about:
- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

Consult `questioning.md` for techniques:
- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Check context (background, not out loud):**

As you go, mentally check the context checklist from `questioning.md`. If gaps remain, weave questions naturally. Don't suddenly switch to checklist mode.

**Decision gate:**

**If AGENT_MODE=true:**

Auto-approve: Create PROJECT.md (agent mode always proceeds).

Skip the "Keep exploring" loop entirely.

**If AGENT_MODE=false (classic):**

When you could write a clear PROJECT.md, use AskUserQuestion:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to create PROJECT.md?"
- options:
  - "Create PROJECT.md" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

If "Keep exploring" — ask what they want to add, or identify gaps and probe naturally.

Loop until "Create PROJECT.md" selected.

## 4. Write PROJECT.md

Synthesize all context into `.planning/PROJECT.md` using the template from `templates/project.md`.

**For greenfield projects:**

Initialize requirements as hypotheses:

```markdown
## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope

- [Exclusion 1] — [why]
- [Exclusion 2] — [why]
```

All Active requirements are hypotheses until shipped and validated.

**For brownfield projects (codebase map exists):**

Infer Validated requirements from existing code:

1. Read `.planning/codebase/ARCHITECTURE.md` and `STACK.md`
2. Identify what the codebase already does
3. These become the initial Validated set

```markdown
## Requirements

### Validated

- ✓ [Existing capability 1] — existing
- ✓ [Existing capability 2] — existing
- ✓ [Existing capability 3] — existing

### Active

- [ ] [New requirement 1]
- [ ] [New requirement 2]

### Out of Scope

- [Exclusion 1] — [why]
```

**Key Decisions:**

Initialize with any decisions made during questioning:

```markdown
## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice from questioning] | [Why] | — Pending |
```

**Last updated footer:**

```markdown
---
*Last updated: [date] after initialization*
```

Do not compress. Capture everything gathered.

**Commit PROJECT.md:**

```bash
mkdir -p .planning
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "docs: initialize project" --files .planning/PROJECT.md
```

## 5. Workflow Preferences

**If AGENT_MODE=true:**

Use auto-decide for each preference with sensible agent-mode defaults:

```bash
# Read auto_scope from config for depth decision
AUTO_SCOPE=$(cat .planning/config.json 2>/dev/null | grep -o '"auto_scope"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "conservative")

# Mode: YOLO (auto-approve, just execute)
MODE=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "How do you want to work?" --options '["YOLO (Recommended)","Interactive"]' --raw)

# Depth: based on auto_scope setting
if [ "$AUTO_SCOPE" = "comprehensive" ]; then
  DEPTH="Comprehensive"
else
  DEPTH="Standard"
fi
node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision --type scope --question "How thorough should planning be?" --decision "$DEPTH" --rationale "Based on auto_scope=$AUTO_SCOPE setting"

# Execution: Parallel (always parallel in agent mode)
EXECUTION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Run plans in parallel?" --options '["Parallel (Recommended)","Sequential"]' --raw)

# Git Tracking: Yes (always track for audit trail)
GIT_TRACKING=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Commit planning docs to git?" --options '["Yes (Recommended)","No"]' --raw)
```

Map decisions to config values:
- Mode: "YOLO" -> `mode: "yolo"`, "Interactive" -> `mode: "interactive"`
- Depth: "Quick" -> `depth: "quick"`, "Standard" -> `depth: "standard"`, "Comprehensive" -> `depth: "comprehensive"`
- Execution: "Parallel" -> `parallelization: true`, "Sequential" -> `parallelization: false`
- Git Tracking: "Yes" -> `commit_docs: true`, "No" -> `commit_docs: false`

**If AGENT_MODE=false (classic):**

**Round 1 — Core workflow settings (4 questions):**

```
questions: [
  {
    header: "Mode",
    question: "How do you want to work?",
    multiSelect: false,
    options: [
      { label: "YOLO (Recommended)", description: "Auto-approve, just execute" },
      { label: "Interactive", description: "Confirm at each step" }
    ]
  },
  {
    header: "Depth",
    question: "How thorough should planning be?",
    multiSelect: false,
    options: [
      { label: "Quick", description: "Ship fast (3-5 phases, 1-3 plans each)" },
      { label: "Standard", description: "Balanced scope and speed (5-8 phases, 3-5 plans each)" },
      { label: "Comprehensive", description: "Thorough coverage (8-12 phases, 5-10 plans each)" }
    ]
  },
  {
    header: "Execution",
    question: "Run plans in parallel?",
    multiSelect: false,
    options: [
      { label: "Parallel (Recommended)", description: "Independent plans run simultaneously" },
      { label: "Sequential", description: "One plan at a time" }
    ]
  },
  {
    header: "Git Tracking",
    question: "Commit planning docs to git?",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Planning docs tracked in version control" },
      { label: "No", description: "Keep .planning/ local-only (add to .gitignore)" }
    ]
  }
]
```

**If AGENT_MODE=true:**

Use auto-decide defaults for workflow agents (always recommended in agent mode):

```bash
# Research: Yes (always research in agent mode)
RESEARCH=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type research --question "Research before planning each phase?" --options '["Yes (Recommended)","No"]' --raw)

# Plan Check: Yes (always verify plans)
PLAN_CHECK=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Verify plans will achieve their goals?" --options '["Yes (Recommended)","No"]' --raw)

# Verifier: Yes (always verify work)
VERIFIER=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Verify work satisfies requirements after each phase?" --options '["Yes (Recommended)","No"]' --raw)

# Model Profile: Balanced (default, can be overridden by config)
MODEL_PROFILE=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Which AI models for planning agents?" --options '["Balanced (Recommended)","Quality","Budget"]' --raw)
```

Map to config:
- Research: "Yes" -> `workflow.research: true`, "No" -> `workflow.research: false`
- Plan Check: "Yes" -> `workflow.plan_check: true`, "No" -> `workflow.plan_check: false`
- Verifier: "Yes" -> `workflow.verifier: true`, "No" -> `workflow.verifier: false`
- Model Profile: "Balanced" -> `model_profile: "balanced"`, "Quality" -> `model_profile: "quality"`, "Budget" -> `model_profile: "budget"`

**If AGENT_MODE=false (classic):**

**Round 2 — Workflow agents:**

These spawn additional agents during planning/execution. They add tokens and time but improve quality.

| Agent | When it runs | What it does |
|-------|--------------|--------------|
| **Researcher** | Before planning each phase | Investigates domain, finds patterns, surfaces gotchas |
| **Plan Checker** | After plan is created | Verifies plan actually achieves the phase goal |
| **Verifier** | After phase execution | Confirms must-haves were delivered |

All recommended for important projects. Skip for quick experiments.

```
questions: [
  {
    header: "Research",
    question: "Research before planning each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Investigate domain, find patterns, surface gotchas" },
      { label: "No", description: "Plan directly from requirements" }
    ]
  },
  {
    header: "Plan Check",
    question: "Verify plans will achieve their goals? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Catch gaps before execution starts" },
      { label: "No", description: "Execute plans without verification" }
    ]
  },
  {
    header: "Verifier",
    question: "Verify work satisfies requirements after each phase? (adds tokens/time)",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Confirm deliverables match phase goals" },
      { label: "No", description: "Trust execution, skip verification" }
    ]
  },
  {
    header: "Model Profile",
    question: "Which AI models for planning agents?",
    multiSelect: false,
    options: [
      { label: "Balanced (Recommended)", description: "Sonnet for most agents — good quality/cost ratio" },
      { label: "Quality", description: "Opus for research/roadmap — higher cost, deeper analysis" },
      { label: "Budget", description: "Haiku where possible — fastest, lowest cost" }
    ]
  }
]
```

Create `.planning/config.json` with all settings:

**If AGENT_MODE=true, include agent_mode and agent_mode_settings:**

```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "commit_docs": true|false,
  "model_profile": "quality|balanced|budget",
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  },
  "orchestration": "classic",
  "agent_teams": {
    "research": false,
    "debug": false,
    "verification": false,
    "codebase_mapping": false
  },
  "agent_mode": true,
  "agent_mode_settings": {
    "auto_scope": "conservative|comprehensive",
    "max_phases": null,
    "max_iterations_per_phase": 3
  }
}
```

**If AGENT_MODE=false, omit agent_mode fields:**

```json
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "commit_docs": true|false,
  "model_profile": "quality|balanced|budget",
  "workflow": {
    "research": true|false,
    "plan_check": true|false,
    "verifier": true|false
  },
  "orchestration": "classic",
  "agent_teams": {
    "research": false,
    "debug": false,
    "verification": false,
    "codebase_mapping": false
  }
}
```

**If commit_docs = No:**
- Set `commit_docs: false` in config.json
- Add `.planning/` to `.gitignore` (create if needed)

**If commit_docs = Yes:**
- No additional gitignore entries needed

**Commit config.json:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "chore: add project config" --files .planning/config.json
```

**Note:** Run `/gsd:settings` anytime to update these preferences.

## 5.1. Auto-Registration Check

Check if this project is a sub-project inside a parent project with existing `.planning/`:

```bash
# Check if parent directories have .planning/PROJECT.md (root project indicator)
PARENT_PLANNING=""
SEARCH_DIR=$(dirname "$(pwd)")
while [ "$SEARCH_DIR" != "/" ] && [ "$SEARCH_DIR" != "." ] && [ ${#SEARCH_DIR} -gt 2 ]; do
  if [ -f "$SEARCH_DIR/.planning/PROJECT.md" ]; then
    PARENT_PLANNING="$SEARCH_DIR/.planning"
    break
  fi
  SEARCH_DIR=$(dirname "$SEARCH_DIR")
done
```

**If sub-project detected (PARENT_PLANNING is non-empty):**

```bash
if [ -n "$PARENT_PLANNING" ]; then
  ALIAS=$(basename "$(pwd)")
  # Compute relative path from parent root to current .planning/
  RELATIVE_PLANNING=$(node -e "const path = require('path'); console.log(path.relative('$(dirname \"$PARENT_PLANNING\")', '$(pwd)/.planning').replace(/\\\\/g, '/'))")

  echo ">> Sub-project detected. Auto-registering as '$ALIAS'"
  echo ">> Parent project: $PARENT_PLANNING"

  # Register in parent's projects.json
  ORIG_DIR=$(pwd)
  cd "$(dirname "$PARENT_PLANNING")"
  REGISTER_RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.js register-project "$ALIAS" --dir "$RELATIVE_PLANNING" --raw)
  cd "$ORIG_DIR"

  if [ "$REGISTER_RESULT" = "registered" ] || [ "$REGISTER_RESULT" = "already_registered" ]; then
    echo "[OK] Registered as '$ALIAS' in $(dirname "$PARENT_PLANNING")/projects.json"
    echo "Use: /gsd:execute-phase 1 --project $ALIAS"
  else
    echo "[!] WARNING: Auto-registration failed: $REGISTER_RESULT"
    echo "You can register manually: /gsd:register-project"
  fi
fi
```

**If agent_mode=true and sub-project detected, log the decision:**

```bash
if [ "$AGENT_MODE" = "true" ] && [ -n "$PARENT_PLANNING" ]; then
  ORIG_DIR=$(pwd)
  cd "$(dirname "$PARENT_PLANNING")"
  node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
    --type freeform \
    --question "Should the new sub-project at $(basename "$ORIG_DIR") be auto-registered?" \
    --decision "Auto-registered as '$ALIAS' in parent projects.json" \
    --rationale "Sub-project detected (parent has .planning/PROJECT.md). Alias derived from directory name per CONTEXT.md locked decision."
  cd "$ORIG_DIR"
fi
```

**If no parent project detected:** Skip (this is a root-level project).

## 5.5. Resolve Model Profile

Read model profile for agent spawning:

```bash
RESEARCHER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-project-researcher --raw)
SYNTHESIZER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-research-synthesizer --raw)
ROADMAPPER_MODEL=$(node ~/.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-roadmapper --raw)
```

## 6. Research Decision

**If AGENT_MODE=true:**

```bash
DECISION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type research --question "Research the domain ecosystem before defining requirements?" --options '["Research first (Recommended)","Skip research"]' --raw)
```

Proceed based on decision (agent mode defaults to research).

**If AGENT_MODE=false (classic):**

Use AskUserQuestion:
- header: "Research"
- question: "Research the domain ecosystem before defining requirements?"
- options:
  - "Research first (Recommended)" — Discover standard stacks, expected features, architecture patterns
  - "Skip research" — I know this domain well, go straight to requirements

**If "Research first":**

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Researching [domain] ecosystem...
```

Create research directory:
```bash
mkdir -p .planning/research
```

**Determine milestone context:**

Check if this is greenfield or subsequent milestone:
- If no "Validated" requirements in PROJECT.md → Greenfield (building from scratch)
- If "Validated" requirements exist → Subsequent milestone (adding to existing app)

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
  # Step 4: Per-command toggle check (only when compound check passes)
  AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "WARNING: orchestration=hybrid but Agent Teams not available or research not enabled"
  echo "Falling back to classic mode (set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and agent_teams.research=true to enable)"
fi
```

**If USE_HYBRID=true: Hybrid Research (Agent Teams)**

Display hybrid indicator:
```
>> Using Agent Teams for collaborative research (hybrid mode)
>> 2-round debate protocol: draft+broadcast, challenge+finalize

>> Spawning 4 researchers as Agent Team...
  >> Stack research (with debate)
  >> Features research (with debate)
  >> Architecture research (with debate)
  >> Pitfalls research (with debate)
```

**Step H1: Create research team**

```
TeamCreate(
  team_name="project-research",
  description="Project research for [domain] - 4 researchers with 2-round debate"
)
```

If TeamCreate fails, display warning and set FALLBACK_TO_CLASSIC=true:
```
[!] WARNING: Agent Teams team creation failed, falling back to classic mode
```

**Step H2: Spawn 4 researcher teammates**

Spawn all 4 in parallel using Task with team_name and name parameters:

```
Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>project-research</team_name>
<dimension>stack</dimension>

<research_type>
Project Research -- Stack dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent -- same logic as classic mode]

Greenfield: Research the standard stack for building [domain] from scratch.
Subsequent: Research what's needed to add [target features] to an existing [domain] app. Don't re-research the existing system.
</milestone_context>

<question>
What's the standard 2025 stack for [domain]?
</question>

<project_context>
[PROJECT.md summary - core value, constraints, what they're building]
</project_context>

<downstream_consumer>
Your STACK.md feeds into roadmap creation. Be prescriptive:
- Specific libraries with versions
- Clear rationale for each choice
- What NOT to use and why
</downstream_consumer>

<quality_gate>
- [ ] Versions are current (verify with Context7/official docs, not training data)
- [ ] Rationale explains WHY, not just WHAT
- [ ] Confidence levels assigned to each recommendation
</quality_gate>

<output>
Write to: .planning/research/STACK.md
Use template: ~/.claude/get-shit-done/templates/research-project/STACK.md
Do NOT commit -- orchestrator commits all files.
</output>
", team_name="project-research", name="stack-researcher", subagent_type="general-purpose", model="{researcher_model}", description="Stack research with debate")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>project-research</team_name>
<dimension>features</dimension>

<research_type>
Project Research -- Features dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent -- same logic as classic mode]

Greenfield: What features do [domain] products have? What's table stakes vs differentiating?
Subsequent: How do [target features] typically work? What's expected behavior?
</milestone_context>

<question>
What features do [domain] products have? What's table stakes vs differentiating?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your FEATURES.md feeds into requirements definition. Categorize clearly:
- Table stakes (must have or users leave)
- Differentiators (competitive advantage)
- Anti-features (things to deliberately NOT build)
</downstream_consumer>

<quality_gate>
- [ ] Categories are clear (table stakes vs differentiators vs anti-features)
- [ ] Complexity noted for each feature
- [ ] Dependencies between features identified
</quality_gate>

<output>
Write to: .planning/research/FEATURES.md
Use template: ~/.claude/get-shit-done/templates/research-project/FEATURES.md
Do NOT commit -- orchestrator commits all files.
</output>
", team_name="project-research", name="features-researcher", subagent_type="general-purpose", model="{researcher_model}", description="Features research with debate")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>project-research</team_name>
<dimension>architecture</dimension>

<research_type>
Project Research -- Architecture dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent -- same logic as classic mode]

Greenfield: How are [domain] systems typically structured? What are major components?
Subsequent: How do [target features] integrate with existing [domain] architecture?
</milestone_context>

<question>
How are [domain] systems typically structured? What are major components?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your ARCHITECTURE.md informs phase structure in roadmap. Include:
- Component boundaries (what talks to what)
- Data flow (how information moves)
- Suggested build order (dependencies between components)
</downstream_consumer>

<quality_gate>
- [ ] Components clearly defined with boundaries
- [ ] Data flow direction explicit
- [ ] Build order implications noted
</quality_gate>

<output>
Write to: .planning/research/ARCHITECTURE.md
Use template: ~/.claude/get-shit-done/templates/research-project/ARCHITECTURE.md
Do NOT commit -- orchestrator commits all files.
</output>
", team_name="project-research", name="architecture-researcher", subagent_type="general-purpose", model="{researcher_model}", description="Architecture research with debate")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<mode>teammate</mode>
<team_name>project-research</team_name>
<dimension>pitfalls</dimension>

<research_type>
Project Research -- Pitfalls dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent -- same logic as classic mode]

Greenfield: What do [domain] projects commonly get wrong? Critical mistakes?
Subsequent: What are common mistakes when adding [target features] to [domain]?
</milestone_context>

<question>
What do [domain] projects commonly get wrong? Critical mistakes?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your PITFALLS.md prevents mistakes in roadmap/planning. For each pitfall:
- Warning signs (how to detect early)
- Prevention strategy (how to avoid)
- Which phase should address it
</downstream_consumer>

<quality_gate>
- [ ] Pitfalls are specific to this domain (not generic advice)
- [ ] Prevention strategies are actionable
- [ ] Phase mapping included where relevant
</quality_gate>

<output>
Write to: .planning/research/PITFALLS.md
Use template: ~/.claude/get-shit-done/templates/research-project/PITFALLS.md
Do NOT commit -- orchestrator commits all files.
</output>
", team_name="project-research", name="pitfalls-researcher", subagent_type="general-purpose", model="{researcher_model}", description="Pitfalls research with debate")
```

If fewer than 2 teammates spawn successfully, set FALLBACK_TO_CLASSIC=true. If 2-3 spawn, continue with available teammates and fill gaps later with classic Task.

**Step H3: Wait for Round 1 completion**

**IMPORTANT: The orchestrator MUST wait here. Do NOT start writing or modifying any research files.**

After spawning, wait for all 4 teammates to complete Round 1. Idle notifications are delivered automatically as conversation turns when teammates stop after broadcasting. Wait until all 4 teammates have gone idle, then verify all 4 draft files exist:

```bash
ls .planning/research/STACK.md .planning/research/FEATURES.md .planning/research/ARCHITECTURE.md .planning/research/PITFALLS.md
```

**Partial failure handling:** If 2+ researchers succeeded (files exist), continue Round 2 for successful researchers only. After synthesis, fill gaps for missing dimensions using classic Task subagents. If 0-1 researchers succeeded, set FALLBACK_TO_CLASSIC=true and clean up team.

**Step H4: Prompt Round 2**

Send a message to each active teammate:

```
SendMessage(
  type="message",
  recipient="stack-researcher",
  content="Round 1 complete. All teammates have broadcast their findings. Begin Round 2: Review your teammates' broadcasts. Send direct challenges (contradictions) or reinforcements (alignments) to specific teammates. Then revise and finalize STACK.md. Stop when your file is finalized.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="features-researcher",
  content="Round 1 complete. All teammates have broadcast their findings. Begin Round 2: Review your teammates' broadcasts. Send direct challenges (contradictions) or reinforcements (alignments) to specific teammates. Then revise and finalize FEATURES.md. Stop when your file is finalized.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="architecture-researcher",
  content="Round 1 complete. All teammates have broadcast their findings. Begin Round 2: Review your teammates' broadcasts. Send direct challenges (contradictions) or reinforcements (alignments) to specific teammates. Then revise and finalize ARCHITECTURE.md. Stop when your file is finalized.",
  summary="Start Round 2 challenges"
)

SendMessage(
  type="message",
  recipient="pitfalls-researcher",
  content="Round 1 complete. All teammates have broadcast their findings. Begin Round 2: Review your teammates' broadcasts. Send direct challenges (contradictions) or reinforcements (alignments) to specific teammates. Then revise and finalize PITFALLS.md. Stop when your file is finalized.",
  summary="Start Round 2 challenges"
)
```

**Step H5: Wait for Round 2 completion**

**IMPORTANT: Wait here for all active teammates to go idle again.** Idle notifications are delivered automatically.

**Step H6: Shutdown teammates**

Send shutdown requests to all active teammates:

```
SendMessage(
  type="shutdown_request",
  recipient="stack-researcher",
  content="Research complete. Thank you for your work."
)

SendMessage(
  type="shutdown_request",
  recipient="features-researcher",
  content="Research complete. Thank you for your work."
)

SendMessage(
  type="shutdown_request",
  recipient="architecture-researcher",
  content="Research complete. Thank you for your work."
)

SendMessage(
  type="shutdown_request",
  recipient="pitfalls-researcher",
  content="Research complete. Thank you for your work."
)
```

Wait for shutdown confirmations.

**Step H7: Synthesize SUMMARY.md**

**WARNING: The orchestrator writes ONLY SUMMARY.md. Do NOT write or modify STACK.md, FEATURES.md, ARCHITECTURE.md, or PITFALLS.md.**

Read all 4 final files and write SUMMARY.md directly:

1. Read .planning/research/STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
2. Check for remaining contradictions between files
3. Note confidence levels based on debate outcomes
4. Write .planning/research/SUMMARY.md using template at ~/.claude/get-shit-done/templates/research-project/SUMMARY.md
5. Include in SUMMARY.md metadata: "Research mode: hybrid (Agent Teams with 2-round debate)"

**Step H8: Clean up team**

```
TeamDelete()
```

**Step H9: Commit and continue**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "docs: complete project research (hybrid mode)" --files .planning/research/STACK.md .planning/research/FEATURES.md .planning/research/ARCHITECTURE.md .planning/research/PITFALLS.md .planning/research/SUMMARY.md
```

Continue to research complete banner.

**If USE_HYBRID=false OR FALLBACK_TO_CLASSIC=true: Classic Research (existing code)**

**If FALLBACK_TO_CLASSIC was set after TeamCreate succeeded, clean up team first:**
```
TeamDelete()
```

If FALLBACK_TO_CLASSIC was triggered, display:
```
[!] Hybrid mode failed, using classic research mode
```

Display spawning indicator:
```
◆ Spawning 4 researchers in parallel...
  → Stack research
  → Features research
  → Architecture research
  → Pitfalls research
```

Spawn 4 parallel gsd-project-researcher agents with rich context:

```
Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Stack dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: Research the standard stack for building [domain] from scratch.
Subsequent: Research what's needed to add [target features] to an existing [domain] app. Don't re-research the existing system.
</milestone_context>

<question>
What's the standard 2025 stack for [domain]?
</question>

<project_context>
[PROJECT.md summary - core value, constraints, what they're building]
</project_context>

<downstream_consumer>
Your STACK.md feeds into roadmap creation. Be prescriptive:
- Specific libraries with versions
- Clear rationale for each choice
- What NOT to use and why
</downstream_consumer>

<quality_gate>
- [ ] Versions are current (verify with Context7/official docs, not training data)
- [ ] Rationale explains WHY, not just WHAT
- [ ] Confidence levels assigned to each recommendation
</quality_gate>

<output>
Write to: .planning/research/STACK.md
Use template: ~/.claude/get-shit-done/templates/research-project/STACK.md
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Stack research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Features dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: What features do [domain] products have? What's table stakes vs differentiating?
Subsequent: How do [target features] typically work? What's expected behavior?
</milestone_context>

<question>
What features do [domain] products have? What's table stakes vs differentiating?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your FEATURES.md feeds into requirements definition. Categorize clearly:
- Table stakes (must have or users leave)
- Differentiators (competitive advantage)
- Anti-features (things to deliberately NOT build)
</downstream_consumer>

<quality_gate>
- [ ] Categories are clear (table stakes vs differentiators vs anti-features)
- [ ] Complexity noted for each feature
- [ ] Dependencies between features identified
</quality_gate>

<output>
Write to: .planning/research/FEATURES.md
Use template: ~/.claude/get-shit-done/templates/research-project/FEATURES.md
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Features research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Architecture dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: How are [domain] systems typically structured? What are major components?
Subsequent: How do [target features] integrate with existing [domain] architecture?
</milestone_context>

<question>
How are [domain] systems typically structured? What are major components?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your ARCHITECTURE.md informs phase structure in roadmap. Include:
- Component boundaries (what talks to what)
- Data flow (how information moves)
- Suggested build order (dependencies between components)
</downstream_consumer>

<quality_gate>
- [ ] Components clearly defined with boundaries
- [ ] Data flow direction explicit
- [ ] Build order implications noted
</quality_gate>

<output>
Write to: .planning/research/ARCHITECTURE.md
Use template: ~/.claude/get-shit-done/templates/research-project/ARCHITECTURE.md
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Architecture research")

Task(prompt="First, read ~/.claude/agents/gsd-project-researcher.md for your role and instructions.

<research_type>
Project Research — Pitfalls dimension for [domain].
</research_type>

<milestone_context>
[greenfield OR subsequent]

Greenfield: What do [domain] projects commonly get wrong? Critical mistakes?
Subsequent: What are common mistakes when adding [target features] to [domain]?
</milestone_context>

<question>
What do [domain] projects commonly get wrong? Critical mistakes?
</question>

<project_context>
[PROJECT.md summary]
</project_context>

<downstream_consumer>
Your PITFALLS.md prevents mistakes in roadmap/planning. For each pitfall:
- Warning signs (how to detect early)
- Prevention strategy (how to avoid)
- Which phase should address it
</downstream_consumer>

<quality_gate>
- [ ] Pitfalls are specific to this domain (not generic advice)
- [ ] Prevention strategies are actionable
- [ ] Phase mapping included where relevant
</quality_gate>

<output>
Write to: .planning/research/PITFALLS.md
Use template: ~/.claude/get-shit-done/templates/research-project/PITFALLS.md
</output>
", subagent_type="general-purpose", model="{researcher_model}", description="Pitfalls research")
```

After all 4 agents complete, spawn synthesizer to create SUMMARY.md:

```
Task(prompt="
<task>
Synthesize research outputs into SUMMARY.md.
</task>

<research_files>
Read these files:
- .planning/research/STACK.md
- .planning/research/FEATURES.md
- .planning/research/ARCHITECTURE.md
- .planning/research/PITFALLS.md
</research_files>

<output>
Write to: .planning/research/SUMMARY.md
Use template: ~/.claude/get-shit-done/templates/research-project/SUMMARY.md
Commit after writing.
</output>
", subagent_type="gsd-research-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

Display research complete banner and key findings:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCH COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Key Findings

**Stack:** [from SUMMARY.md]
**Table Stakes:** [from SUMMARY.md]
**Watch Out For:** [from SUMMARY.md]

Files: `.planning/research/`
```

**If "Skip research":** Continue to Step 7.

## 7. Define Requirements

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Load context:**

Read PROJECT.md and extract:
- Core value (the ONE thing that must work)
- Stated constraints (budget, timeline, tech limitations)
- Any explicit scope boundaries

**If research exists:** Read research/FEATURES.md and extract feature categories.

**Present features by category:**

```
Here are the features for [domain]:

## Authentication
**Table stakes:**
- Sign up with email/password
- Email verification
- Password reset
- Session management

**Differentiators:**
- Magic link login
- OAuth (Google, GitHub)
- 2FA

**Research notes:** [any relevant notes]

---

## [Next Category]
...
```

**If no research:** Gather requirements through conversation instead.

Ask: "What are the main things users need to be able to do?"

For each capability mentioned:
- Ask clarifying questions to make it specific
- Probe for related capabilities
- Group into categories

**Scope each category:**

**If AGENT_MODE=true:**

For each category, use auto-decide multiSelect:

```bash
# Build JSON array of feature options for this category
FEATURES_JSON='["[Feature 1]","[Feature 2]","[Feature 3]","None for v1"]'

DECISION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type multiSelect --question "Which [category] features for v1?" --options "$FEATURES_JSON" --raw)
```

The auto-decide multiSelect rule applies:
- Conservative (default): Selects all except "None"/"Skip"/"Defer" items
- Comprehensive: Selects all items including differentiators

Track auto-decided selections as v1 requirements.

For the "Additions" question, auto-decide binary selects "No, research covered it":

```bash
ADDITIONS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Any requirements research missed?" --options '["No, research covered it","Yes, let me add some"]' --raw)
```

**If AGENT_MODE=false (classic):**

For each category, use AskUserQuestion:

- header: "[Category name]"
- question: "Which [category] features are in v1?"
- multiSelect: true
- options:
  - "[Feature 1]" — [brief description]
  - "[Feature 2]" — [brief description]
  - "[Feature 3]" — [brief description]
  - "None for v1" — Defer entire category

Track responses:
- Selected features → v1 requirements
- Unselected table stakes → v2 (users expect these)
- Unselected differentiators → out of scope

**Identify gaps:**

Use AskUserQuestion:
- header: "Additions"
- question: "Any requirements research missed? (Features specific to your vision)"
- options:
  - "No, research covered it" — Proceed
  - "Yes, let me add some" — Capture additions

**Validate core value:**

Cross-check requirements against Core Value from PROJECT.md. If gaps detected, surface them.

**Generate REQUIREMENTS.md:**

Create `.planning/REQUIREMENTS.md` with:
- v1 Requirements grouped by category (checkboxes, REQ-IDs)
- v2 Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, CONTENT-02)

**Requirement quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

Reject vague requirements. Push for specificity:
- "Handle authentication" → "User can log in with email/password and stay logged in across sessions"
- "Support sharing" → "User can share post via link that opens in recipient's browser"

**Present full requirements list:**

Show every requirement (not counts) for user confirmation:

```
## v1 Requirements

### Authentication
- [ ] **AUTH-01**: User can create account with email/password
- [ ] **AUTH-02**: User can log in and stay logged in across sessions
- [ ] **AUTH-03**: User can log out from any page

### Content
- [ ] **CONT-01**: User can create posts with text
- [ ] **CONT-02**: User can edit their own posts

[... full list ...]

---

Does this capture what you're building? (yes / adjust)
```

If "adjust": Return to scoping.

**Commit requirements:**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "docs: define v1 requirements" --files .planning/REQUIREMENTS.md
```

## 8. Create Roadmap

Display stage banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...
```

Spawn gsd-roadmapper agent with context:

```
Task(prompt="
<planning_context>

**Project:**
@.planning/PROJECT.md

**Requirements:**
@.planning/REQUIREMENTS.md

**Research (if exists):**
@.planning/research/SUMMARY.md

**Config:**
@.planning/config.json

</planning_context>

<instructions>
Create roadmap:
1. Derive phases from requirements (don't impose structure)
2. Map every v1 requirement to exactly one phase
3. Derive 2-5 success criteria per phase (observable user behaviors)
4. Validate 100% coverage
5. Write files immediately (ROADMAP.md, STATE.md, update REQUIREMENTS.md traceability)
6. Return ROADMAP CREATED with summary

Write files first, then return. This ensures artifacts persist even if context is lost.
</instructions>
", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Create roadmap")
```

**Handle roadmapper return:**

**If `## ROADMAP BLOCKED`:**
- Present blocker information
- Work with user to resolve
- Re-spawn when resolved

**If `## ROADMAP CREATED`:**

Read the created ROADMAP.md and present it nicely inline:

```
---

## Proposed Roadmap

**[N] phases** | **[X] requirements mapped** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 2 | [Name] | [Goal] | [REQ-IDs] | [count] |
| 3 | [Name] | [Goal] | [REQ-IDs] | [count] |
...

### Phase Details

**Phase 1: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]
3. [criterion]

**Phase 2: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]

[... continue for all phases ...]

---
```

**If AGENT_MODE=true:**

Auto-approve roadmap:

```bash
DECISION=$(node ~/.claude/get-shit-done/bin/gsd-tools.js auto-decide --type approval --question "Does this roadmap structure work for you?" --options '["Approve","Adjust phases","Review full file"]' --raw)
```

Skip revision loop. Proceed to commit.

**If AGENT_MODE=false (classic):**

**CRITICAL: Ask for approval before committing:**

Use AskUserQuestion:
- header: "Roadmap"
- question: "Does this roadmap structure work for you?"
- options:
  - "Approve" — Commit and continue
  - "Adjust phases" — Tell me what to change
  - "Review full file" — Show raw ROADMAP.md

**If "Approve":** Continue to commit.

**If "Adjust phases":**
- Get user's adjustment notes
- Re-spawn roadmapper with revision context:
  ```
  Task(prompt="
  <revision>
  User feedback on roadmap:
  [user's notes]

  Current ROADMAP.md: @.planning/ROADMAP.md

  Update the roadmap based on feedback. Edit files in place.
  Return ROADMAP REVISED with changes made.
  </revision>
  ", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Revise roadmap")
  ```
- Present revised roadmap
- Loop until user approves

**If "Review full file":** Display raw `cat .planning/ROADMAP.md`, then re-ask.

**Commit roadmap (after approval):**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "docs: create roadmap ([N] phases)" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
```

## 9. Done

Present completion with next steps:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**[Project Name]**

| Artifact       | Location                    |
|----------------|-----------------------------|
| Project        | `.planning/PROJECT.md`      |
| Config         | `.planning/config.json`     |
| Research       | `.planning/research/`       |
| Requirements   | `.planning/REQUIREMENTS.md` |
| Roadmap        | `.planning/ROADMAP.md`      |

**[N] phases** | **[X] requirements** | Ready to build ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase 1: [Phase Name]** — [Goal from ROADMAP.md]

/gsd:discuss-phase 1 — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

---

**Also available:**
- /gsd:plan-phase 1 — skip discussion, plan directly

───────────────────────────────────────────────────────────────
```

</process>

<output>

- `.planning/PROJECT.md`
- `.planning/config.json`
- `.planning/research/` (if research selected)
  - `STACK.md`
  - `FEATURES.md`
  - `ARCHITECTURE.md`
  - `PITFALLS.md`
  - `SUMMARY.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

</output>

<success_criteria>

- [ ] .planning/ directory created
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Deep questioning completed (threads followed, not rushed)
- [ ] PROJECT.md captures full context → **committed**
- [ ] config.json has workflow mode, depth, parallelization → **committed**
- [ ] Research completed (if selected) — 4 parallel agents spawned → **committed**
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category (v1/v2/out of scope)
- [ ] REQUIREMENTS.md created with REQ-IDs → **committed**
- [ ] gsd-roadmapper spawned with context
- [ ] Roadmap files written immediately (not draft)
- [ ] User feedback incorporated (if any)
- [ ] ROADMAP.md created with phases, requirement mappings, success criteria
- [ ] STATE.md initialized
- [ ] REQUIREMENTS.md traceability updated
- [ ] User knows next step is `/gsd:discuss-phase 1`

**Atomic commits:** Each phase commits its artifacts immediately. If context is lost, artifacts persist.

</success_criteria>

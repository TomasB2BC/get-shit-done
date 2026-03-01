<planning_config>

Configuration options for `.planning/` directory behavior.

<config_schema>
```json
"planning": {
  "commit_docs": true,
  "search_gitignored": false
},
"git": {
  "branching_strategy": "none",
  "phase_branch_template": "gsd/phase-{phase}-{slug}",
  "milestone_branch_template": "gsd/{milestone}-{slug}"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `search_gitignored` | `false` | Add `--no-ignore` to broad rg searches |
| `git.branching_strategy` | `"none"` | Git branching approach: `"none"`, `"phase"`, or `"milestone"` |
| `git.phase_branch_template` | `"gsd/phase-{phase}-{slug}"` | Branch template for phase strategy |
| `git.milestone_branch_template` | `"gsd/{milestone}-{slug}"` | Branch template for milestone strategy |
</config_schema>

<commit_docs_behavior>

**When `commit_docs: true` (default):**
- Planning files committed normally
- SUMMARY.md, STATE.md, ROADMAP.md tracked in git
- Full history of planning decisions preserved

**When `commit_docs: false`:**
- Skip all `git add`/`git commit` for `.planning/` files
- User must add `.planning/` to `.gitignore`
- Useful for: OSS contributions, client projects, keeping planning private

**Using gsd-tools.js (preferred):**

```bash
# Commit with automatic commit_docs + gitignore checks:
node ~/.claude/get-shit-done/bin/gsd-tools.js commit "docs: update state" --files .planning/STATE.md

# Or read config manually:
COMMIT_DOCS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js state load --raw | grep '^commit_docs=' | cut -d= -f2)
```

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors when users have `.planning/` in `.gitignore`.

**Conditional git operations:**

```bash
if [ "$COMMIT_DOCS" = "true" ]; then
  git add .planning/STATE.md
  git commit -m "docs: update state"
fi
```

</commit_docs_behavior>

<search_behavior>

**When `search_gitignored: false` (default):**
- Standard rg behavior (respects .gitignore)
- Direct path searches work: `rg "pattern" .planning/` finds files
- Broad searches skip gitignored: `rg "pattern"` skips `.planning/`

**When `search_gitignored: true`:**
- Add `--no-ignore` to broad rg searches that should include `.planning/`
- Only needed when searching entire repo and expecting `.planning/` matches

**Note:** Most GSD operations use direct file reads or explicit paths, which work regardless of gitignore status.

</search_behavior>

<setup_uncommitted_mode>

To use uncommitted mode:

1. **Set config:**
   ```json
   "planning": {
     "commit_docs": false,
     "search_gitignored": true
   }
   ```

2. **Add to .gitignore:**
   ```
   .planning/
   ```

3. **Existing tracked files:** If `.planning/` was previously tracked:
   ```bash
   git rm -r --cached .planning/
   git commit -m "chore: stop tracking planning docs"
   ```

</setup_uncommitted_mode>

<branching_strategy_behavior>

**Branching Strategies:**

| Strategy | When branch created | Branch scope | Merge point |
|----------|---------------------|--------------|-------------|
| `none` | Never | N/A | N/A |
| `phase` | At `execute-phase` start | Single phase | User merges after phase |
| `milestone` | At first `execute-phase` of milestone | Entire milestone | At `complete-milestone` |

**When `git.branching_strategy: "none"` (default):**
- All work commits to current branch
- Standard GSD behavior

**When `git.branching_strategy: "phase"`:**
- `execute-phase` creates/switches to a branch before execution
- Branch name from `phase_branch_template` (e.g., `gsd/phase-03-authentication`)
- All plan commits go to that branch
- User merges branches manually after phase completion
- `complete-milestone` offers to merge all phase branches

**When `git.branching_strategy: "milestone"`:**
- First `execute-phase` of milestone creates the milestone branch
- Branch name from `milestone_branch_template` (e.g., `gsd/v1.0-mvp`)
- All phases in milestone commit to same branch
- `complete-milestone` offers to merge milestone branch to main

**Template variables:**

| Variable | Available in | Description |
|----------|--------------|-------------|
| `{phase}` | phase_branch_template | Zero-padded phase number (e.g., "03") |
| `{slug}` | Both | Lowercase, hyphenated name |
| `{milestone}` | milestone_branch_template | Milestone version (e.g., "v1.0") |

**Checking the config:**

```bash
GSD_CONFIG=$(node ~/.claude/get-shit-done/bin/gsd-tools.js state load --raw)
BRANCHING_STRATEGY=$(echo "$GSD_CONFIG" | grep '^branching_strategy=' | cut -d= -f2)
PHASE_BRANCH_TEMPLATE=$(echo "$GSD_CONFIG" | grep '^phase_branch_template=' | cut -d= -f2)
MILESTONE_BRANCH_TEMPLATE=$(echo "$GSD_CONFIG" | grep '^milestone_branch_template=' | cut -d= -f2)
```

**Branch creation:**

```bash
# For phase strategy
if [ "$BRANCHING_STRATEGY" = "phase" ]; then
  PHASE_SLUG=$(echo "$PHASE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  BRANCH_NAME=$(echo "$PHASE_BRANCH_TEMPLATE" | sed "s/{phase}/$PADDED_PHASE/g" | sed "s/{slug}/$PHASE_SLUG/g")
  git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
fi

# For milestone strategy
if [ "$BRANCHING_STRATEGY" = "milestone" ]; then
  MILESTONE_SLUG=$(echo "$MILESTONE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  BRANCH_NAME=$(echo "$MILESTONE_BRANCH_TEMPLATE" | sed "s/{milestone}/$MILESTONE_VERSION/g" | sed "s/{slug}/$MILESTONE_SLUG/g")
  git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
fi
```

**Merge options at complete-milestone:**

| Option | Git command | Result |
|--------|-------------|--------|
| Squash merge (recommended) | `git merge --squash` | Single clean commit per branch |
| Merge with history | `git merge --no-ff` | Preserves all individual commits |
| Delete without merging | `git branch -D` | Discard branch work |
| Keep branches | (none) | Manual handling later |

Squash merge is recommended — keeps main branch history clean while preserving the full development history in the branch (until deleted).

**Use cases:**

| Strategy | Best for |
|----------|----------|
| `none` | Solo development, simple projects |
| `phase` | Code review per phase, granular rollback, team collaboration |
| `milestone` | Release branches, staging environments, PR per version |

</branching_strategy_behavior>

<orchestration_mode>

**Field:** `orchestration`
**Values:** `"classic"` (default) | `"hybrid"`
**Location:** `.planning/config.json` (top-level field)

**Reading the field:**
```bash
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")
```

**Mode behaviors:**
- `classic`: All agent operations use Task subagents (default GSD behavior)
- `hybrid`: Commands check per-command agent_teams toggles and may use Agent Teams when enabled

**Note:** Setting orchestration to "hybrid" alone does NOT enable Agent Teams. The compound detection pattern (see `<hybrid_detection_pattern>`) requires BOTH the config field AND the environment variable.

</orchestration_mode>

<agent_teams_config>

**Field:** `agent_teams` (nested object)
**Location:** `.planning/config.json` (top-level field)

```json
"agent_teams": {
  "research": false,
  "debug": false,
  "verification": false,
  "codebase_mapping": false,
  "delivery": false
}
```

| Sub-field | Default | Controls |
|-----------|---------|----------|
| `research` | `false` | new-project.md Phase 6, research-phase.md |
| `debug` | `false` | debug.md hypothesis testing |
| `verification` | `false` | execute-phase.md verification step |
| `codebase_mapping` | `false` | map-codebase.md collaborative mapping |
| `delivery` | `false` | package.md stakeholder persona review, auto-dispatch deliver mode |

**Reading the field (use grep -A5 to avoid collision with workflow.research):**
```bash
AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_DEBUG=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"debug"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_VERIFICATION=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"verification"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_CODEBASE_MAPPING=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"codebase_mapping"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_DELIVERY=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"delivery"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**Important:** Use `grep -A6 '"agent_teams"'` prefix to scope the search to the agent_teams object. Without this, `"research"` would match `workflow.research` as well.

</agent_teams_config>

<hybrid_detection_pattern>

**Compound detection: config field AND environment variable**

Hybrid mode requires BOTH conditions:
1. `orchestration` = `"hybrid"` in `.planning/config.json`
2. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable set

**5-step detection logic (canonical pattern -- use this in all commands):**

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check (only when compound check passes)
  AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "WARNING: orchestration=hybrid but Agent Teams not available or not enabled for this command"
  echo "Falling back to classic mode"
fi
```

**Per-command toggle mapping:**

| Command | Toggle field | What changes in hybrid |
|---------|-------------|----------------------|
| new-project.md (Phase 6) | `agent_teams.research` | 4 researchers use Agent Teams with debate |
| research-phase.md | `agent_teams.research` | Debate-style research team |
| debug.md | `agent_teams.debug` | Competing hypotheses pattern |
| execute-phase.md (verify) | `agent_teams.verification` | Adversarial verification team |
| map-codebase.md | `agent_teams.codebase_mapping` | Collaborative mapping team |
| package.md | `agent_teams.delivery` | Stakeholder persona review agent spawned after document creation |

**Graceful fallback:** When hybrid conditions are not fully met, commands fall back to classic mode silently (with a one-time warning). This ensures GSD never breaks due to missing env var or config.

</hybrid_detection_pattern>

<agent_mode_config>

**Field:** `agent_mode`
**Type:** boolean, default: false
**Location:** top-level in .planning/config.json

**Purpose:** Enables agent mode -- auto-decide replaces AskUserQuestion in workflows

When false: all workflows behave exactly as classic mode (v1.12.0-hybrid behavior preserved)
When true: workflows check for agent_mode and use auto-decide at each AskUserQuestion callsite

**Field:** `agent_mode_settings`
**Type:** object, top-level in .planning/config.json

**Sub-fields:**

| Sub-field | Type | Default | Description |
|-----------|------|---------|-------------|
| auto_scope | string | "conservative" | Scoping aggressiveness: "conservative" (table stakes only) or "comprehensive" (include differentiators) |
| max_phases | number or null | null | Maximum phases per /gsd:auto run. null = full milestone loop |
| max_iterations_per_phase | number | 3 | Max plan-execute-verify cycles before halting |
| budget_tokens_per_phase | number | 500000 | Maximum estimated tokens per phase before halt |

**Reading agent_mode:**

```bash
AGENT_MODE=$(node ~/.claude/get-shit-done/bin/gsd-tools.js state load --raw | grep '^agent_mode=' | cut -d= -f2)
```

Or inline in workflow (checks runtime session marker, NOT config.json):

```bash
# Agent mode only activates during /gsd:auto sessions (runtime marker)
AGENT_MODE=$( [ -f .planning/.auto-dispatch-active ] && echo "true" || echo "false")
```

**Important:** Workflows MUST NOT read `agent_mode` from config.json directly.
The config flag is a prerequisite that `/gsd:auto` validates. The runtime marker
file `.planning/.auto-dispatch-active` is what actually activates autonomous behavior.
This prevents `agent_mode: true` from leaking into manual command invocations.

**Decision-making in agent mode (replaces AskUserQuestion when agent_mode=true):**

Claude (the LLM) decides -- NOT a deterministic function. Read the relevant
project context, reason about tradeoffs, then log your decision:

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "freeform" \
  --question "Which features for v1?" \
  --decision "All table stakes + key differentiators" \
  --rationale "Based on REQUIREMENTS.md scope and competitive analysis"
```

NOTE: `gsd-tools.js auto-decide` still exists for backwards compatibility but
workflows should NOT call it. The override instruction near AGENT_MODE detection
tells Claude to decide itself and log via `log-decision` instead.

**Using log-decision (for freeform synthesis by workflow agents):**

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type "freeform" \
  --question "What do you want to build?" \
  --decision "Implement agent mode foundation..." \
  --rationale "Synthesized from PROJECT.md + ROADMAP.md"
```

**Orthogonality with hybrid mode:**

Note that agent_mode and orchestration are independent dimensions. agent_mode controls HOW decisions are made (human vs auto). orchestration controls HOW agents coordinate (classic Task vs hybrid Agent Teams). They compose cleanly without special interaction.

</agent_mode_config>

</planning_config>

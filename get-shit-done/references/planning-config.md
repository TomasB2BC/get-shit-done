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
},
"orchestration": "classic",
"agent_teams": {
  "research": false,
  "debug": false,
  "verification": false,
  "codebase_mapping": false
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `search_gitignored` | `false` | Add `--no-ignore` to broad rg searches |
| `git.branching_strategy` | `"none"` | Git branching approach: `"none"`, `"phase"`, or `"milestone"` |
| `git.phase_branch_template` | `"gsd/phase-{phase}-{slug}"` | Branch template for phase strategy |
| `git.milestone_branch_template` | `"gsd/{milestone}-{slug}"` | Branch template for milestone strategy |
| `orchestration` | `"classic"` | Orchestration mode: `"classic"` or `"hybrid"` |
| `agent_teams.research` | `false` | Use Agent Teams for project/phase research |
| `agent_teams.debug` | `false` | Use Agent Teams for debugging |
| `agent_teams.verification` | `false` | Use Agent Teams for phase verification |
| `agent_teams.codebase_mapping` | `false` | Use Agent Teams for codebase mapping |
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

**Checking the config:**

```bash
# Check config.json first
COMMIT_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")

# Auto-detect gitignored (overrides config)
git check-ignore -q .planning 2>/dev/null && COMMIT_DOCS=false
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
# Get branching strategy (default: none)
BRANCHING_STRATEGY=$(cat .planning/config.json 2>/dev/null | grep -o '"branching_strategy"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/' || echo "none")

# Get phase branch template
PHASE_BRANCH_TEMPLATE=$(cat .planning/config.json 2>/dev/null | grep -o '"phase_branch_template"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/' || echo "gsd/phase-{phase}-{slug}")

# Get milestone branch template
MILESTONE_BRANCH_TEMPLATE=$(cat .planning/config.json 2>/dev/null | grep -o '"milestone_branch_template"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/' || echo "gsd/{milestone}-{slug}")
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

**Orchestration Mode Configuration:**

The `orchestration` field controls whether GSD commands use Task subagents only (classic) or Agent Teams where beneficial (hybrid).

**Field:** `orchestration` (string enum: `"classic"` | `"hybrid"`)
**Default:** `"classic"`
**Location:** Top-level in config.json (sibling to `"mode"`, `"depth"`, etc.)

**Purpose:** Controls whether GSD commands use Task subagents only (classic) or Agent Teams where beneficial (hybrid).

**Parsing pattern:**

```bash
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")
```

**Validation pattern:**

```bash
if [ "$ORCH_MODE" != "classic" ] && [ "$ORCH_MODE" != "hybrid" ]; then
  ORCH_MODE="classic"
fi
```

**Behavior by mode:**

**classic (default):**
- All agent spawning uses Task subagents
- Identical to current GSD behavior
- No Agent Teams features active

**hybrid:**
- Commands with Agent Teams support check per-command toggles in agent_teams config object
- Commands without Agent Teams support continue using Task subagents unchanged

</orchestration_mode>

<agent_teams_config>

**Agent Teams Configuration:**

The `agent_teams` object contains per-command toggles for Agent Teams usage. These only take effect when `orchestration="hybrid"` AND `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

**Field:** `agent_teams` (object with 4 boolean fields)
**Location:** Top-level in config.json
**Sub-fields:** `research` (false), `debug` (false), `verification` (false), `codebase_mapping` (false)

**Purpose:** Per-command toggles for Agent Teams usage. Only take effect when orchestration="hybrid" AND CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.

**Parsing patterns:**

```bash
AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_DEBUG=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"debug"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_VERIFICATION=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"verification"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
AGENT_TEAMS_CODEBASE_MAPPING=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"codebase_mapping"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```

**Note:** The `grep -A5` pattern extracts 5 lines after the "agent_teams" key to get nested fields. This avoids collisions with the top-level `workflow.research` field.

</agent_teams_config>

<hybrid_detection_pattern>

**Hybrid Mode Detection:**

The canonical compound detection pattern requires BOTH `orchestration="hybrid"` in config AND `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in environment.

**Detection pattern:**

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  USE_HYBRID=true
fi

# Step 4: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "WARNING: orchestration=hybrid but Agent Teams not available"
  echo "Falling back to classic mode (set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to enable)"
fi

# Step 5: Per-command check (example for research)
if [ "$USE_HYBRID" = "true" ]; then
  AGENT_TEAMS_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_RESEARCH" = "true" ]; then
    # Use Agent Teams for research (TeamCreate + spawn teammates)
  else
    # Use classic Task for research (existing Task subagent code)
  fi
else
  # Classic mode -- use Task subagents (existing code, no changes)
fi
```

**Per-command toggle mapping:**

| Toggle | Commands affected | Phase |
|--------|-------------------|-------|
| agent_teams.research | new-project.md, plan-phase.md, research-phase.md | Phase 2, 3 |
| agent_teams.debug | debug.md | Phase 4 |
| agent_teams.verification | execute-phase.md | Phase 5 |
| agent_teams.codebase_mapping | map-codebase.md | Phase 6 |

</hybrid_detection_pattern>

</planning_config>

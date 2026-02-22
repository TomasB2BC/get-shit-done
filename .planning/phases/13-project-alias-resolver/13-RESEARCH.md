# Phase 13: Project Alias Resolver - Research

**Researched:** 2026-02-21
**Domain:** GSD CLI tooling -- project registry and cross-project command routing
**Confidence:** HIGH

## Summary

Phase 13 adds a `--project <alias>` flag to all GSD commands, enabling users to target sub-projects by alias from anywhere. The implementation is entirely within the GSD codebase (gsd-tools.js + markdown command/workflow files) and does not depend on external libraries. The core components are: (1) a `projects.json` registry at `.planning/projects.json`, (2) a `resolveProject(alias)` function and `resolve-project` CLI command in gsd-tools.js, (3) `--project` flag parsing inserted as "Step 0" in all command/workflow files, (4) auto-registration in the `new-project` workflow, and (5) a new `/gsd:register-project` command for existing projects.

The implementation follows well-established patterns already present in gsd-tools.js (loadConfig, cmdFindPhase, etc.) and the command/workflow markdown files ($ARGUMENTS parsing via grep/sed). No new dependencies are needed. The primary challenge is the breadth of files requiring modification (28 command files + ~15 workflow files) rather than algorithmic complexity.

**Primary recommendation:** Implement in 3 waves: (1) gsd-tools.js core + projects.json + register-project command, (2) --project flag in command files and workflows, (3) auto-registration in new-project workflow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- projects.json lives at `.planning/projects.json` (root planning directory)
- JSON object mapping alias strings to project metadata
- Each entry contains at minimum: `alias`, `planning_dir` (absolute or relative path), and `registered` timestamp
- Alias derived from directory name by default
- Aliases must be unique; registration fails with clear error if alias already taken
- resolveProject(alias) is a new exported function in gsd-tools.js following existing patterns
- New CLI command: `node gsd-tools.js resolve-project <alias> [--raw]`
- Raw mode returns just the path string; JSON mode returns `{ alias, planning_dir, found: true/false }`
- Resolves relative paths against the root `.planning/` parent directory
- All GSD command `.md` files accept `--project <alias>` in their argument-hint
- Flag parsed early in workflow (before any `.planning/` reads)
- When `--project` provided: resolve alias, then cd to project directory before rest of workflow
- When `--project` omitted: current behavior unchanged
- Pattern: insert "Project Resolution" step as Step 0 in each workflow
- `--project` follows existing extraction pattern: `echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+'`
- After extracting `--project`, strip it from `$ARGUMENTS`
- Auto-registration in new-project: detect sub-project scenario via `.planning/PROJECT.md` in parent directory
- `/gsd:register-project` command: new file `commands/gsd/register-project.md`
- Idempotent: re-registering same alias+path is no-op; same alias+different path is error

### Claude's Discretion
- Exact error message wording for alias conflicts, missing projects, etc.
- Whether to add a `list-projects` CLI command to gsd-tools.js
- Whether `projects.json` stores absolute or relative paths (relative preferred)
- How deeply to validate registered project's `.planning/` at resolve time (lazy vs eager)

### Deferred Ideas (OUT OF SCOPE)
- Auto-discovery scan of all sub-projects
- Custom aliases beyond directory name
- Multi-project commands (running across all projects at once)
- Project health checks
- Integration with auto-dispatch for multi-project autonomous execution
</user_constraints>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| gsd-tools.js (Node.js) | Current | CLI utility for GSD operations | Already hosts 13 commands; resolveProject follows same pattern |
| Command .md files | Current | GSD command definitions | All 28 commands need --project flag in argument-hint |
| Workflow .md files | Current | GSD workflow logic | ~15 workflows need Step 0 project resolution |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| fs (Node.js built-in) | Read/write projects.json | Always -- no external dependencies |
| path (Node.js built-in) | Path resolution and normalization | For resolving relative paths in projects.json |
| path.resolve() | Absolute path computation | When resolveProject needs to turn relative planning_dir into absolute |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON registry (projects.json) | YAML or TOML | JSON matches config.json pattern, no new parser needed |
| grep-based flag parsing in .md | gsd-tools.js flag parser | Consistency with existing pattern vs centralization; locked to grep pattern |
| Directory name as alias | User-specified alias | Simpler registration, locked decision |

**Installation:** No new packages needed. Pure Node.js built-in modules.

## Architecture Patterns

### Recommended Project Structure
```
.planning/
  projects.json            # NEW: project alias registry
  config.json              # existing project config
  PROJECT.md               # existing project context
  phases/                  # existing phase directories
  ...

commands/gsd/
  register-project.md      # NEW: register existing project
  execute-phase.md         # MODIFIED: add --project to argument-hint
  plan-phase.md            # MODIFIED: add --project to argument-hint
  auto.md                  # MODIFIED: add --project to argument-hint
  ... (all 28 commands)    # MODIFIED: add --project to argument-hint

get-shit-done/
  bin/gsd-tools.js         # MODIFIED: add resolveProject + resolve-project command
  workflows/
    execute-phase.md       # MODIFIED: add Step 0 project resolution
    plan-phase.md          # MODIFIED: add Step 0 project resolution
    auto-dispatch.md       # MODIFIED: add Step 0 project resolution
    ... (~15 workflows)    # MODIFIED: add Step 0 project resolution
```

### Pattern 1: projects.json Registry Format
**What:** Simple JSON file mapping aliases to project metadata
**When to use:** Always -- this is the single source of truth for project aliases

```json
{
  "venntel": {
    "alias": "venntel",
    "planning_dir": "../venntel/.planning",
    "registered": "2026-02-21T10:30:00.000Z"
  },
  "b2bc": {
    "alias": "b2bc",
    "planning_dir": "../b2bc/.planning",
    "registered": "2026-02-21T10:31:00.000Z"
  }
}
```

**Design notes:**
- Relative paths preferred for portability (resolved against root `.planning/` parent directory)
- `registered` timestamp for audit trail
- Keys are aliases (redundant with `alias` field for ease of lookup)
- Root project does NOT need an entry (it's the default when no --project is given)

### Pattern 2: resolveProject Function in gsd-tools.js
**What:** Function that looks up alias in projects.json and returns resolved path
**When to use:** Called by the CLI `resolve-project` command

```javascript
function resolveProject(cwd, alias) {
  const registryPath = path.join(cwd, '.planning', 'projects.json');

  try {
    const raw = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(raw);

    if (!registry[alias]) {
      return { found: false, alias, planning_dir: null, error: 'Alias "' + alias + '" not found in projects.json' };
    }

    const entry = registry[alias];
    let planningDir = entry.planning_dir;

    // Resolve relative paths against the root .planning/ parent directory
    if (!path.isAbsolute(planningDir)) {
      const rootDir = path.dirname(path.join(cwd, '.planning'));
      planningDir = path.resolve(rootDir, planningDir);
    }

    // Validate the resolved path exists
    if (!fs.existsSync(planningDir)) {
      return { found: false, alias, planning_dir: planningDir, error: 'Planning directory does not exist: ' + planningDir };
    }

    return { found: true, alias, planning_dir: planningDir };
  } catch (err) {
    return { found: false, alias, planning_dir: null, error: 'Failed to read projects.json: ' + err.message };
  }
}

function cmdResolveProject(cwd, alias, raw) {
  if (!alias) {
    error('alias required for resolve-project');
  }

  const result = resolveProject(cwd, alias);
  output(result, raw, result.found ? result.planning_dir : '');
}
```

**Key behaviors:**
- Returns the resolved planning directory path (absolute)
- Raw mode returns just the path string for bash consumption
- Validates the directory exists at resolve time (lazy validation -- only when actually resolving)
- Error messages are clear and actionable

### Pattern 3: Step 0 Project Resolution in Workflow Files
**What:** A standardized block inserted before Step 1 in every workflow that reads `.planning/`
**When to use:** In all workflow .md files that access `.planning/` directory

```markdown
## 0. Project Resolution

```bash
# Extract --project flag if present
PROJECT_ALIAS=""
if echo "$ARGUMENTS" | grep -q '\-\-project'; then
  PROJECT_ALIAS=$(echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+')
  # Strip --project and its value from $ARGUMENTS
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--project\s\+\S\+//' | sed 's/^\s\+//;s/\s\+$//')
fi

# If --project specified, resolve and change directory
if [ -n "$PROJECT_ALIAS" ]; then
  PROJECT_DIR=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS" --raw)
  if [ -z "$PROJECT_DIR" ]; then
    echo "[X] ERROR: Project alias '$PROJECT_ALIAS' not found"
    echo "Run: node gsd-tools.js resolve-project '$PROJECT_ALIAS' for details"
    exit 1
  fi
  # Change to the project's root directory (parent of .planning/)
  cd "$(dirname "$PROJECT_DIR")"
  echo ">> Resolved --project $PROJECT_ALIAS -> $(pwd)"
fi
```
```

**Critical details:**
- Must appear BEFORE any `.planning/` file reads
- Strips `--project <alias>` from `$ARGUMENTS` so downstream parsing (phase numbers, flags) is unaffected
- Uses `dirname` on planning_dir because the resolve returns the `.planning/` directory path, but commands need the project root
- Display resolved path for user visibility

### Pattern 4: Argument-Hint Update Pattern
**What:** Adding `[--project <alias>]` to all command file frontmatter
**When to use:** All 28 command .md files in `commands/gsd/`

```yaml
# Before:
argument-hint: "<phase-number> [--gaps-only]"

# After:
argument-hint: "[--project <alias>] <phase-number> [--gaps-only]"
```

**Note:** `--project` appears first in the hint since it's parsed first and stripped.

### Pattern 5: Auto-Registration in new-project
**What:** Detecting sub-project scenario and auto-registering
**When to use:** In new-project workflow, after `.planning/` is created

```markdown
## Auto-Registration Check

```bash
# Check if a parent directory has .planning/PROJECT.md (indicates root project)
PARENT_PLANNING=""
SEARCH_DIR=$(dirname "$(pwd)")
while [ "$SEARCH_DIR" != "/" ] && [ "$SEARCH_DIR" != "." ]; do
  if [ -f "$SEARCH_DIR/.planning/PROJECT.md" ]; then
    PARENT_PLANNING="$SEARCH_DIR/.planning"
    break
  fi
  SEARCH_DIR=$(dirname "$SEARCH_DIR")
done

if [ -n "$PARENT_PLANNING" ]; then
  ALIAS=$(basename "$(pwd)")
  RELATIVE_PLANNING=$(python3 -c "import os; print(os.path.relpath('$(pwd)/.planning', '$PARENT_PLANNING/..'))")
  # Register in parent's projects.json
  echo ">> Sub-project detected. Auto-registering as '$ALIAS'"
  # Use gsd-tools.js register-project or direct JSON manipulation
fi
```
```

### Anti-Patterns to Avoid
- **Modifying loadConfig to auto-detect projects:** loadConfig takes `cwd` and should not search for project aliases; project resolution happens BEFORE loadConfig runs
- **Storing absolute paths in projects.json:** Breaks portability when repo is cloned or moved; use relative paths
- **Registering the root project in projects.json:** Root project is the default when no --project is given; adding it creates confusion
- **Parsing --project in gsd-tools.js:** The locked decision specifies this is a markdown-level concern, not gsd-tools.js
- **Forgetting to strip --project from $ARGUMENTS:** Downstream parsers would fail trying to parse "venntel" as a phase number

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path resolution | Custom path joining | path.resolve() | Handles ../ and relative paths correctly |
| JSON file read/write | String manipulation | JSON.parse/JSON.stringify | Handles edge cases, escaping |
| Alias derivation | Regex extraction | path.basename(process.cwd()) | Already handles all directory name formats |
| Timestamp generation | Date formatting | new Date().toISOString() | Already used throughout gsd-tools.js |

**Key insight:** This phase is almost entirely plumbing -- connecting existing patterns. The biggest risk is breadth (many files), not depth (complex logic).

## Common Pitfalls

### Pitfall 1: Path Resolution Confusion
**What goes wrong:** Relative paths in projects.json resolve differently depending on cwd
**Why it happens:** Node.js `path.resolve()` is relative to cwd, not to the JSON file location
**How to avoid:** Always resolve relative paths against the root `.planning/` parent directory (the directory containing `.planning/`), not against cwd
**Warning signs:** Tests pass when run from root but fail from subdirectory

### Pitfall 2: $ARGUMENTS Corruption
**What goes wrong:** `--project venntel` remains in $ARGUMENTS, causing downstream parsing to fail
**Why it happens:** sed pattern doesn't match all whitespace variants, or stripping is incomplete
**How to avoid:** Use robust sed pattern: `sed 's/--project[[:space:]]\+[^[:space:]]\+//'` followed by trim
**Warning signs:** Phase number parsing fails when --project is used

### Pitfall 3: Forgetting Workflow Files
**What goes wrong:** Command file has --project in argument-hint, but the workflow file it routes to doesn't have Step 0
**Why it happens:** Commands route to workflows via `@execution_context`; both need updating
**How to avoid:** For each command file modified, trace the `@execution_context` reference and ensure the workflow also has Step 0
**Warning signs:** --project flag is silently ignored

### Pitfall 4: Auto-Registration Race Condition
**What goes wrong:** Two new-project invocations register the same alias simultaneously
**Why it happens:** Concurrent agents in a monorepo workspace
**How to avoid:** Read-modify-write with file existence check; accept that last-write-wins is acceptable for this use case
**Warning signs:** Duplicate entries in projects.json

### Pitfall 5: Windows Path Separators
**What goes wrong:** Backslashes in stored paths break on Unix or in bash
**Why it happens:** path.join() on Windows uses backslashes; stored in JSON, used in bash
**How to avoid:** Normalize to forward slashes when writing to projects.json: `planningDir.replace(/\\/g, '/')`
**Warning signs:** Paths with `\` in projects.json, broken resolve on different OS

### Pitfall 6: Missing Error for Nonexistent projects.json
**What goes wrong:** --project flag used but no projects.json exists, giving cryptic error
**Why it happens:** resolveProject tries to read a file that doesn't exist yet
**How to avoid:** Check for projects.json existence early and give clear message: "No projects registered. Use /gsd:register-project first."
**Warning signs:** "ENOENT" errors when using --project for the first time

## Code Examples

### Example 1: resolveProject Function (Full Implementation)

```javascript
// Source: Following loadConfig pattern in gsd-tools.js
function resolveProject(cwd, alias) {
  const registryPath = path.join(cwd, '.planning', 'projects.json');

  let registry;
  try {
    const raw = fs.readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { found: false, alias, planning_dir: null, error: 'No projects registered. Run /gsd:register-project first.' };
    }
    return { found: false, alias, planning_dir: null, error: 'Failed to parse projects.json: ' + err.message };
  }

  if (!registry[alias]) {
    const available = Object.keys(registry).join(', ');
    return { found: false, alias, planning_dir: null, error: 'Alias "' + alias + '" not found. Available: ' + (available || 'none') };
  }

  const entry = registry[alias];
  let planningDir = entry.planning_dir;

  // Resolve relative paths against root .planning/ parent
  if (!path.isAbsolute(planningDir)) {
    const rootParent = path.resolve(cwd);  // cwd should be the root project dir
    planningDir = path.resolve(rootParent, planningDir);
  }

  // Normalize to forward slashes for cross-platform compatibility
  planningDir = planningDir.replace(/\\/g, '/');

  return { found: true, alias, planning_dir: planningDir };
}
```

### Example 2: registerProject Function

```javascript
// Source: Following cmdConfigEnsureSection pattern in gsd-tools.js
function registerProject(cwd, alias, planningDir) {
  const registryPath = path.join(cwd, '.planning', 'projects.json');

  let registry = {};
  try {
    const raw = fs.readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { registered: false, error: 'Failed to parse projects.json: ' + err.message };
    }
    // File doesn't exist yet -- will create
  }

  // Idempotent check: same alias + same path = no-op
  if (registry[alias]) {
    const existingDir = registry[alias].planning_dir;
    if (existingDir === planningDir) {
      return { registered: true, reason: 'already_registered' };
    }
    return { registered: false, error: 'Alias "' + alias + '" already registered to: ' + existingDir };
  }

  registry[alias] = {
    alias: alias,
    planning_dir: planningDir,
    registered: new Date().toISOString(),
  };

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  return { registered: true, reason: 'new_registration', alias, planning_dir: planningDir };
}
```

### Example 3: CLI Router Entry for resolve-project

```javascript
// Source: Following existing CLI router pattern in gsd-tools.js main()
case 'resolve-project': {
  cmdResolveProject(cwd, args[1], raw);
  break;
}
```

### Example 4: Step 0 in a Workflow File (execute-phase.md)

```markdown
## 0. Project Resolution

\`\`\`bash
PROJECT_ALIAS=""
if echo "$ARGUMENTS" | grep -q '\-\-project'; then
  PROJECT_ALIAS=$(echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--project[[:space:]]\+[[:graph:]]\+//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
fi

if [ -n "$PROJECT_ALIAS" ]; then
  PROJECT_DIR=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS" --raw)
  if [ -z "$PROJECT_DIR" ]; then
    echo "[X] ERROR: Project alias '$PROJECT_ALIAS' not found"
    # In JSON mode, show available projects
    node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS"
    exit 1
  fi
  PROJECT_ROOT=$(dirname "$PROJECT_DIR")
  cd "$PROJECT_ROOT"
  echo ">> Resolved --project $PROJECT_ALIAS -> $PROJECT_ROOT"
fi
\`\`\`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cd to project dir manually | No project resolution | Current | Users must navigate to correct directory before running GSD commands |
| N/A | --project flag | Phase 13 | Users can target sub-projects by alias from anywhere |

**Current limitation:** GSD assumes cwd contains `.planning/`. When working in a monorepo with multiple sub-projects, the user must `cd` to the correct sub-project directory before running any GSD command. This wastes tokens when agents resolve the wrong project context.

## Open Questions

1. **Should `list-projects` be added?**
   - What we know: It's marked as Claude's discretion
   - Recommendation: YES -- add `cmdListProjects` to gsd-tools.js. It's a trivial read-and-display function (< 20 lines) that significantly aids usability. Users need to see what aliases are available.

2. **Lazy vs eager path validation?**
   - What we know: Discretion area. Lazy = validate only at resolve time. Eager = validate at registration time too.
   - Recommendation: Validate at BOTH registration and resolution. At registration: confirm `.planning/` exists. At resolution: confirm it still exists. Stale entries get clear error messages.

3. **Absolute vs relative paths in projects.json?**
   - What we know: Relative preferred for portability (locked), but implementation can choose
   - Recommendation: Store relative paths. When registering, compute relative path from root `.planning/` parent directory to the sub-project's `.planning/` directory. When resolving, use path.resolve() against the root.

4. **How many command/workflow files need modification?**
   - Commands: 28 files in `commands/gsd/` -- all need `--project` in argument-hint
   - Workflows: Only those that read `.planning/` need Step 0. Estimate ~15 workflow files.
   - Not all commands route to a workflow with `.planning/` reads (e.g., `help.md`, `join-discord.md`), but adding --project to their argument-hint is harmless and keeps consistency.

## Discretion Recommendations

Based on the discretion areas from CONTEXT.md:

| Area | Recommendation | Rationale |
|------|---------------|-----------|
| Error message wording | Descriptive, listing available aliases | Aids debugging in agent mode where user isn't present |
| list-projects command | YES, add it | Trivial (~20 lines), high usability value |
| Absolute vs relative paths | Relative | Portability when repo is cloned/moved; locked preference |
| Validation depth | Both registration and resolution | Prevents stale entries from causing confusion |

## Sources

### Primary (HIGH confidence)
- gsd-tools.js source code (949 lines) -- direct analysis of existing patterns
- 28 command .md files in commands/gsd/ -- frontmatter and routing patterns
- ~15 workflow .md files in get-shit-done/workflows/ -- $ARGUMENTS parsing patterns
- 13-CONTEXT.md -- user decisions and locked implementation details

### Secondary (MEDIUM confidence)
- Node.js path module documentation -- path.resolve() behavior with relative paths
- Node.js fs module documentation -- readFileSync/writeFileSync patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- entirely within existing codebase, no external dependencies
- Architecture: HIGH -- follows well-established patterns already in gsd-tools.js and command files
- Pitfalls: HIGH -- identified from direct codebase analysis (Windows paths, $ARGUMENTS stripping, workflow tracing)

**Research date:** 2026-02-21
**Valid until:** Indefinite (internal tooling, not subject to external API changes)

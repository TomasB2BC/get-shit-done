---
name: gsd:register-project
description: Register current directory as a named project alias in projects.json
argument-hint: "[--project <alias>] [alias]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---
<objective>
Register the current directory's `.planning/` as a project in the root `projects.json` registry.

If alias is provided via argument, use it; otherwise derive from directory name.
Validates that `.planning/` exists in current directory before registering.
Idempotent: re-registering same alias with same path is a no-op; same alias with different path is an error.

**After this command:** Use `--project <alias>` with any GSD command to target this project.
</objective>

<context>
Alias: $ARGUMENTS (optional -- derives from directory name if omitted)
</context>

<process>

## 1. Validate Environment

```bash
PLANNING_EXISTS=$(node ~/.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning --raw)
```

**If not found:** Error -- this directory has no `.planning/` directory. Run `/gsd:new-project` first.

## 2. Determine Alias

```bash
# If $ARGUMENTS has an alias (first word, not a flag), use it
ALIAS=$(echo "$ARGUMENTS" | grep -oP '^\S+' | grep -v '^--')
# If empty, derive from directory name
if [ -z "$ALIAS" ]; then
  ALIAS=$(basename "$(pwd)")
fi
echo "Alias: $ALIAS"
```

## 3. Find Root projects.json

The root `.planning/` is the one containing `projects.json`, or the nearest parent `.planning/` directory. If no parent has `.planning/`, use current directory's `.planning/` as root.

```bash
# Compute relative path from root to current .planning/
PLANNING_DIR=".planning"
```

## 4. Register Project

```bash
RESULT=$(node ~/.claude/get-shit-done/bin/gsd-tools.js register-project "$ALIAS" --dir "$PLANNING_DIR")
echo "$RESULT"
```

## 5. Display Result

If registered successfully:
```
[OK] Project registered: "$ALIAS" -> $PLANNING_DIR
Use: /gsd:execute-phase 1 --project $ALIAS
```

If already registered (same path):
```
[OK] Project "$ALIAS" already registered (no changes)
```

If error (alias conflict):
```
[X] ERROR: Alias "$ALIAS" already registered to a different path
Current: $EXISTING_PATH
```

</process>

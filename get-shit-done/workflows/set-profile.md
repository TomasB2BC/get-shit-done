<purpose>
Switch the model profile used by GSD agents. Controls which Claude model each agent uses, balancing quality vs token spend.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="project_resolution">

## 0. Project Resolution

```bash
PROJECT_ALIAS=""
if echo "$ARGUMENTS" | grep -q '\-\-project'; then
  PROJECT_ALIAS=$(echo "$ARGUMENTS" | grep -oP '(?<=--project\s)\S+')
  ARGUMENTS=$(echo "$ARGUMENTS" | sed 's/--project[[:space:]]\+[[:graph:]]\+//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
fi

if [ -n "$PROJECT_ALIAS" ]; then
  PROJECT_DIR=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS" --raw)
  if [ -z "$PROJECT_DIR" ]; then
    echo "[X] ERROR: Project alias '$PROJECT_ALIAS' not found"
    node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-project "$PROJECT_ALIAS"
    # Stop execution
  fi
  PROJECT_ROOT=$(dirname "$PROJECT_DIR")
  cd "$PROJECT_ROOT"
  echo ">> Resolved --project $PROJECT_ALIAS -> $PROJECT_ROOT"
fi
```

</step>

<step name="validate">
Validate argument:

```
if $ARGUMENTS.profile not in ["quality", "balanced", "budget"]:
  Error: Invalid profile "$ARGUMENTS.profile"
  Valid profiles: quality, balanced, budget
  EXIT
```
</step>

<step name="ensure_config">
```bash
node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js config-ensure-section
```

Creates `.planning/config.json` with defaults if missing.
</step>

<step name="update_config">
Read current config:
```bash
cat .planning/config.json
```

Read ALL current field values from the existing config. Write the complete config back with ONLY `model_profile` changed. All other fields (`mode`, `depth`, `parallelization`, `commit_docs`, `workflow`, `git`, `orchestration`, `agent_teams`) must be preserved exactly as they were.

Update `model_profile` field:
```json
{
  ...all_existing_fields_preserved,
  "model_profile": "$ARGUMENTS.profile"
}
```

Write updated config back to `.planning/config.json`.
</step>

<step name="confirm">
Display confirmation with model table for selected profile:

```
✓ Model profile set to: $ARGUMENTS.profile

Agents will now use:

[Show table from MODEL_PROFILES in gsd-tools.js for selected profile]

Example:
| Agent | Model |
|-------|-------|
| gsd-planner | opus |
| gsd-executor | sonnet |
| gsd-verifier | haiku |
| ... | ... |

Next spawned agents will use the new profile.
```

Map profile names:
- quality: use "quality" column from MODEL_PROFILES
- balanced: use "balanced" column from MODEL_PROFILES
- budget: use "budget" column from MODEL_PROFILES
</step>

</process>

<success_criteria>
- [ ] Argument validated
- [ ] Config file ensured
- [ ] Config updated with new model_profile
- [ ] Confirmation displayed with model table
</success_criteria>

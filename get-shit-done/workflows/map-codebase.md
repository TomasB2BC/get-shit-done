<purpose>
Orchestrate parallel codebase mapper agents to analyze codebase and produce structured documents in .planning/codebase/

Each agent has fresh context, explores a specific focus area, and **writes documents directly**. The orchestrator only receives confirmation + line counts, then writes a summary.

Output: .planning/codebase/ folder with 7 structured documents about the codebase state.
</purpose>

<philosophy>
**Why dedicated mapper agents:**
- Fresh context per domain (no token contamination)
- Agents write documents directly (no context transfer back to orchestrator)
- Orchestrator only summarizes what was created (minimal context usage)
- Faster execution (agents run simultaneously)

**Document quality over length:**
Include enough detail to be useful as reference. Prioritize practical examples (especially code patterns) over arbitrary brevity.

**Always include file paths:**
Documents are reference material for Claude when planning/executing. Always include actual file paths formatted with backticks: `src/services/user.ts`.
</philosophy>

<process>


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

<step name="resolve_model_profile" priority="first">
```bash
MAPPER_MODEL=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js resolve-model gsd-codebase-mapper --raw)
```

**Detect agent mode:**

```bash
AGENT_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"agent_mode"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
```
</step>

<step name="check_existing">
Check if .planning/codebase/ already exists:

```bash
CODEBASE_MAP_EXISTS=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js verify-path-exists .planning/codebase --raw)
[ "$CODEBASE_MAP_EXISTS" = "true" ] && ls -la .planning/codebase/
```

**If exists:**

**If AGENT_MODE=true:**

Auto-decide refresh vs skip:

```bash
DECISION=$(node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type binary --question "Codebase map exists. Refresh?" --options '["Refresh - Remap codebase","Skip - Use existing"]' --raw)
```

If "Refresh": Delete .planning/codebase/, continue to create_structure
If "Skip": Exit workflow

**If AGENT_MODE=false (classic):**

```
.planning/codebase/ already exists with these documents:
[List files found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific documents
3. Skip - Use existing codebase map as-is
```

Wait for user response.

If "Refresh": Delete .planning/codebase/, continue to create_structure
If "Update": Ask which documents to update, continue to spawn_agents (filtered)
If "Skip": Exit workflow

**If doesn't exist:**
Continue to create_structure.
</step>

<step name="create_structure">
Create .planning/codebase/ directory:

```bash
mkdir -p .planning/codebase
```

**Expected output files:**
- STACK.md (from tech mapper)
- INTEGRATIONS.md (from tech mapper)
- ARCHITECTURE.md (from arch mapper)
- STRUCTURE.md (from arch mapper)
- CONVENTIONS.md (from quality mapper)
- TESTING.md (from quality mapper)
- CONCERNS.md (from concerns mapper)

Continue to spawn_agents.
</step>

<step name="spawn_agents">
**Detect orchestration mode:**

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
USE_HYBRID=false
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check
  AGENT_TEAMS_MAPPING=$(cat .planning/config.json 2>/dev/null | grep -A5 '"agent_teams"' | grep -o '"codebase_mapping"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_MAPPING" = "true" ]; then
    USE_HYBRID=true
  fi
fi

# Step 5: Graceful fallback warning
if [ "$USE_HYBRID" = "false" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo "[!] WARNING: orchestration=hybrid but Agent Teams not available or codebase_mapping not enabled"
  echo "[!] Falling back to classic mode"
fi
```

**If USE_HYBRID=true: Hybrid Mapping (Agent Teams - Collaborative Team)**

Display hybrid indicator:
```
>> Using Agent Teams for codebase mapping (hybrid mode)
>> Collaborative protocol: tech + arch + quality + concerns
```

**Step M1: Create mapping team**

```
TeamCreate(
  team_name="codebase-mapping",
  description="Codebase mapping - collaborative team (tech, arch, quality, concerns)"
)
```

If TeamCreate fails, display warning and set FALLBACK_TO_CLASSIC=true:
```
[!] WARNING: Agent Teams team creation failed, falling back to classic mode
```

**Step M2: Spawn 4 mapper teammates**

Spawn all 4 in parallel using Task with team_name and name parameters.

**Prepend auto_mode context if AGENT_MODE=true:**

```
AUTO_MODE_CONTEXT=""
if [ "$AGENT_MODE" = "true" ]; then
  AUTO_MODE_CONTEXT="<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

"
fi
```

**Spawn teammates with auto_mode context prepended:**

```
Task(prompt="${AUTO_MODE_CONTEXT}First, read C:\Users\tomas\.claude/agents/gsd-codebase-mapper.md for your role and instructions.

<mode>teammate</mode>
<team_name>codebase-mapping</team_name>
<focus>tech</focus>

<objective>
Analyze this codebase for technology stack and external integrations.

Write these documents to .planning/codebase/:
- STACK.md - Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md - External APIs, databases, auth providers, webhooks

Round 1: Explore thoroughly, write documents, broadcast key findings (3-5 bullets with cross-dimension notes).
Round 2: Read other mappers' documents, update yours based on cross-references.
</objective>",
  subagent_type="gsd-codebase-mapper",
  model="${MAPPER_MODEL}",
  description="Map codebase tech stack",
  team_name="codebase-mapping",
  name="tech"
)

Task(prompt="${AUTO_MODE_CONTEXT}First, read C:\Users\tomas\.claude/agents/gsd-codebase-mapper.md for your role and instructions.

<mode>teammate</mode>
<team_name>codebase-mapping</team_name>
<focus>arch</focus>

<objective>
Analyze this codebase architecture and directory structure.

Write these documents to .planning/codebase/:
- ARCHITECTURE.md - Pattern, layers, data flow, abstractions, entry points
- STRUCTURE.md - Directory layout, key locations, naming conventions

Round 1: Explore thoroughly, write documents, broadcast key findings (3-5 bullets with cross-dimension notes).
Round 2: Read other mappers' documents, update yours based on cross-references.
</objective>",
  subagent_type="gsd-codebase-mapper",
  model="${MAPPER_MODEL}",
  description="Map codebase architecture",
  team_name="codebase-mapping",
  name="arch"
)

Task(prompt="${AUTO_MODE_CONTEXT}First, read C:\Users\tomas\.claude/agents/gsd-codebase-mapper.md for your role and instructions.

<mode>teammate</mode>
<team_name>codebase-mapping</team_name>
<focus>quality</focus>

<objective>
Analyze this codebase for coding conventions and testing patterns.

Write these documents to .planning/codebase/:
- CONVENTIONS.md - Code style, naming, patterns, error handling
- TESTING.md - Framework, structure, mocking, coverage

Round 1: Explore thoroughly, write documents, broadcast key findings (3-5 bullets with cross-dimension notes).
Round 2: Read other mappers' documents, update yours based on cross-references.
</objective>",
  subagent_type="gsd-codebase-mapper",
  model="${MAPPER_MODEL}",
  description="Map codebase conventions",
  team_name="codebase-mapping",
  name="quality"
)

Task(prompt="${AUTO_MODE_CONTEXT}First, read C:\Users\tomas\.claude/agents/gsd-codebase-mapper.md for your role and instructions.

<mode>teammate</mode>
<team_name>codebase-mapping</team_name>
<focus>concerns</focus>

<objective>
Analyze this codebase for technical debt, known issues, and areas of concern.

Write this document to .planning/codebase/:
- CONCERNS.md - Tech debt, bugs, security, performance, fragile areas

Round 1: Explore thoroughly, write document, broadcast key findings (3-5 bullets with cross-dimension notes).
Round 2: Read ALL other mappers' documents (your CONCERNS.md benefits most from cross-references), update yours based on insights from tech stack risks, architectural weaknesses, and quality gaps.
</objective>",
  subagent_type="gsd-codebase-mapper",
  model="${MAPPER_MODEL}",
  description="Map codebase concerns",
  team_name="codebase-mapping",
  name="concerns"
)
```

If any teammate fails to spawn, log warning. If fewer than 3 teammates spawn successfully (0-2 succeed), set FALLBACK_TO_CLASSIC=true. If 3 spawn, continue with available teammates and log warning for missing mapper's documents.

**Step M3: Wait for Round 1 completion**

**IMPORTANT: The orchestrator MUST wait here. Do NOT start writing or modifying any files.** Idle notifications are delivered automatically. Do NOT proceed to Round 2 until all spawned teammates have gone idle.

After all teammates go idle, verify documents are being created:

```bash
ls .planning/codebase/*.md 2>/dev/null | wc -l
```

If zero documents exist, set FALLBACK_TO_CLASSIC=true. If some exist, continue with Round 2.

**Step M4: Prompt Round 2 (Cross-Reference Refinement)**

Send messages to each teammate to begin Round 2. Only send to teammates that actually spawned:

```
SendMessage(
  type="message",
  recipient="tech",
  content="Round 2: Read the other mappers' documents at .planning/codebase/. Check TESTING.md for test frameworks to add to STACK.md, and CONCERNS.md for dependency risks. Update your STACK.md and INTEGRATIONS.md with any cross-referenced insights. Send CROSS-REFERENCE messages to other mappers if you have useful information for them. Stop when your documents are updated.",
  summary="Start Round 2 cross-referencing"
)

SendMessage(
  type="message",
  recipient="arch",
  content="Round 2: Read the other mappers' documents at .planning/codebase/. Check STACK.md for framework architecture patterns, and CONCERNS.md for fragile areas suggesting architectural weaknesses. Update your ARCHITECTURE.md and STRUCTURE.md with cross-referenced insights. Send CROSS-REFERENCE messages to other mappers if you have useful information for them. Stop when your documents are updated.",
  summary="Start Round 2 cross-referencing"
)

SendMessage(
  type="message",
  recipient="quality",
  content="Round 2: Read the other mappers' documents at .planning/codebase/. Check STACK.md for tech stack conventions (e.g., TypeScript strict mode), and ARCHITECTURE.md for patterns that dictate testing strategy. Update your CONVENTIONS.md and TESTING.md with cross-referenced insights. Send CROSS-REFERENCE messages to other mappers if you have useful information for them. Stop when your documents are updated.",
  summary="Start Round 2 cross-referencing"
)

SendMessage(
  type="message",
  recipient="concerns",
  content="Round 2: Read ALL other mappers' documents at .planning/codebase/. Your CONCERNS.md benefits most from cross-references. Check STACK.md for dependency risks, ARCHITECTURE.md for boundary violations, CONVENTIONS.md and TESTING.md for quality gaps. Update your CONCERNS.md with issues identified through cross-referencing. Send CROSS-REFERENCE messages to other mappers if you have useful information for them. Stop when your document is updated.",
  summary="Start Round 2 cross-referencing"
)
```

**Step M5: Wait for Round 2 completion**

**IMPORTANT: Wait here for all active teammates to go idle again.** Idle notifications are delivered automatically. Do NOT proceed until all have gone idle.

**Step M6: Verify all 7 documents exist with substantive content**

```bash
# Verify all 7 documents exist with >20 lines each
DOCS_OK=true
for doc in STACK.md INTEGRATIONS.md ARCHITECTURE.md STRUCTURE.md CONVENTIONS.md TESTING.md CONCERNS.md; do
  LINES=$(wc -l < .planning/codebase/$doc 2>/dev/null || echo 0)
  if [ "$LINES" -lt 20 ]; then
    echo "[!] WARNING: $doc only $LINES lines (expected >20)"
    DOCS_OK=false
  fi
done

if [ "$DOCS_OK" = "false" ]; then
  echo "[!] Some documents incomplete -- check mapper output"
fi
```

This is a warning only, not a fallback trigger.

**Step M7: Shutdown teammates**

Send shutdown to teammates that actually spawned:

```
SendMessage(type="shutdown_request", recipient="tech", content="Mapping complete. Thank you for your work.")
SendMessage(type="shutdown_request", recipient="arch", content="Mapping complete. Thank you for your work.")
SendMessage(type="shutdown_request", recipient="quality", content="Mapping complete. Thank you for your work.")
SendMessage(type="shutdown_request", recipient="concerns", content="Mapping complete. Thank you for your work.")
```

Wait for shutdown confirmations.

**Step M8: Clean up team**

```
TeamDelete()
```

Display:
```
>> Mapping complete (hybrid mode -- collaborative team)
```

**Step M9: Continue to shared downstream steps**

Continue to collect_confirmations step (shared with classic mode).

---

**If USE_HYBRID=false OR FALLBACK_TO_CLASSIC=true: Classic Mapping (4 isolated Task mappers)**

**If FALLBACK_TO_CLASSIC was set after TeamCreate succeeded (team exists but mapping failed), clean up the team first:**
```
TeamDelete()
```

If FALLBACK_TO_CLASSIC was triggered, display:
```
[!] Hybrid mode failed, using classic mapping mode
```

Spawn 4 parallel gsd-codebase-mapper agents.

Use Task tool with `subagent_type="gsd-codebase-mapper"`, `model="{mapper_model}"`, and `run_in_background=true` for parallel execution.

**CRITICAL:** Use the dedicated `gsd-codebase-mapper` agent, NOT `Explore`. The mapper agent writes documents directly.

**Prepend auto_mode context if AGENT_MODE=true:**

```
AUTO_MODE_CONTEXT=""
if [ "$AGENT_MODE" = "true" ]; then
  AUTO_MODE_CONTEXT="<auto_mode>
You are running in GSD agent mode. For ALL decisions:
- Do NOT call AskUserQuestion
- Use auto-decide for structured questions:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js auto-decide --type <type> --question <question> --options '<json>' --raw
- For freeform questions: generate the answer from codebase context, then log:
  node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision --type freeform --question <question> --decision <answer> --rationale <sources>
</auto_mode>

"
fi
```

**Agent 1: Tech Focus**

Task tool parameters:
```
subagent_type: "gsd-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase tech stack"
```

Prompt:
```
${AUTO_MODE_CONTEXT}Focus: tech

Analyze this codebase for technology stack and external integrations.

Write these documents to .planning/codebase/:
- STACK.md - Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md - External APIs, databases, auth providers, webhooks

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 2: Architecture Focus**

Task tool parameters:
```
subagent_type: "gsd-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase architecture"
```

Prompt:
```
${AUTO_MODE_CONTEXT}Focus: arch

Analyze this codebase architecture and directory structure.

Write these documents to .planning/codebase/:
- ARCHITECTURE.md - Pattern, layers, data flow, abstractions, entry points
- STRUCTURE.md - Directory layout, key locations, naming conventions

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 3: Quality Focus**

Task tool parameters:
```
subagent_type: "gsd-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase conventions"
```

Prompt:
```
${AUTO_MODE_CONTEXT}Focus: quality

Analyze this codebase for coding conventions and testing patterns.

Write these documents to .planning/codebase/:
- CONVENTIONS.md - Code style, naming, patterns, error handling
- TESTING.md - Framework, structure, mocking, coverage

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 4: Concerns Focus**

Task tool parameters:
```
subagent_type: "gsd-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase concerns"
```

Prompt:
```
${AUTO_MODE_CONTEXT}Focus: concerns

Analyze this codebase for technical debt, known issues, and areas of concern.

Write this document to .planning/codebase/:
- CONCERNS.md - Tech debt, bugs, security, performance, fragile areas

Explore thoroughly. Write document directly using template. Return confirmation only.
```

Continue to collect_confirmations.
</step>

<step name="collect_confirmations">
Wait for all 4 agents to complete.

Read each agent's output file to collect confirmations.

**Expected confirmation format from each agent:**
```
## Mapping Complete

**Focus:** {focus}
**Documents written:**
- `.planning/codebase/{DOC1}.md` ({N} lines)
- `.planning/codebase/{DOC2}.md` ({N} lines)

Ready for orchestrator summary.
```

**What you receive:** Just file paths and line counts. NOT document contents.

If any agent failed, note the failure and continue with successful documents.

Continue to verify_output.
</step>

<step name="verify_output">
Verify all documents created successfully:

```bash
ls -la .planning/codebase/
wc -l .planning/codebase/*.md
```

**Verification checklist:**
- All 7 documents exist
- No empty documents (each should have >20 lines)

If any documents missing or empty, note which agents may have failed.

Continue to scan_for_secrets.
</step>

<step name="scan_for_secrets">
**CRITICAL SECURITY CHECK:** Scan output files for accidentally leaked secrets before committing.

Run secret pattern detection:

```bash
# Check for common API key patterns in generated docs
grep -E '(sk-[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]+|sk_test_[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|xox[baprs]-[a-zA-Z0-9-]+|-----BEGIN.*PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.)' .planning/codebase/*.md 2>/dev/null && SECRETS_FOUND=true || SECRETS_FOUND=false
```

**If SECRETS_FOUND=true:**

**If AGENT_MODE=true:**

Log and auto-proceed (codebase map docs are gitignored):

```bash
node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js log-decision \
  --type freeform \
  --question "Potential secrets detected in codebase documents. Proceed?" \
  --decision "Auto-proceed - codebase map documents are gitignored" \
  --rationale ".planning/codebase/ is in .gitignore, no commit exposure risk"
```

Continue to commit_codebase_map.

**If AGENT_MODE=false (classic):**

```
⚠️  SECURITY ALERT: Potential secrets detected in codebase documents!

Found patterns that look like API keys or tokens in:
[show grep output]

This would expose credentials if committed.

**Action required:**
1. Review the flagged content above
2. If these are real secrets, they must be removed before committing
3. Consider adding sensitive files to Claude Code "Deny" permissions

Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.
```

Wait for user confirmation before continuing to commit_codebase_map.

**If SECRETS_FOUND=false:**

Continue to commit_codebase_map.
</step>

<step name="commit_codebase_map">
Commit the codebase map:

```bash
node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js commit "docs: map existing codebase" --files .planning/codebase/*.md
```

Continue to offer_next.
</step>

<step name="offer_next">
Present completion summary and next steps.

**Get line counts:**
```bash
wc -l .planning/codebase/*.md
```

**Output format:**

```
Codebase mapping complete.

Created .planning/codebase/:
- STACK.md ([N] lines) - Technologies and dependencies
- ARCHITECTURE.md ([N] lines) - System design and patterns
- STRUCTURE.md ([N] lines) - Directory layout and organization
- CONVENTIONS.md ([N] lines) - Code style and patterns
- TESTING.md ([N] lines) - Test structure and practices
- INTEGRATIONS.md ([N] lines) - External services and APIs
- CONCERNS.md ([N] lines) - Technical debt and issues


---

## ▶ Next Up

**Initialize project** — use codebase context for planning

`/gsd:new-project`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Re-run mapping: `/gsd:map-codebase`
- Review specific file: `cat .planning/codebase/STACK.md`
- Edit any document before proceeding

---
```

End workflow.
</step>

</process>

<success_criteria>
- .planning/codebase/ directory created
- 4 parallel gsd-codebase-mapper agents spawned with run_in_background=true
- Agents write documents directly (orchestrator doesn't receive document contents)
- Read agent output files to collect confirmations
- All 7 codebase documents exist
- Clear completion summary with line counts
- User offered clear next steps in GSD style
</success_criteria>

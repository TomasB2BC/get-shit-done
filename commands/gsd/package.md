---
name: gsd:package
description: Create stakeholder-ready documents from client intent profiles
argument-hint: "--client <name> --stakeholder <name> [--source <path>] [--review] [topic text]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Task
---

<objective>
Create a stakeholder-ready document outside the GSD pipeline. Takes a client name, a stakeholder name, and either source files or a topic description -- produces a formatted document shaped by the stakeholder's communication preferences from the intent profile.

No pipeline awareness. No STATE.md, no phases, no dispatchers, no verification. Standalone document creation.
</objective>

<process>

## Step 0: Project Resolution

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

## Step 1: Parse Arguments

Extract flags from `$ARGUMENTS`:

1. **`--client <name>`** (required): Scan for `--client` followed by the next non-flag token. Normalize to lowercase.
2. **`--stakeholder <name>`** (required): Scan for `--stakeholder` followed by the next non-flag token. Keep original case for display, lowercase for matching.
3. **`--source <path>`** (optional): Scan for `--source` followed by a path token.
4. **`--review`** (optional, no value): Scan for `--review` flag. Set `REVIEW_MODE=true` if present. Strip from remaining text.
5. **Free text** (optional): Everything remaining after stripping all flags and their values. Strip leading/trailing whitespace.

**Validation (stop on first error):**

- If `--client` is absent:
  ```
  [X] --client <name> is required
  Usage: /gsd:package --client <name> --stakeholder <name> [--source <path>] [--review] [topic text]
  ```
  Stop execution.

- If `--stakeholder` is absent:
  ```
  [X] --stakeholder <name> is required
  Usage: /gsd:package --client <name> --stakeholder <name> [--source <path>] [--review] [topic text]
  ```
  Stop execution.

- If neither `--source` nor free text is provided:
  ```
  [X] Provide --source files or a topic description.
  Usage: /gsd:package --client <name> --stakeholder <name> [--source <path>] [--review] [topic text]
  ```
  Stop execution.

**Auto-review detection (hybrid mode):**

If `--review` was not explicitly passed, check if auto-review is configured:

```bash
# Step 1: Read orchestration mode from config
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Step 2: Check environment variable
AGENT_TEAMS_ENV=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}

# Step 3: Compound check -- BOTH must be true
if [ "$ORCH_MODE" = "hybrid" ] && [ "$AGENT_TEAMS_ENV" = "1" ]; then
  # Step 4: Per-command toggle check (only when compound check passes)
  AGENT_TEAMS_DELIVERY=$(cat .planning/config.json 2>/dev/null | grep -A6 '"agent_teams"' | grep -o '"delivery"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
  if [ "$AGENT_TEAMS_DELIVERY" = "true" ]; then
    REVIEW_MODE=true
    echo ">> Auto-review enabled (agent_teams.delivery=true)"
  fi
fi

# Step 5: Graceful fallback warning
if [ "$REVIEW_MODE" != "true" ] && [ "$ORCH_MODE" = "hybrid" ]; then
  echo ">> Review mode not active (agent_teams.delivery not enabled or Agent Teams env not set)"
fi
```

## Step 2: Resolve and Load Client Intent Profile

Find the intent directory by searching upward from the current working directory:

1. Check `{cwd}/.planning/intent/clients/` -- if exists, use it
2. If not, walk up parent directories checking each for `.planning/intent/clients/`
3. If still not found, check the known B2BC location: `C:/Users/tomas/Documents/B2BC/.planning/intent/clients/`

```bash
INTENT_DIR=""
SEARCH_DIR="$(pwd)"
while [ "$SEARCH_DIR" != "/" ] && [ ${#SEARCH_DIR} -gt 2 ]; do
  if [ -d "$SEARCH_DIR/.planning/intent/clients" ]; then
    INTENT_DIR="$SEARCH_DIR/.planning/intent/clients"
    break
  fi
  SEARCH_DIR=$(dirname "$SEARCH_DIR")
done
# Fallback to known B2BC location
if [ -z "$INTENT_DIR" ] && [ -d "/c/Users/tomas/Documents/B2BC/.planning/intent/clients" ]; then
  INTENT_DIR="/c/Users/tomas/Documents/B2BC/.planning/intent/clients"
fi
echo "$INTENT_DIR"
```

Construct profile path: `{INTENT_DIR}/{lowercase-client-name}.md`

Read the file using the Read tool.

**Error handling:**

- If no intent directory found:
  ```
  [X] No .planning/intent/clients/ directory found (searched upward from cwd and B2BC fallback)
  ```
  Stop execution.

- If the file does not exist, list available profiles and stop:
  ```
  [X] Client profile not found: {client}.md
      Available clients: {list from globbing *.md, excluding _template.md}
  ```
  Stop execution.

## Step 3: Extract Stakeholder Section

Parse the `## Stakeholders` section of the profile. For each `### ` heading under Stakeholders, extract match tokens:

- **Full name** (text before any ` -- ` separator or ` (` parenthetical)
- **First name** (first word of the full name)
- **Parenthetical abbreviations** like (MK), (Giovanna) -- extract text inside parentheses that is NOT the organization/role part

Examples:
- `### Kevin Chiu (HelloThea -- Founder/CEO)` -> tokens: ["Kevin Chiu", "Kevin"]
- `### Mary Katherine Scarbrough (MK) -- Wpromote Leadership` -> tokens: ["Mary Katherine Scarbrough", "Mary Katherine", "MK"]
- `### Gio (Giovanna) -- Wpromote RevOps` -> tokens: ["Gio", "Giovanna"]
- `### SDR Team (~20 reps) -- End Users` -> tokens: ["SDR Team", "SDR"]

Match the `--stakeholder` value (case-insensitive) against all tokens. Use the FIRST match found.

From the matched stakeholder section, extract:
- **Communication style** (from the `Communication style:` field)
- **What resonates** (from the `What resonates:` field)
- **What to avoid** (from the `What to avoid:` field)
- **Decision authority** (from the `Decision authority:` field)

Also extract from the profile's top-level sections:
- **Communication Preferences** -> Preferred doc format, Jargon tolerance for this stakeholder
- **Agent Instructions** -> Rules that apply to all output for this client
- **Values & Priorities** -> Primary business objective, success metrics, constraints

**Error handling:**

- If stakeholder not found, list available stakeholders and stop:
  ```
  [X] Stakeholder "{name}" not found in {client} profile.
      Available stakeholders: {list of ### headings from Stakeholders section}
  ```
  Stop execution.

## Step 4: Gather Source Content

Four modes based on what arguments are provided:

### Mode A: `--source` is a file
Read that single file using the Read tool.

### Mode B: `--source` is a directory
Read all `.md` files in the directory using Glob to list them, then Read each. Concatenate with file headers separating each:
```
--- {filename} ---
{content}
```
Cap at 10 files. If more than 10, read the 10 most recently modified.

### Mode C: Topic text only (no --source)
Use Glob and Grep to find relevant files in the repo matching key terms from the topic description. Search in:
- `.planning/` (phase work, context docs)
- `docs/` (if exists)
- `src/` (if exists)
- Project root `.md` files

Read the top 3-5 most relevant matches. "Relevant" = highest grep match count for topic keywords.

### Mode D: Both --source and topic text
Read the source files (Mode A or B). The topic text becomes the **framing instruction** -- it tells the LLM how to present the source content for this stakeholder. Example: `--source docs/pipeline/ "summarize for Kevin focusing on timeline and cost"`.

## Step 5: Create Document

Using the stakeholder's preferences extracted in Step 3, create the document by applying these editorial rules:

### 5a. Format Preference

Apply their preferred document format:
- **Matrices with data / structured:** Use markdown tables, numbered lists, clear section headers
- **Narrative + data tables:** Flowing prose with embedded data tables at key points
- **Bullet points / concise:** Tight bullet-point structure, no narrative padding
- **Plain text:** No markdown formatting, dashes for bullets, section dividers with `---`

If format preference is not explicit, default to markdown with clear headers and bullets.

### 5b. Language Adaptation

Adjust technical language to the stakeholder's jargon tolerance:

**Non-technical / low jargon:** Remove ALL snake_case identifiers, file paths, CLI commands, schema references, agent names, and technical jargon. Convert code blocks to prose descriptions. Replace technical terms with plain language equivalents. Focus on outcomes and business impact.

**Medium / business fluent:** Remove implementation details but keep business metrics. Remove raw JSON, implementation-level code, agent internals. Keep architecture-level descriptions and workflow summaries. Use industry terminology but avoid code-level detail.

**High / technical:** Minimal adaptation. Content is already technical. Strip only internal references (.planning/ paths, agent names).

### 5c. Priority-First Structure

Lead the document with what the stakeholder cares about:
- Read the "What resonates" field -- put those elements first
- Read "Values & Priorities" -- align the document's framing to their primary objective
- If the stakeholder values specificity (exact numbers, costs, timelines), lead with concrete data
- If the stakeholder values strategic overview, lead with outcomes and business impact

### 5d. Anti-Pattern Exclusion

Read the "What to avoid" field and actively exclude those patterns:
- If "ranges instead of numbers" is listed, use exact figures
- If "verbose docs" is listed, keep it tight
- If "surface-level analysis" is listed, show depth and reasoning
- If "open-ended questions" is listed, offer options instead of asking

### 5e. Agent Instructions Compliance

Read the "Agent Instructions" section and apply all rules. These are hard constraints:
- "Scott reviews everything before Kevin sees it" -> note this in output if relevant
- "Test before scale" -> frame recommendations accordingly
- Any explicit formatting or content rules

### 5f. Compliance Check

Before finalizing, scan the draft for internal leakage:
- Absolute file paths (`/Users/`, `C:\`, `~/.claude/`)
- `.planning/` references
- Agent names (`gsd-*`, `gsd_*`)
- Token counts or context window references
- Snake_case variable names (for non-technical stakeholders)

If violations found, rewrite the offending sections to remove them.

## Step 6: Write Output

### Generate topic slug

Derive `{topic-slug}` from:
- If topic text provided: slugify the first 5-6 significant words
- If `--source` is a directory: use the directory name
- If `--source` is a file: use the filename without extension
- If both: use the topic text slug

Slugification: lowercase, replace spaces with hyphens, strip non-alphanumeric-hyphen characters, truncate to 50 characters max.

### Write the file

Output path: `deliverables/{client}/{stakeholder}/{YYYY-MM-DD}-{topic-slug}.md`

- `{client}` -- lowercase client name
- `{stakeholder}` -- lowercase stakeholder first name or abbreviation (what was matched)
- `{YYYY-MM-DD}` -- today's date
- `{topic-slug}` -- generated above

Create directories if they do not exist (use Bash: `mkdir -p`).

Write the document using the Write tool.

**Do NOT git commit.** The user decides when to commit.

## Step 6.5: Stakeholder Persona Review (conditional)

If `REVIEW_MODE` is not true, skip to Step 7.

Spawn the gsd-delivery-packager agent in review mode to evaluate the document from the stakeholder's perspective:

```
Task(
  prompt="You are a gsd-delivery-packager agent in REVIEW MODE.

Review this document from the stakeholder's perspective:

**Document path:** {output-path-from-step-6}
**Client:** {client-name}
**Stakeholder:** {stakeholder-name}
**Intent directory:** {INTENT_DIR}

Walk the context-gathering path:
1. Read intent/clients/{client}.md for stakeholder profile
2. Read intent/decision-taxonomy.md and intent/autonomy-levels.md if they exist
3. Read PROJECT.md and STATE.md for current project context
4. Read client-specific PROJECT.md if exists (clients/{client}/PROJECT.md)
5. Read any stakeholder-specific profiles found via Glob

Then read the document and produce a review file at:
  {deliverable-dir}/{date}-{slug}-review.md

Review criteria:
- Communication style match (does the doc match their style?)
- Priority ordering (does it lead with what resonates?)
- Anti-pattern compliance (does it avoid what they dislike?)
- Jargon level (appropriate for this stakeholder?)
- Agent instructions compliance (are hard constraints honored?)
- Internal leakage check (no file paths, agent names, .planning/ refs)

Output format:
# Stakeholder Review: {stakeholder name}

## Alignment Score: {HIGH | MEDIUM | LOW}

## What Works
- [specific positive elements]

## Suggestions
- [constructive, non-blocking suggestions]

## Style Notes
- [format fit, jargon assessment, priority ordering]",
  subagent_type="general",
  description="Stakeholder persona review: {stakeholder} for {client}"
)
```

Read the review file. Extract the alignment score for the confirmation message.

If alignment score is LOW, display a warning:
```
[!] Stakeholder review flagged LOW alignment. See review file for suggestions.
```

## Step 7: Confirmation

Output:
```
[OK] Document created: deliverables/{client}/{stakeholder}/{YYYY-MM-DD}-{topic-slug}.md
     Client: {client name}
     Stakeholder: {stakeholder display name} ({role})
     Format: {format preference applied}
     Source: {source files or "generated from topic"}
     Review: {review file path} ({alignment score}) | skipped (--review not passed)
```

</process>

<success_criteria>
- [ ] --client and --stakeholder flags parsed correctly
- [ ] Client profile loaded from upward directory search or B2BC fallback
- [ ] Stakeholder matched using case-insensitive, first-name, or abbreviation matching
- [ ] Source content gathered from file, directory, topic search, or both
- [ ] Document formatted per stakeholder preferences (format, jargon, priorities, anti-patterns)
- [ ] Output written to deliverables/{client}/{stakeholder}/{date}-{slug}.md
- [ ] Clear error messages when --client missing, --stakeholder missing, profile not found, or stakeholder not found
- [ ] No internal leakage in output (file paths, .planning/ refs, agent names)
- [ ] Review spawned when --review flag passed or agent_teams.delivery auto-detected
- [ ] Review file created alongside deliverable with alignment score
</success_criteria>

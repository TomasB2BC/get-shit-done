# Phase 12: Decimal Phase Support - Research

**Researched:** 2026-02-21
**Domain:** GSD auto-dispatch loop / gsd-tools.js tooling (internal codebase)
**Confidence:** HIGH

## Summary

Phase 12 is a dispatcher-internal bug fix. The auto-dispatch.md workflow (1381 lines) uses integer arithmetic and integer-only regex patterns in 6+ locations, causing decimal phases (5.1, 5.2) created by `/gsd:insert-phase` to be silently skipped during autonomous dispatch. The fix requires: (1) a new `list-phases` command in gsd-tools.js that enumerates all phase directories in sorted order, and (2) updating auto-dispatch.md to iterate over the enumerated list instead of incrementing an integer counter.

The scope is well-bounded. No external dependencies. No changes to other workflows (they receive phase numbers as arguments and pass to `find-phase`, which already handles decimals). gsd-tools.js `normalizePhaseName` and `cmdFindPhase` already handle decimal phase numbers correctly. The gap is exclusively in auto-dispatch.md's sequencing logic and two regex patterns.

**Primary recommendation:** Add `list-phases` command to gsd-tools.js, then replace the integer-based dispatch loop with array-based iteration over the sorted phase list from `list-phases`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase enumeration strategy:**
- Replace integer-increment with directory-based enumeration via new gsd-tools.js command
- New `list-phases` command returns all phase numbers sorted numerically
- Sort order: 5 < 5.1 < 5.2 < 6 (numeric, not lexicographic)
- Raw output: one phase number per line

**Dispatcher loop redesign:**
- While loop iterates over enumerated phase list (array + index), not integer counting
- TOTAL_PHASES from enumerated directory list, not ROADMAP.md grep
- Starting position found by matching CURRENT_PHASE in the ordered list

**Regex updates:**
- CURRENT_PHASE extraction: `\d+` must become `\d+(\.\d+)?`
- RESUME_PHASE extraction: `(?<=phase=)\d+` must become `(?<=phase=)[\d.]+`

**gsd-tools.js changes:**
- Add `list-phases` command that reads `.planning/phases/`, extracts phase numbers, sorts numerically, returns ordered list
- JSON and `--raw` formats (raw = newline-separated phase numbers)

**Backward compatibility:**
- Integer-only milestones must work identically to today

### Claude's Discretion

- Exact name of new command (recommendation: `list-phases` -- consistent with `find-phase`)
- Whether to add `next-phase` helper command
- Progress display format with decimal phases
- Enumerated list scope (current milestone vs all phases)
- Edge case handling (empty dir, roadmap-only phases, dir-only phases)
- Re-enumerate per loop iteration vs once at startup

### Deferred Ideas (OUT OF SCOPE)

- Mid-run phase insertion detection
- Phase dependency graph awareness
- Phase gap detection
- Sub-decimal phases (5.1.1)
- Renumbering tool
- /gsd:progress display changes
</user_constraints>

## Standard Stack

This phase is purely internal -- modifying bash pseudo-code in auto-dispatch.md and adding a JavaScript function to gsd-tools.js. No external libraries or dependencies.

### Core

| Component | File | Purpose | Current State |
|-----------|------|---------|---------------|
| auto-dispatch.md | get-shit-done/workflows/auto-dispatch.md (1381 lines) | Dispatch loop workflow | Has 6+ integer-assumption bugs |
| gsd-tools.js | get-shit-done/bin/gsd-tools.js (883 lines) | CLI toolbox | Needs new `list-phases` command |

### Supporting (Already Working -- NO CHANGES NEEDED)

| Component | File | Purpose | Decimal Status |
|-----------|------|---------|----------------|
| normalizePhaseName | gsd-tools.js line 147 | Pads phase numbers (5 -> "05", 5.1 -> "05.1") | Already handles decimals |
| cmdFindPhase | gsd-tools.js line 444 | Finds phase directory by number | Already handles decimals |
| insert-phase.md | workflows/insert-phase.md | Creates decimal phase directories | Already works |
| plan-phase.md | workflows/plan-phase.md | Plans a phase (receives phase arg) | Passes to find-phase |
| execute-phase.md | workflows/execute-phase.md | Executes a phase (receives phase arg) | Passes to find-phase |

## Architecture Patterns

### Pattern 1: gsd-tools.js Command Pattern

All gsd-tools.js commands follow the same pattern:

```javascript
// Source: gsd-tools.js (cmdFindPhase at line 444 as reference)
function cmdListPhases(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  // Read directory, extract phase numbers, sort, output
  // Use output(result, raw, rawValue) for JSON/raw modes
}
```

The existing `cmdFindPhase` at line 444 already reads the phases directory, gets all directory entries, sorts them, and finds a match. The new `list-phases` command reuses this exact directory-reading pattern but returns ALL phase numbers instead of searching for one.

**Command registration:** Commands are registered in the main switch statement at the bottom of gsd-tools.js (around line 780+). Pattern:

```javascript
case 'list-phases':
  cmdListPhases(cwd, raw);
  break;
```

### Pattern 2: Numeric Sort for Phase Numbers

The normalizePhaseName function (line 147) zero-pads integer parts:
- "5" -> "05"
- "5.1" -> "05.1"
- "12" -> "12"

Directory names follow the pattern `{padded}-{slug}`:
- `05-original-phase/`
- `05.1-inserted-fix/`
- `06-next-phase/`
- `12-decimal-phase-support/`

**Lexicographic sort of directory names preserves numeric order** when all integers < 100 (single zero-pad). This is because "05" < "05.1" < "06" < "12" lexicographically. However, numeric sort of extracted phase numbers is more reliable and handles edge cases (e.g., if padding were inconsistent).

**Recommended sort:** Extract phase numbers from directory names, then sort numerically:

```javascript
function comparePhaseNumbers(a, b) {
  const [aInt, aDec] = a.split('.').map(Number);
  const [bInt, bDec] = b.split('.').map(Number);
  if (aInt !== bInt) return aInt - bInt;
  return (aDec || 0) - (bDec || 0);
}
```

### Pattern 3: Bash Array Iteration (Replacing Integer Loop)

Current pattern (integer-based):
```bash
PHASE=$CURRENT_PHASE
while [ $PHASE -le $TOTAL_PHASES ]; do
  # ... dispatch actions ...
  PHASE=$((PHASE + 1))
done
```

New pattern (array-based):
```bash
# Get sorted phase list from gsd-tools.js
PHASE_LIST=$(node gsd-tools.js list-phases --raw)
TOTAL_PHASES=$(echo "$PHASE_LIST" | wc -l)

# Convert to bash array
IFS=$'\n' read -r -d '' -a PHASES <<< "$PHASE_LIST"

# Find starting index
START_IDX=0
for i in "${!PHASES[@]}"; do
  if [ "${PHASES[$i]}" = "$CURRENT_PHASE" ]; then
    START_IDX=$i
    break
  fi
done

# Iterate from starting position
IDX=$START_IDX
while [ $IDX -lt ${#PHASES[@]} ] && [ $PHASES_COMPLETED -lt $MAX_PHASES ]; do
  PHASE="${PHASES[$IDX]}"
  # ... dispatch actions ...
  # On phase-complete:
  IDX=$((IDX + 1))
done
```

**Key bash consideration:** Phase numbers like "5.1" are strings in bash, not numbers. The array approach treats them as strings throughout, which is correct. Integer comparison (`-le`) is replaced by index comparison (`-lt` on the array index), which is always integer.

### Anti-Patterns to Avoid

- **Anti-pattern: Bash decimal arithmetic** -- Bash `$(( ))` cannot handle decimals. Never use `$((PHASE + 1))` when PHASE might be "5.1". Always use array index advancement.
- **Anti-pattern: Integer comparison on phase numbers** -- `[ $PHASE -le $TOTAL ]` fails when PHASE is "5.1". Use array index for loop control.
- **Anti-pattern: Regex `\d+` for phase numbers** -- This only captures the integer part of "5.1". Always use `\d+(\.\d+)?` or `[\d.]+`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phase sorting | Custom bash sort | gsd-tools.js `list-phases` with JS numeric sort | Bash sort is locale-dependent; JS numeric sort is deterministic |
| Phase number extraction | Multiple grep/sed patterns | normalizePhaseName (already exists) | Consistent handling of padding and decimal format |
| Phase directory lookup | Manual directory scanning | cmdFindPhase (already exists) | Already handles decimal matching and edge cases |

## Common Pitfalls

### Pitfall 1: Bash Word Splitting on Decimal Phases

**What goes wrong:** If `$PHASE` is "5.1" and used unquoted in bash, word splitting won't break on the dot. However, in some contexts (array assignment, for loops), quoting is critical.

**Why it happens:** Bash treats "5.1" as a string. The dot is not a special character for word splitting (IFS defaults to space/tab/newline). But when reading from command output into arrays, `IFS=$'\n'` is needed to avoid splitting on spaces in slug names.

**How to avoid:** Always quote `$PHASE` in comparisons and assignments. Use `"${PHASES[$IDX]}"` not `${PHASES[$IDX]}`.

**Warning signs:** Phase number appears truncated or empty in log output.

### Pitfall 2: Regex Over-Matching in STATE.md

**What goes wrong:** The regex `\d+(\.\d+)?` could match version numbers like "v2.0.0" or other decimal patterns in STATE.md.

**Why it happens:** STATE.md contains text like "Phase: 12 of 13 (Decimal Phase Support)" but also version strings and timestamps.

**How to avoid:** Use the existing context-specific grep: `grep -A2 "^Phase:" .planning/STATE.md | head -n1` narrows to the Phase line before extracting the number. The pattern `\d+(\.\d+)?` on the Phase line is safe because it only contains one phase number.

**Warning signs:** CURRENT_PHASE is set to a version number instead of a phase number.

### Pitfall 3: ROADMAP.md Heading Grep with Decimal Dots

**What goes wrong:** `grep "### Phase $PHASE:"` where PHASE is "5.1" -- the dot in regex means "any character", so "5.1" would also match "5X1" or "5 1".

**Why it happens:** Grep interprets `.` as regex wildcard.

**How to avoid:** Use `grep -F "### Phase $PHASE:"` for fixed-string matching, or escape the dot: `grep "### Phase ${PHASE//./\\.}:"`. In practice, this is unlikely to cause false matches since phase heading format is rigid, but fixed-string grep is safer.

**Warning signs:** Wrong phase matched in ROADMAP.md lookups.

### Pitfall 4: Milestone Completion Check with Dynamic Total

**What goes wrong:** `if [ $PHASES_COMPLETED -ge $TOTAL_PHASES ]` at lines 1217/1234 -- if TOTAL_PHASES comes from directory enumeration, it includes decimal phases. But PHASES_COMPLETED might not count all of them if some were already complete before the dispatch started.

**Why it happens:** The dispatcher counts PHASES_COMPLETED from 0 within the current run, but TOTAL_PHASES from the full directory listing.

**How to avoid:** TOTAL_PHASES should represent the remaining phases to complete, not the total including already-completed ones. Or better: use the array length minus the start index. The milestone completion check should compare the current index against the array length.

**Warning signs:** Dispatcher exits prematurely (thinks milestone is complete) or never exits (thinks there are more phases).

### Pitfall 5: generate-context Artifact Check Uses Raw Phase Number

**What goes wrong:** At line 897, `$PHASE_DIR/${PHASE}-CONTEXT.md` checks for the context file using the raw phase number. But context files are named with the padded phase number from find-phase (e.g., "08-CONTEXT.md" not "8-CONTEXT.md").

**Why it happens:** PHASE holds the raw value from the array (which comes from directory names, so it IS padded). But if PHASE comes from STATE.md or resume markers, it might not be padded.

**How to avoid:** When PHASE comes from the list-phases array, it will be extracted from directory names and naturally padded. When PHASE comes from STATE.md or resume, ensure the same normalization is applied. The safest approach: always use `ls "$PHASE_DIR"/*-CONTEXT.md` (glob) instead of exact file name construction for artifact checks.

**Warning signs:** Crash detection triggers falsely (artifact exists but name doesn't match).

## Code Examples

### Example 1: list-phases Command Implementation

```javascript
// Source: follows cmdFindPhase pattern (gsd-tools.js line 444)
function cmdListPhases(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    // Extract phase numbers from directory names
    const phases = [];
    for (const dir of dirs) {
      const match = dir.name.match(/^(\d+(?:\.\d+)?)-/);
      if (match) {
        phases.push(match[1]);
      }
    }

    // Sort numerically (integer part first, then decimal part)
    phases.sort((a, b) => {
      const [aInt, aDec] = a.split('.').map(Number);
      const [bInt, bDec] = b.split('.').map(Number);
      if (aInt !== bInt) return aInt - bInt;
      return (aDec || 0) - (bDec || 0);
    });

    const result = {
      phases,
      count: phases.length
    };

    output(result, raw, phases.join('\n'));
  } catch {
    output({ phases: [], count: 0 }, raw, '');
  }
}
```

### Example 2: Updated Dispatch Loop Pattern

```bash
# Replace lines 228-234 (initialize_dispatch)
CURRENT_PHASE=$(grep -A2 "^Phase:" .planning/STATE.md | head -n1 | grep -oP '\d+(\.\d+)?')
PHASE_LIST=$(node gsd-tools.js list-phases --raw)
TOTAL_PHASES=$(echo "$PHASE_LIST" | wc -l)

# Replace lines 316-320 (dispatch_loop)
IFS=$'\n' read -r -d '' -a PHASES <<< "$PHASE_LIST"

# Find starting index for CURRENT_PHASE
PHASE_IDX=0
for i in "${!PHASES[@]}"; do
  if [ "${PHASES[$i]}" = "$CURRENT_PHASE" ]; then
    PHASE_IDX=$i
    break
  fi
done

while [ $PHASE_IDX -lt ${#PHASES[@]} ] && [ $PHASES_COMPLETED -lt $MAX_PHASES ]; do
  PHASE="${PHASES[$PHASE_IDX]}"
  # ... existing dispatch logic (3a through 3h) ...
done

# Replace line 823 (phase-complete advancement)
# Old: PHASE=$((PHASE + 1))
# New:
PHASE_IDX=$((PHASE_IDX + 1))
```

### Example 3: Updated Resume Phase Extraction

```bash
# Replace line 119 and line 196
# Old: RESUME_PHASE=$(grep 'dispatcher-resume' "$FILE" | grep -oP '(?<=phase=)\d+')
# New:
RESUME_PHASE=$(grep 'dispatcher-resume' "$FILE" | grep -oP '(?<=phase=)[\d.]+')
```

### Example 4: Updated Display Pattern

```bash
# Lines 268, 415, 507, 561 -- Phase display
# Old: "Phase $PHASE/$TOTAL_PHASES"
# New: "Phase $PHASE [${PHASE_IDX_PLUS_1}/${TOTAL_PHASES}]"
# Where PHASE_IDX_PLUS_1=$((PHASE_IDX + 1))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Integer-only phase numbers | Decimal phases via insert-phase.md | Already supported in directory/file structure | Dispatch loop doesn't know about them |
| Integer increment `$((PHASE + 1))` | Array-based iteration over sorted list | This phase | Enables correct decimal phase dispatch |
| ROADMAP.md grep for TOTAL_PHASES | Directory enumeration for TOTAL_PHASES | This phase | Accurate count including insertions |

## Complete Inventory of Changes

### auto-dispatch.md Changes (Comprehensive)

| Line(s) | Current Code | Issue | Fix |
|---------|-------------|-------|-----|
| 119 | `grep -oP '(?<=phase=)\d+'` | Integer-only resume extraction | Change to `[\d.]+` |
| 196 | `grep -oP '(?<=phase=)\d+'` | Integer-only resume extraction | Change to `[\d.]+` |
| 228 | `grep -oP '\d+'` | Integer-only current phase | Change to `\d+(\.\d+)?` |
| 234 | `grep "Phase" ROADMAP | wc -l` | Misses decimal insertions | Replace with `list-phases` count |
| 268 | `$CURRENT_PHASE of $TOTAL_PHASES` | Display format | Update for position-based display |
| 316-320 | `PHASE=$CURRENT_PHASE` + `while [ $PHASE -le $TOTAL_PHASES ]` | Integer loop | Replace with array-based iteration |
| 376 | `grep "### Phase $PHASE:"` | Dot as regex wildcard | Use `grep -F` for fixed-string match |
| 415 | `Phase $PHASE/$TOTAL_PHASES` | Display format | Update for position-based display |
| 507 | `Phase $PHASE/$TOTAL_PHASES` | Display format | Update for position-based display |
| 561 | `Phase $PHASE/$TOTAL_PHASES` | Display format | Update for position-based display |
| 823 | `PHASE=$((PHASE + 1))` | Integer increment (CORE BUG) | Replace with `PHASE_IDX=$((PHASE_IDX + 1))` |
| 897 | `${PHASE}-CONTEXT.md` | Direct filename construction | Use glob pattern instead |
| 1065 | `$((PHASE + 1))` in recovery docs | Integer arithmetic in hint | Update recovery docs |
| 1217, 1234 | `$PHASES_COMPLETED -ge $TOTAL_PHASES` | Milestone completion check | Use array index bounds check |

### gsd-tools.js Changes

| Change | Details |
|--------|---------|
| New `cmdListPhases` function | ~30 lines, follows cmdFindPhase pattern |
| Command registration | Add `list-phases` case in switch statement |

### No Changes Needed

| File | Why Not |
|------|---------|
| insert-phase.md | Already creates decimal directories correctly |
| plan-phase.md | Receives phase arg, passes to find-phase |
| execute-phase.md | Receives phase arg, passes to find-phase |
| verify-work.md | Receives phase arg, passes to find-phase |
| normalizePhaseName | Already handles `\d+(\.\d+)?` |
| cmdFindPhase | Already handles decimal lookup |

## Open Questions

1. **next-phase helper:** Adding a `next-phase` command could simplify the dispatcher further (call `next-phase $CURRENT` instead of managing array index). However, this would require a filesystem read on every iteration vs. one read at startup. Recommendation: Start with array-based approach (one `list-phases` call at startup). Add `next-phase` later if needed.

2. **Re-enumerate per iteration:** The CONTEXT.md defers mid-run insertion detection. Recommendation: Enumerate once at startup. If a new decimal phase is inserted during a dispatch run, it won't be picked up until the next run. This matches the deferred decision.

3. **Progress display format:** When decimal phases exist, the display should show both the phase number and position. Recommendation: `Phase 5.1 [6/15]` format -- clear and compact. Falls back naturally to `Phase 5 [5/13]` for integer-only milestones.

4. **Enumerated list scope:** The `list-phases` command should list ALL directories in `.planning/phases/`. There's no per-milestone scoping needed since each milestone starts fresh with a clean `.planning/phases/` directory.

5. **Edge case -- empty phases directory:** If `.planning/phases/` is empty, `list-phases` should return an empty list (count: 0). The dispatcher should handle this by exiting with "No phases found."

6. **Edge case -- directory with no roadmap entry:** If a directory exists but no matching ROADMAP.md heading, the directory should still be included in the enumeration. The dispatcher's artifact check (3c) will handle it -- find-phase will find the directory, and the dispatcher will determine the next action based on what artifacts exist.

## Sources

### Primary (HIGH confidence)

- **auto-dispatch.md** (direct source reading) -- All 1381 lines analyzed for integer assumptions
- **gsd-tools.js** (direct source reading) -- normalizePhaseName (line 147), cmdFindPhase (line 444), command registration pattern
- **insert-phase.md** (direct source reading) -- Decimal directory naming convention at line 93

### Secondary (HIGH confidence)

- **CONTEXT.md for Phase 12** -- User decisions on implementation approach
- **STATE.md** -- Current phase tracking format ("Phase: 12 of 13")
- **Phase directory structure** -- Observed naming conventions (08-CONTEXT.md, 12-CONTEXT.md)

## Metadata

**Confidence breakdown:**
- Bug locations: HIGH -- read every line of auto-dispatch.md
- gsd-tools.js extension: HIGH -- follows existing cmdFindPhase pattern exactly
- Bash patterns: HIGH -- standard bash array iteration, well-understood
- Edge cases: MEDIUM -- some corner cases (regex over-matching, artifact naming) need testing

**Research date:** 2026-02-21
**Valid until:** Indefinite (internal codebase, no external dependency versioning)

# GSD x Agent Teams: Hybrid Integration Analysis

> This document maps every GSD command and agent to its Agent Teams integration potential.
> Use this as the blueprint for implementing the hybrid approach.

## Architecture Overview

GSD currently uses Claude Code's **Task tool (subagents)** exclusively. Each subagent:
- Gets its own fresh context window (200k tokens)
- Receives inlined context from the orchestrator
- Returns results to the orchestrator only (no inter-agent communication)
- Blocks the orchestrator until completion

Agent Teams provides **independent Claude Code sessions** that:
- Each get their own full session context (CLAUDE.md, MCP, skills)
- Communicate with each other via a mailbox system
- Share a task list for coordination
- Can be messaged directly by the user

## Design Principle: Hybrid, Not Replacement

The integration adds Agent Teams as an **optional orchestration mode** alongside existing Task subagents.

```
config.json:
{
  "orchestration": "classic" | "hybrid",
  ...
}
```

- `classic` = current behavior (Task subagents only)
- `hybrid` = Agent Teams where beneficial, Task subagents elsewhere

Every command must work in both modes. Agent Teams is additive.

---

## Integration Map

### KEEP on Task Subagents (determinism matters)

| Agent | Command | Why Keep |
|-------|---------|----------|
| gsd-executor | execute-phase.md | Atomic commits, wave sequencing, checkpoints. Needs deterministic control. |
| gsd-planner | plan-phase.md | Single-agent focused work. Coherent output from one mind. |
| gsd-roadmapper | new-project.md | Single coherent output needed. No benefit from discussion. |
| gsd-plan-checker | plan-phase.md | Focused verification against specific criteria. |
| gsd-research-synthesizer | new-project.md | Reads 4 files, writes 1. Simple aggregation. |

### SWAP to Agent Teams (discussion adds value)

| Agent(s) | Command | Why Swap | Agent Teams Pattern |
|----------|---------|----------|---------------------|
| 4x gsd-project-researcher | new-project.md | Researchers can challenge each other's findings instead of producing siloed reports | Debate team: 4 teammates, shared task list |
| gsd-phase-researcher | plan-phase.md | Single researcher could become 2-3 teammates exploring competing approaches | Competing hypotheses |
| gsd-debugger | debug.md | Maps 1:1 to Agent Teams "competing hypotheses" pattern from official docs | 3-5 teammates testing different theories |
| gsd-verifier | execute-phase.md | Adversarial verification: one validates, one attacks, one reviews quality | Adversarial team |
| 4x gsd-codebase-mapper | map-codebase.md | Mappers can cross-reference findings in real-time instead of working in isolation | Collaborative exploration |

---

## Detailed Integration Specs

### 1. Research Phase (new-project.md, Phase 6)

**Current flow:**
```
Orchestrator → spawn 4 Task(gsd-project-researcher) in parallel → wait → spawn Task(gsd-research-synthesizer) → done
```

**Hybrid flow:**
```
Orchestrator → create Agent Team "research" → spawn 4 researcher teammates →
teammates investigate + challenge each other via messages →
lead synthesizes findings → team cleanup → done
```

**Key changes:**
- Replace 4 parallel `Task()` calls with team creation + 4 teammate spawns
- Researchers can message each other: "Your stack recommendation contradicts the architecture I found"
- Lead (orchestrator) collects synthesized findings instead of spawning separate synthesizer
- **Eliminates gsd-research-synthesizer** -- the lead does synthesis from richer context

**Files to modify:**
- `commands/gsd/new-project.md` (Phase 6 research section)
- May need new: `commands/gsd/_team-research.md` (shared team instructions)

**Output contract stays the same:**
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/SUMMARY.md`

### 2. Phase Research (plan-phase.md, Step 5)

**Current flow:**
```
Orchestrator → spawn 1 Task(gsd-phase-researcher) → wait → done
```

**Hybrid flow:**
```
Orchestrator → create Agent Team "phase-research" → spawn 2-3 teammates:
  - Teammate 1: "How should we implement this?" (optimist)
  - Teammate 2: "What could go wrong?" (devil's advocate)
  - Teammate 3: "What are the alternatives?" (explorer)
→ teammates debate → lead writes RESEARCH.md → cleanup → done
```

**Key changes:**
- Single researcher becomes a small debate team
- Devil's advocate explicitly challenges assumptions
- Lead writes richer RESEARCH.md with multiple perspectives
- More tokens but better research quality

**Files to modify:**
- `commands/gsd/plan-phase.md` (Step 5)
- `commands/gsd/research-phase.md` (standalone research)
- `agents/gsd-phase-researcher.md` (becomes teammate instruction template)

### 3. Debugging (debug.md)

**Current flow:**
```
Orchestrator → gather symptoms → spawn 1 Task(gsd-debugger) → handle checkpoints → done
```

**Hybrid flow:**
```
Orchestrator → gather symptoms → create Agent Team "debug" → spawn 3-5 teammates:
  - Each teammate tests a different hypothesis
  - Teammates message each other: "I disproved theory X because..."
  - Teammates challenge each other's evidence
→ converge on root cause → cleanup → done
```

**Key changes:**
- Direct map to Agent Teams "competing hypotheses" pattern from official docs
- Multiple hypotheses tested simultaneously instead of sequentially
- Teammates can disprove each other's theories (the debate IS the value)
- Faster convergence on root cause

**Files to modify:**
- `commands/gsd/debug.md` (Step 3 spawning)
- `agents/gsd-debugger.md` (becomes teammate instruction template)

### 4. Verification (execute-phase.md, Step 7)

**Current flow:**
```
Orchestrator → spawn 1 Task(gsd-verifier) → read VERIFICATION.md → done
```

**Hybrid flow:**
```
Orchestrator → create Agent Team "verify" → spawn 3 teammates:
  - Teammate 1: "Requirements validator" (checks against REQUIREMENTS.md)
  - Teammate 2: "Breaker" (actively tries to find stubs, broken wiring, edge cases)
  - Teammate 3: "Code reviewer" (checks quality, patterns, anti-patterns)
→ teammates share findings → lead produces VERIFICATION.md → cleanup → done
```

**Key changes:**
- Three distinct verification lenses instead of one agent doing everything
- "Breaker" teammate is adversarial by design
- Findings shared in real-time (breaker can ask validator: "this endpoint returns empty -- is that expected?")
- Richer VERIFICATION.md with multiple perspectives

**Files to modify:**
- `commands/gsd/execute-phase.md` (Step 7)
- `commands/gsd/verify-work.md` (UAT testing)
- `agents/gsd-verifier.md` (becomes 3 teammate templates)

### 5. Codebase Mapping (map-codebase.md)

**Current flow:**
```
Orchestrator → spawn 4 Task(gsd-codebase-mapper) in parallel → wait → verify files → done
```

**Hybrid flow:**
```
Orchestrator → create Agent Team "map-codebase" → spawn 4 mapper teammates →
teammates explore + cross-reference: "I found an auth module -- does that match your architecture analysis?" →
lead verifies all 7 docs → cleanup → done
```

**Key changes:**
- Mappers can ask each other about findings instead of working in isolation
- Tech mapper can inform quality mapper about unusual patterns
- Architecture mapper can inform concerns mapper about coupling issues
- Better cross-referencing in final documents

**Files to modify:**
- `commands/gsd/map-codebase.md` (Step 3)
- `agents/gsd-codebase-mapper.md` (becomes teammate instruction template)

---

## Implementation Architecture

### Detection Pattern

Every command that spawns agents needs this check:

```bash
# Check orchestration mode
ORCH_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"orchestration"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "classic")

# Check if Agent Teams is available
AGENT_TEAMS_ENABLED=$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

### Branching Logic

```
if ORCH_MODE == "hybrid" AND AGENT_TEAMS_ENABLED == "1":
    → use Agent Teams for supported phases
    → fall back to Task for unsupported phases
elif ORCH_MODE == "classic" OR AGENT_TEAMS_ENABLED != "1":
    → use Task subagents for everything (current behavior)
```

### Config Extension

```json
{
  "orchestration": "classic",
  "agent_teams": {
    "research": true,
    "debug": true,
    "verification": true,
    "codebase_mapping": true,
    "teammate_mode": "in-process"
  }
}
```

Individual commands can be toggled independently.

### Result Collection Pattern

**Classic (Task):**
```
result = Task(prompt=..., subagent_type=...)
# Blocks until complete, returns result inline
```

**Hybrid (Agent Teams):**
```
1. Create team with lead instructions
2. Spawn teammates with role-specific prompts
3. Lead monitors shared task list for completion
4. Lead writes output files (same locations as classic)
5. Orchestrator reads output files after team cleanup
```

The output contract (file locations, formats) stays identical. Only the orchestration mechanism changes.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Agent Teams is experimental (known limitations) | Config toggle allows instant fallback to classic |
| Higher token cost | Per-command toggle in config.json |
| No session resumption for in-process teammates | Keep execution (deterministic work) on Task |
| Task status can lag | Use file-based output contracts, not task status |
| One team per session | Sequential team creation per command phase |
| No nested teams | Teammates can't spawn sub-teams; keep single level |
| Split panes require tmux/iTerm2 | Default to in-process mode |

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `commands/gsd/new-project.md` | Modify | Add hybrid branch in Phase 6 (research) |
| `commands/gsd/plan-phase.md` | Modify | Add hybrid branch in Step 5 (research) |
| `commands/gsd/execute-phase.md` | Modify | Add hybrid branch in Step 7 (verification) |
| `commands/gsd/debug.md` | Modify | Add hybrid branch in Step 3 (investigation) |
| `commands/gsd/map-codebase.md` | Modify | Add hybrid branch in Step 3 (mapping) |
| `commands/gsd/verify-work.md` | Modify | Add hybrid branch for UAT |
| `commands/gsd/settings.md` | Modify | Add orchestration mode + agent_teams toggles |
| `agents/gsd-project-researcher.md` | Modify | Add teammate-mode instructions |
| `agents/gsd-phase-researcher.md` | Modify | Add teammate-mode instructions |
| `agents/gsd-debugger.md` | Modify | Add teammate-mode instructions |
| `agents/gsd-verifier.md` | Modify | Add teammate-mode instructions |
| `agents/gsd-codebase-mapper.md` | Modify | Add teammate-mode instructions |
| `.planning/config.json` template | Modify | Add orchestration + agent_teams fields |

## Testing Strategy

1. **Side-by-side comparison**: Run same task in classic and hybrid mode, compare output quality
2. **Token tracking**: Measure token usage delta between modes
3. **Fallback testing**: Verify classic mode still works when Agent Teams is disabled
4. **Output contract validation**: Verify hybrid mode produces identical file structures

---

*Analysis date: 2026-02-06*
*GSD version: v1.11.3*
*Agent Teams: experimental (research preview)*

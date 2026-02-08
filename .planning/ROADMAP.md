# Roadmap: GSD Agent Teams Hybrid

**Created:** 2026-02-06
**Core Value:** Every GSD command works in both classic and hybrid mode

## Milestone: v1.12.0-hybrid

### Phase 1: Configuration Foundation
**Goal:** Config infrastructure supports orchestration mode toggling
**Requirements:** CFG-01, CFG-02, CFG-03, CFG-04
**Plans:** 3 plans

**Status:** Complete (2026-02-07)

Plans:
- [x] 01-01-PLAN.md -- Config schema and detection pattern documentation (planning-config.md)
- [x] 01-02-PLAN.md -- Settings UI with orchestration and agent_teams toggles (settings.md)
- [x] 01-03-PLAN.md -- Config template consistency (new-project.md, set-profile.md)

**Success Criteria:**
1. config.json accepts `orchestration` and `agent_teams` fields without breaking existing configs
2. /gsd:settings displays orchestration mode and allows toggling
3. Detection logic correctly reads config + env var combination
4. Existing GSD projects with no orchestration field default to "classic"

### Phase 2: Project Research Hybrid (new-project.md)
**Goal:** 4 parallel researchers use Agent Teams for collaborative research with debate
**Requirements:** RES-01, RES-02, RES-03, RES-04, AGT-01
**Plans:** 2 plans

**Status:** Complete (2026-02-08)

Plans:
- [x] 02-01-PLAN.md -- Add teammate-mode instructions to gsd-project-researcher.md (AGT-01)
- [x] 02-02-PLAN.md -- Add hybrid branch to new-project.md Phase 6 (RES-01, RES-02, RES-03, RES-04)

**Success Criteria:**
1. In hybrid mode, `new-project.md` Phase 6 creates an Agent Team with 4 researcher teammates
2. Researchers message each other to challenge and validate findings
3. Team lead produces SUMMARY.md (no separate synthesizer needed)
4. Output files (STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md) identical in format
5. Classic mode still spawns 4 Task subagents + synthesizer as before

### Phase 3: Phase Research Hybrid (plan-phase.md)
**Goal:** Phase research uses debate-style Agent Team (optimist + devil's advocate + explorer)
**Requirements:** RES-05, RES-06, AGT-02
**Plans:** 3 plans

**Status:** Complete (2026-02-08)
**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md -- Add teammate-mode instructions to gsd-phase-researcher.md (AGT-02)
- [x] 03-02-PLAN.md -- Add hybrid branch to plan-phase.md Step 5 (RES-05)
- [x] 03-03-PLAN.md -- Add hybrid branch to research-phase.md Step 4 (RES-06)
- [x] 03-04-PLAN.md -- Fix 3 protocol gaps: Round 2 peer-to-peer, shutdown type, perspective file prefixes (gap closure)

**Success Criteria:**
1. plan-phase.md Step 5 spawns 3-teammate debate team in hybrid mode
2. research-phase.md standalone command also supports hybrid
3. RESEARCH.md output contains multiple perspectives (not just one viewpoint)
4. Classic mode still spawns single Task researcher

### Phase 4: Debug Hybrid (debug.md)
**Goal:** Debugging uses competing hypotheses pattern via Agent Teams
**Requirements:** DBG-01, DBG-02, DBG-03, DBG-04, AGT-03
**Plans:** 2 plans

**Status:** Complete (2026-02-08)

Plans:
- [x] 04-01-PLAN.md -- Add teammate-mode instructions to gsd-debugger.md (AGT-03)
- [x] 04-02-PLAN.md -- Add hybrid branch to debug.md Step 3 (DBG-01, DBG-02, DBG-03, DBG-04)

**Success Criteria:**
1. debug.md Step 3 spawns 3 hypothesis-testing teammates
2. Teammates actively disprove each other's theories via messages
3. Team converges on root cause through debate
4. Debug session file format unchanged
5. Classic mode still spawns single Task debugger

### Phase 5: Verification Hybrid (execute-phase.md)
**Goal:** Phase verification uses adversarial Agent Team (validator + breaker + reviewer)
**Requirements:** VER-01, VER-02, VER-03, VER-04, AGT-04
**Plans:** 2 plans

**Status:** Complete (2026-02-08)

Plans:
- [x] 05-01-PLAN.md -- Add teammate-mode instructions to gsd-verifier.md (AGT-04)
- [x] 05-02-PLAN.md -- Add hybrid branch to execute-phase.md verify_phase_goal step (VER-01, VER-02, VER-03, VER-04)

**Success Criteria:**
1. execute-phase.md Step 7 spawns 3-teammate adversarial team
2. Breaker teammate actively hunts for stubs and broken wiring
3. Validator and reviewer provide different verification lenses
4. VERIFICATION.md format identical
5. Classic mode still spawns single Task verifier

### Phase 6: Codebase Mapping Hybrid (map-codebase.md)
**Goal:** Codebase mapping uses collaborative Agent Team for cross-referenced analysis
**Requirements:** MAP-01, MAP-02, MAP-03, AGT-05
**Plans:** 2 plans

**Status:** In progress (2026-02-08)

Plans:
- [x] 06-01-PLAN.md -- Add teammate-mode instructions to gsd-codebase-mapper.md (AGT-05)
- [ ] 06-02-PLAN.md -- Add hybrid branch to map-codebase.md spawn_agents step (MAP-01, MAP-02, MAP-03)

**Success Criteria:**
1. map-codebase.md Step 3 spawns 4 collaborative mapper teammates
2. Mappers cross-reference findings (tech informs quality, arch informs concerns)
3. All 7 codebase documents produced in same format
4. Classic mode still spawns 4 Task mappers

### Phase 7: Fallback and Integration Testing
**Goal:** Validate classic mode unbroken, hybrid fallback works, output contracts match
**Requirements:** FBK-01, FBK-02, FBK-03, FBK-04
**Success Criteria:**
1. Full GSD workflow runs in classic mode with zero behavior changes
2. Hybrid mode falls back gracefully when Agent Teams env var not set
3. Side-by-side output comparison shows identical file structures
4. All existing GSD tests pass (if any exist)

---

## Milestone: v2.0.0-agent-mode (Future -- after v1.12.0-hybrid)

> Full design doc: AGENT-MODE-GSD.md
> Prerequisite: Phases 1-7 complete (hybrid integration working)
> Effort estimate: 13-18 sessions across 4 phases

### Phase 8: Agent Mode Foundation
**Goal:** A single GSD command runs start-to-finish without human input
**Effort:** 2-3 sessions
**Key work:**
- agent_mode config field + auto-decision function
- Replace AskUserQuestion with rule-based auto-decisions
- Proof of concept on plan-phase + execute-phase
- Safety limits (max iterations, token budget)

### Phase 9: Full Command Coverage
**Goal:** All GSD commands support agent mode
**Effort:** 3-5 sessions
**Key work:**
- Agent-mode branches in all 27 commands
- Edge case handling for auto-scoping
- Full new-project -> plan -> execute -> verify cycle without human input

### Phase 10: Lead-Approval Integration
**Goal:** Agent Teams lead acts as approval authority for teammate GSD pipelines
**Effort:** 3-5 sessions
**Key work:**
- Checkpoint routing: teammate sends to lead instead of human
- Lead review/response mechanism
- Timeout handling
- Full Agent Teams workflow with GSD agent mode on teammates

### Phase 11: Recursive GSD (stretch)
**Goal:** Teammates run full GSD pipelines that spawn their own Task subagents
**Effort:** 5+ sessions
**Key work:**
- Three-level depth: lead -> teammate (GSD) -> Task executor
- Token budget management across levels
- Deadlock prevention
- Multi-feature parallel development with per-teammate GSD

### Opus 1M Context Note
With Opus 1M tokens, the /clear-between-phases pattern becomes optional.
A single teammate could run Phases 1-3 of a project in one context window.
This reduces coordination overhead significantly and makes agent-mode GSD
more viable. Cost tradeoff: fewer sessions needed, higher per-session cost.

---

**Coverage (v1):** 28/28 v1 requirements mapped to Phases 1-7
**Coverage (v2):** Agent mode design documented in AGENT-MODE-GSD.md
**Phases:** 7 (v1) + 4 (v2 future)

---
*Roadmap created: 2026-02-06*
*Last updated: 2026-02-08 after Phase 5 execution complete*

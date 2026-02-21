# Roadmap: GSD Agent Teams Hybrid

**Created:** 2026-02-06
**Core Value:** Every GSD command works in both classic and hybrid mode

## Milestones

- [x] **v1.12.0-hybrid** -- Phases 1-7 (shipped 2026-02-08) | [Archive](milestones/v1.12.0-hybrid-ROADMAP.md)
- [x] **v2.0.0-agent-mode** -- Phases 8-10 (shipped 2026-02-21)

## Phases

<details>
<summary>[x] v1.12.0-hybrid (Phases 1-7) -- SHIPPED 2026-02-08</summary>

- [x] Phase 1: Configuration Foundation (3/3 plans) -- completed 2026-02-07
- [x] Phase 2: Project Research Hybrid (2/2 plans) -- completed 2026-02-08
- [x] Phase 3: Phase Research Hybrid (4/4 plans) -- completed 2026-02-08
- [x] Phase 4: Debug Hybrid (2/2 plans) -- completed 2026-02-08
- [x] Phase 5: Verification Hybrid (2/2 plans) -- completed 2026-02-08
- [x] Phase 6: Codebase Mapping Hybrid (2/2 plans) -- completed 2026-02-08
- [x] Phase 7: Fallback and Integration Testing (1/1 plan) -- completed 2026-02-08

</details>

### v2.0.0-agent-mode (Current)

> Full design doc: AGENT-MODE-GSD.md
> Prerequisite: Phases 1-7 complete (hybrid integration working)
> Effort estimate: 8-13 sessions across 3 phases

**Milestone Goal:** GSD commands run end-to-end without human input when in agent mode

- [x] **Phase 8: Agent Mode Foundation** - Chain-of-Agents dispatcher + auto-decide engine + core workflows
- [x] **Phase 9: Full Command Coverage** - Remaining workflows + safety limits + Opus optimization
- [x] **Phase 10: Lead-Approval Integration** - Human oversight for architectural decisions

## Phase Details

### Phase 8: Agent Mode Foundation
**Goal:** Prove Chain-of-Agents dispatcher and auto-decision engine work on core workflows

**Depends on:** Phase 7 (hybrid integration complete)

**Requirements:** AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06, DISP-01, DISP-02, DISP-03, DISP-04, DISP-05, DISP-06, CMD-01, CMD-02, CMD-03

**Success Criteria** (what must be TRUE):
1. User can run /gsd:auto command which reads STATE.md and dispatches next action autonomously
2. Auto-dispatch spawns fresh Task per phase (Chain-of-Agents), completes 3-phase test without context degradation
3. Config has agent_mode field that toggles agent-mode on/off (defaults to false, preserving classic behavior)
4. New-project, plan-phase, and execute-phase workflows have agent-mode branches that call auto-decide instead of AskUserQuestion
5. AUTO-DISPATCH-LOG.md captures every auto-decision with rationale for audit trail

**Plans:** 3 plans

Plans:
- [x] 08-01-PLAN.md -- Auto-decide engine + log-decision + config schema in gsd-tools.js
- [x] 08-02-PLAN.md -- /gsd:auto command + auto-dispatch.md dispatcher workflow
- [x] 08-03-PLAN.md -- Agent-mode branches in new-project, plan-phase, execute-phase workflows

### Phase 9: Full Command Coverage
**Goal:** Extend agent-mode to all workflows with safety limits preventing runaway loops and cost spirals

**Depends on:** Phase 8 (foundation proven)

**Requirements:** CMD-04, CMD-05, CMD-06, CMD-07, DISP-07

**Success Criteria** (what must be TRUE):
1. New-milestone, debug, map-codebase, and verify-work workflows have agent-mode branches
2. Auto-decide handles all decision types across 7 workflows (research depth, gap closure, verification approval, milestone scope)
3. Safety limits prevent runaway loops (max 3 plan-execute-verify iterations per phase, 500k token budget per phase enforced)
4. Full milestone test completes 5-7 phases autonomously without human intervention or budget overruns
5. Dispatcher uses Opus 1M context when available (model selection in Task spawning), degrades gracefully to Sonnet

**Plans:** 3 plans

Plans:
- [x] 09-01-PLAN.md -- Agent-mode branches in new-milestone.md and map-codebase.md
- [x] 09-02-PLAN.md -- Agent-mode branches in debug.md and verify-work.md
- [x] 09-03-PLAN.md -- Safety limits (token budget, stuck loop detection) and Opus optimization in dispatcher

### Phase 10: Lead-Approval Integration
**Goal:** Add human oversight for architectural decisions without blocking operational automation

**Depends on:** Phase 9 (full coverage working)

**Requirements:** LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05, LEAD-06

**Success Criteria** (what must be TRUE):
1. Auto-decide classifies decisions as architectural vs operational using defined taxonomy
2. Architectural decisions route to human via AskUserQuestion with context, classification rationale, and response options
3. Lead can approve or reject via message response; agent continues with approval or revises based on feedback
4. No traditional timeout -- AskUserQuestion blocks; write-ahead PENDING_APPROVAL.md for session-death recovery
5. Config has autonomy_level field with 3 settings (auto-decide, lead-approval, full-auto); lead-approval only active when agent_mode=true AND autonomy_level=lead-approval

**Plans:** 3 plans

Plans:
- [x] 10-01-PLAN.md -- Core lead-approval logic (REQUIREMENTS fix + gsd-tools.js + auto-dispatch.md classification/routing/recovery)
- [x] 10-02-PLAN.md -- Settings UI for autonomy_level + --resume flag handling
- [x] 10-03-PLAN.md -- Gap closure: fix architectural log format in cmdLogDecision + add --response/--wait-time flags

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1. Configuration Foundation | v1.12.0 | 3/3 | Complete | 2026-02-07 |
| 2. Project Research Hybrid | v1.12.0 | 2/2 | Complete | 2026-02-08 |
| 3. Phase Research Hybrid | v1.12.0 | 4/4 | Complete | 2026-02-08 |
| 4. Debug Hybrid | v1.12.0 | 2/2 | Complete | 2026-02-08 |
| 5. Verification Hybrid | v1.12.0 | 2/2 | Complete | 2026-02-08 |
| 6. Codebase Mapping Hybrid | v1.12.0 | 2/2 | Complete | 2026-02-08 |
| 7. Fallback & Integration | v1.12.0 | 1/1 | Complete | 2026-02-08 |
| 8. Agent Mode Foundation | v2.0.0 | 3/3 | Complete | 2026-02-11 |
| 9. Full Command Coverage | v2.0.0 | 3/3 | Complete | 2026-02-11 |
| 10. Lead-Approval Integration | v2.0.0 | 3/3 | Complete | 2026-02-21 |

---
*Roadmap created: 2026-02-06*
*Last updated: 2026-02-21 -- Phase 10 complete (all 3 plans done, gap closure 10-03 executed)*

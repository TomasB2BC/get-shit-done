# GSD Agent Teams Hybrid Integration

## What This Is

A fork of Get Shit Done (GSD) that adds optional Agent Teams orchestration and autonomous agent-mode execution. Six GSD workflows support hybrid mode (classic Task or Agent Teams) for research, debugging, verification, and mapping. The v2.0 milestone adds full autonomous execution: a chain-of-agents dispatcher, auto-decision engine, and lead-approval integration enabling milestones to complete without human input. All commands work in classic, hybrid, and agent mode, toggled by config.

## Core Value

GSD commands run end-to-end without human input when in agent mode, while preserving classic and hybrid modes as fallbacks. No breaking changes to existing workflows.

## Current Milestone: v2.0.0-agent-mode -- SHIPPED 2026-02-22

**Status:** Complete. All 26 requirements satisfied, 7 phases verified (94/94 must-haves), 0 tech debt remaining.

**Next:** Run /gsd:new-milestone to define the next milestone. Use agent mode in target projects (Ogame, B2BC) via /gsd:auto with agent_mode=true.

## Requirements

### Validated

- [OK] Config extension: orchestration field + per-command agent_teams toggles -- v1.12.0
- [OK] Settings command: /gsd:settings can toggle orchestration mode -- v1.12.0
- [OK] Research hybrid: new-project.md uses Agent Teams for 4 collaborative researchers -- v1.12.0
- [OK] Phase research hybrid: plan-phase.md + research-phase.md use 3-role debate teams -- v1.12.0
- [OK] Debug hybrid: debug.md uses competing hypotheses with 3 investigators -- v1.12.0
- [OK] Verification hybrid: execute-phase.md uses adversarial validator/breaker/reviewer -- v1.12.0
- [OK] Codebase mapping hybrid: map-codebase.md uses 4 collaborative mappers -- v1.12.0
- [OK] Fallback: every hybrid path falls back to classic when Agent Teams unavailable -- v1.12.0
- [OK] Agent definitions: teammate-mode instructions in all 5 agent .md files -- v1.12.0
- [OK] Output contract: hybrid mode produces identical file structures to classic -- v1.12.0
- [OK] Dispatcher & Orchestration: /gsd:auto + Chain-of-Agents + thin dispatcher + STATE.md updates + completion detection + Opus 1M (DISP-01..07) -- v2.0.0
- [OK] Auto-Decision Engine: auto-decide in gsd-tools.js + rule set + config toggles + logging + opt-in default (AUTO-01..06) -- v2.0.0
- [OK] Command Coverage: agent-mode branches in all 7 major workflows (CMD-01..07) -- v2.0.0
- [OK] Lead-Approval Integration: classification taxonomy + AskUserQuestion routing + approve/reject + PENDING_APPROVAL.md recovery + 3 autonomy levels + compound condition (LEAD-01..06) -- v2.0.0

### Active

(No active milestone -- next milestone TBD via /gsd:new-milestone)

### Out of Scope

- Replacing executor with Agent Teams -- deterministic wave execution needs Task subagents
- Replacing planner with Agent Teams -- single coherent output needed
- Replacing roadmapper with Agent Teams -- same reason
- Nested teams -- Agent Teams doesn't support teammates spawning sub-teams
- Split pane mode -- requires tmux/iTerm2, not portable

## Context

- GSD v1.12.0-hybrid shipped 2026-02-08 (hybrid orchestration for 6 workflows)
- GSD v2.0.0-agent-mode shipped 2026-02-22 (autonomous execution without human input)
- Agent Teams is experimental (research preview) with known limitations
- Context refresh problem solved by Chain-of-Agents pattern (dispatcher spawns fresh Task per phase)
- Target consumers: Ogame, B2BC -- agent mode built here, used in other projects
- GSD is globally installed at ~/.claude/ -- hybrid mode already available in all projects
- Fork: github.com/TomasB2BC/get-shit-done
- Branch: feat/agent-teams-hybrid
- Design doc: AGENT-MODE-GSD.md

## Constraints

- **Backwards compatible**: Classic mode continues to work identically (verified)
- **Feature flag**: Agent Teams integration behind config toggle (verified)
- **Same outputs**: Hybrid mode produces same file artifacts as classic (verified)
- **No new dependencies**: Agent Teams is built into Claude Code, no npm packages needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid approach (not full replacement) | Agent Teams experimental + executor needs determinism | [OK] Good -- clean separation |
| Config-driven toggling | Allows instant fallback if Agent Teams has issues | [OK] Good -- compound detection works |
| Keep executor on Task | Atomic commits + wave sequencing + checkpoints need deterministic control | [OK] Good -- unchanged |
| Research as first integration target | Highest value (4 agents that can't talk to each other today) | [OK] Good -- pattern established |
| Compound detection (config AND env var) | Safety measure prevents accidental hybrid activation | [OK] Good -- explicit opt-in |
| All agent_teams toggles default false | Explicit per-command opt-in required | [OK] Good -- safe defaults |
| 3-role debate for phase research | Optimist/advocate/explorer produce richer RESEARCH.md | [OK] Good -- Dissenting Views section |
| Competing hypotheses for debug | 3 investigators avoid hypothesis anchoring | [OK] Good -- technique diversity |
| Adversarial verification | Breaker role actively hunts for stubs/broken wiring | [OK] Good -- higher coverage |
| Collaborative mapping (not adversarial) | Mappers benefit from cross-referencing, not challenging | [OK] Good -- CROSS-REFERENCE prefix |
| Phases 8-14 full scope | Include lead-approval + tooling for complete v2.0 vision | [OK] Good -- 7 phases, 17 plans shipped |
| Opus-first model target | Optimize for 1M context; Sonnet support nice-to-have | [OK] Good -- Opus preferred with Sonnet fallback |
| Chain-of-Agents dispatcher | Solves context refresh; fresh Task per phase | [OK] Good -- <10k tokens/cycle, no degradation |
| 3 autonomy levels | Full flexibility for different project needs | [OK] Good -- auto-decide/lead-approval/full-auto |
| Config with sensible defaults | Defaults handle 90% of cases; override per project | [OK] Good -- 3-field agent_mode_settings |
| Per-callsite agent-mode branching | Thin if/else (not section duplication) preserves classic | [OK] Good -- additive, no classic breakage |
| Write-ahead PENDING_APPROVAL.md | Session-death recovery for lead-approval mode | [OK] Good -- no traditional timeout needed |
| Array-based phase iteration | Bash array + index replaces integer counter | [OK] Good -- decimal phases (5.1, 5.2) work |
| Alias-keyed projects.json | O(1) lookup, relative paths, portable | [OK] Good -- 28 commands + 27 workflows wired |

---
*Last updated: 2026-02-22 after v2.0.0-agent-mode milestone shipped*

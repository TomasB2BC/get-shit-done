# Milestones: GSD Agent Teams Hybrid

## v2.1.0-distribution Capability + Distribution (Shipped: 2026-02-27)

**Delivered:** Explorer recon for research workflows, /gsd:elevate-decision and /gsd:integrity-check skills, stakeholder persona agents in gsd:package. Distribution phases (onboarding, upstream PR, fork maintenance) deferred to next milestone alongside upstream modular rebase.

**Phases completed:** 18-20 shipped (8 plans), 15-17 deferred

**Key accomplishments:**

- Explorer recon step in research workflow: lightweight sub-agents do field reconnaissance before full research team assembly, informing team composition and personalizing researcher prompts
- /gsd:integrity-check: 4 parallel Explore probes cross-reference .planning/ docs against ground truth, present gaps with lettered fix options, batch corrections
- /gsd:elevate-decision: 6-pass pipeline (seed understanding, integrity check, deep dig with recursive branching, boundaries, adversarial stress test, crystallization with provenance commits)
- Stakeholder persona agents: gsd-intent-loader + gsd-delivery-packager agents, gsd:package --review flag, auto-review via agent_teams.delivery config toggle
- Fork divergence analysis: 79 fork files, 141 upstream files, 68 conflict-risk files mapped. Strategic decision: rebase onto upstream's modular .cjs architecture in next milestone.
- B2BC mirror pattern established: develop once in gsd-hybrid, document twice, ship globally

**Stats:**

- 33 files changed (7,157 insertions)
- 3 phases, 8 plans, 108 commits on branch
- 21 days (2026-02-06 to 2026-02-27)

**Git range:** `feat(18-01)` to `docs(20-03)`

**What's next:** Upstream modular rebase -- port fork additions into .cjs module structure for autonomous agent runtime (J.A.R.V.I.S. vision: cheap models running GSD with blast radius containment)

---

## v2.0.0-agent-mode Autonomous Agent Execution (Shipped: 2026-02-22)

**Delivered:** Full autonomous GSD execution -- Chain-of-Agents dispatcher, auto-decide engine, lead-approval integration, and developer tooling (decimal phases, project aliases) enabling milestones to complete without human input.

**Phases completed:** 8-14 (17 plans total)

**Key accomplishments:**

- Chain-of-Agents dispatcher (auto-dispatch.md) with /gsd:auto command that runs entire milestones autonomously, spawning fresh Task agents per action with thin dispatcher design (<10k tokens/cycle)
- Auto-decide rule engine in gsd-tools.js replacing AskUserQuestion across all 7 major workflows with per-callsite agent-mode branches preserving classic mode
- Lead-approval integration with 3 autonomy levels, architectural decision classification, write-ahead PENDING_APPROVAL.md session-death recovery, and --resume flag
- Decimal phase support via list-phases CLI command with numeric sort and array-based dispatch loop rewrite
- Project alias resolver with 3 CLI commands, --project flag in 28 commands, Step 0 Project Resolution in 27 workflows, and auto-registration in new-project
- Dispatcher tech debt closure: verify-phase dispatch fix, stuck-loop false-positive guard, execute-plan.md direct agent-mode detection

**Stats:**

- 170 files modified (39,652 insertions, 7,372 deletions)
- 2,663 LOC in key deliverables (gsd-tools.js + auto-dispatch.md + auto.md)
- 7 phases, 17 plans, 112 commits
- 11 days from start to ship (2026-02-11 to 2026-02-22)

**Git range:** `feat(08-01)` to `docs(phase-14)`

**What's next:** Use agent mode in target projects (ProjectA, ProjectB) -- /gsd:auto with agent_mode=true

---

## v1.12.0-hybrid Agent Teams Hybrid Integration (Shipped: 2026-02-08)

**Delivered:** Added optional Agent Teams orchestration to 6 GSD workflows (research, debug, verification, mapping) with config-driven toggling and full backwards compatibility.

**Phases completed:** 1-7 (17 plans total)

**Key accomplishments:**

- Config infrastructure with orchestration mode toggling, compound detection pattern, and per-command agent_teams toggles
- 4-researcher collaborative debate for project research (new-project.md) with team lead synthesis
- 3-role debate research (optimist/advocate/explorer) for phase research (plan-phase.md, research-phase.md)
- Competing hypotheses debugging with 3 investigators and peer-to-peer challenge exchange (debug.md)
- Adversarial verification with validator/breaker/reviewer roles for phase verification (execute-phase.md)
- Collaborative codebase mapping with 4 differentiated focus areas and cross-reference protocol (map-codebase.md)
- Comprehensive static verification confirming classic mode preservation and output contract identity

**Stats:**

- 14 files created/modified
- 2,753 lines of markdown (workflow/agent definitions)
- 7 phases, 17 plans
- 2 days from start to ship (2026-02-07 to 2026-02-08)

**Git range:** `feat(01-01)` to `docs(07-01)` (18 commits)

**What's next:** v2.0.0-agent-mode -- full autonomous GSD execution without human input

---

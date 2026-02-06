# GSD Agent Mode: Autonomous Agent-Invocable Workflows

> GSD as an agent operating system -- the workflow becomes the contract between agents,
> not just between human and agent.

## The Vision

Any Claude agent (Agent Teams teammate, Task subagent, or standalone session) can invoke
GSD workflows autonomously. GSD becomes a protocol that enforces rigor (plan, execute,
verify) on agents that have no intuition to fall back on.

```
Team lead creates team for a feature
  -> Teammate A runs agent-mode GSD for backend (plan->execute->verify)
  -> Teammate B runs agent-mode GSD for frontend (plan->execute->verify)
  -> Each follows structured workflow independently
  -> Lead reviews verification reports, not code
  -> Teammates can run GSD on sub-problems recursively (within limits)
```

## Why This Matters

1. **Agents need MORE structure than humans, not less.** Without intuition, the rigor
   of plan->execute->verify IS the safety net. An agent without GSD will YOLO code
   changes. An agent WITH GSD will plan first, commit atomically, verify after.

2. **Opus 1M context window changes the economics.** GSD's core design principle
   (fresh context per subagent, /clear between phases) was built around 200k limits.
   With 1M tokens, a single agent can hold an entire project's context. This means:
   - Teammates could run full GSD cycles without context rot
   - The /clear pattern becomes optional, not mandatory
   - More complex multi-phase work fits in one session

3. **Agent Teams + GSD agent mode = scalable parallel development.** Instead of one
   human shepherding one GSD pipeline, a team lead coordinates N pipelines running
   simultaneously with GSD guarantees (atomic commits, verification, structured output).

## What Blocks It Today

Every GSD command has human interaction points that agents can't handle:

| Interaction Type | Count (approx) | Where |
|-----------------|-----------------|-------|
| AskUserQuestion | ~15 across all commands | Scoping, preferences, approvals |
| Checkpoint approvals | Every autonomous:false task | execute-phase |
| /clear prompts | After every phase | All phase transitions |
| Decision gates | ~8 across commands | Roadmap approval, requirement scoping |
| Freeform input | ~5 | "What do you want to build?", debug symptoms |

## Implementation Approach

### config.json Extension

```json
{
  "agent_mode": false,
  "agent_mode_settings": {
    "auto_approve_checkpoints": true,
    "auto_scope_decisions": "aggressive",
    "skip_clear_prompts": true,
    "lead_approval": false,
    "max_autonomy_depth": 2,
    "budget_tokens_per_phase": 500000
  }
}
```

### Three Levels of Agent Autonomy

**Level 1: Auto-decide (simplest)**
- Replace AskUserQuestion with rule-based auto-decisions
- "Which features for v1?" -> include all table stakes, skip differentiators
- "Approve roadmap?" -> auto-approve if coverage is 100%
- "Research first?" -> always yes
- Checkpoints: auto-approve human-verify, auto-decide decision, stop on human-action

**Level 2: Lead-approval (medium)**
- Same as Level 1 but decision/architectural checkpoints route to team lead
- Lead reviews and responds instead of human
- Lead can override auto-decisions
- Requires Agent Teams (lead must exist)

**Level 3: Full autonomy (most complex)**
- Agent runs entire GSD pipeline start to finish
- Only stops on human-action checkpoints (2FA, external service setup)
- Verification failures trigger automatic re-planning (no human)
- Max iteration limits prevent infinite loops

### Files That Need Agent-Mode Branches

| File | Changes Needed |
|------|---------------|
| commands/gsd/new-project.md | Skip questioning (accept project brief), auto-scope requirements, auto-approve roadmap |
| commands/gsd/plan-phase.md | Skip discuss-phase, auto-approve plans if checker passes |
| commands/gsd/execute-phase.md | Auto-approve checkpoints per level, auto-handle gaps |
| commands/gsd/verify-work.md | Auto-assess UAT (no human testing), auto-plan fixes |
| commands/gsd/debug.md | Accept symptoms as structured input, no interactive gathering |
| commands/gsd/settings.md | Support agent_mode configuration |
| All commands | Replace AskUserQuestion with auto-decision function |

### The Auto-Decision Function

Every AskUserQuestion call wraps in a check:

```
if agent_mode:
  decision = auto_decide(question, options, context)
  # Uses predefined rules or asks team lead
else:
  decision = AskUserQuestion(...)
```

Auto-decision rules per question type:
- **Scoping:** Include table stakes, include differentiators if depth=comprehensive
- **Approval:** Approve if verification passes, reject with feedback if not
- **Research:** Always research unless depth=quick
- **Model selection:** Follow model_profile from config
- **Binary choices:** Pick recommended option (first in list)

## Effort Assessment

### Phase 8: Agent Mode Foundation
**Effort: Medium (2-3 sessions)**
- Add agent_mode to config.json schema
- Create auto-decision function with rules for each question type
- Modify 2-3 commands as proof of concept (plan-phase, execute-phase)
- Test: run plan-phase in agent mode, verify it completes without human input

### Phase 9: Full Command Coverage
**Effort: Medium-High (3-5 sessions)**
- Apply agent-mode branches to all remaining commands
- Handle edge cases (what if auto-scoping produces bad requirements?)
- Add safety limits (max iterations, token budget, scope bounds)
- Test: run full new-project -> plan -> execute -> verify cycle in agent mode

### Phase 10: Lead-Approval Integration
**Effort: High (3-5 sessions)**
- Agent Teams lead as approval authority
- Message-based checkpoint routing (teammate sends checkpoint to lead)
- Lead review and response mechanism
- Timeout handling (what if lead doesn't respond?)
- Test: full Agent Teams workflow with GSD agent mode on teammates

### Phase 11: Recursive GSD (stretch goal)
**Effort: Very High (5+ sessions)**
- Teammate runs GSD that spawns its own Task subagents
- Three-level depth: lead -> teammate (GSD) -> Task executor
- Token budget management across levels
- Deadlock prevention (teammate waiting on Task that's waiting on shared resource)
- Test: multi-feature parallel development with per-teammate GSD pipelines

### Total Estimated Effort: 13-18 sessions across Phases 8-11

## Opus 1M Context Implications

With 1M tokens, the architecture shifts:

| Aspect | 200k (current) | 1M (Opus) |
|--------|----------------|-----------|
| /clear between phases | Mandatory (context rot at ~60%) | Optional (rot starts later) |
| Subagent context budget | ~15% orchestrator, 100% fresh per subagent | Could hold 3-4 phases in one window |
| Research depth | Limited by context, must summarize | Can hold full research + plan + code |
| Teammate lifespan | Short tasks, limited context | Could run multi-phase GSD cycles |
| Token cost | Moderate per phase | Higher per session but fewer sessions needed |

**Key insight:** 1M context means a single teammate could run Phases 1-3 of a project
without ever needing /clear. The fresh-context-per-subagent pattern becomes a choice
(better quality) rather than a necessity (context limit). This makes agent-mode GSD
significantly more viable because the "context management" complexity drops.

**Cost tradeoff:** Opus 1M is expensive. But if one Opus session replaces 5 Sonnet
sessions (each with context overhead), the total cost may be comparable. The value is
in reduced coordination overhead, not token savings.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Auto-decisions produce bad scoping | High | Conservative defaults + verification catches gaps |
| Infinite re-plan loops | Medium | Max iteration limits (already in GSD) |
| Token explosion (3-level depth) | High | Per-phase token budgets in config |
| Agent makes architectural decisions without human | High | Level 2 routes these to lead |
| Verification passes bad code | Medium | Adversarial verification (Phase 5 hybrid) helps |
| Race conditions with parallel GSD pipelines | Medium | File-level locking, separate directories |

## Success Criteria

- [ ] A single GSD command runs start-to-finish without human input
- [ ] An Agent Teams teammate can invoke GSD agent mode and produce verified output
- [ ] Token usage is bounded and predictable per phase
- [ ] Fallback to human-mode works at any point
- [ ] Verification quality is not degraded vs human-approved mode

---

*Documented: 2026-02-06*
*Status: Future work (after Phases 1-7 hybrid integration)*
*Priority: High -- this is the end goal of the hybrid integration*

---
name: gsd:research
description: Research any topic using GSD's full research engine (recon + hybrid debate) without needing a phase
argument-hint: "[--project <alias>] <topic or question>"
allowed-tools:
  - Read
  - Bash
  - Task
  - Glob
  - Grep
  - AskUserQuestion
  - TeamCreate
  - TeamDelete
  - SendMessage
---

<objective>
General-purpose research command. Uses the full GSD research engine (explorer recon, hybrid 3-perspective debate, structured output) on any topic -- no phase required.

**Use this command when:**
- Exploring a concept, technology, or approach before it becomes a phase
- Evaluating a decision before elevating it
- Investigating a problem domain outside the phase workflow
- Researching something for another project or context
- Pre-phase feasibility: "should this even be a phase?"

**How it differs from /gsd:research-phase:**
- No phase number required -- takes a topic or question
- No ROADMAP or REQUIREMENTS lookup
- Output goes to .planning/research/<slug>/ instead of phase directory
- Same research engine: recon explorers, hybrid debate, structured RESEARCH.md

**Orchestrator role:** Parse topic, create output directory, run recon (if enabled), run hybrid or classic research, present results.
</objective>

<execution_context>
@C:\Users\tomas\.claude/get-shit-done/workflows/research.md
@C:\Users\tomas\.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Topic: $ARGUMENTS (required -- a topic, question, or area to research)

Examples:
- /gsd:research WebSocket vs SSE for real-time updates
- /gsd:research How does upstream GSD handle agent spawning failures
- /gsd:research Best practices for CLI plugin architecture
- /gsd:research Should we add a caching layer to the dispatch pipeline
</context>

<process>
**Follow the research workflow** from @C:\Users\tomas\.claude/get-shit-done/workflows/research.md end-to-end.
</process>

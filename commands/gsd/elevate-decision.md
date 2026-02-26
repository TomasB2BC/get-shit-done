---
name: gsd:elevate-decision
description: Extract, validate, and propagate architectural decisions through 6-pass pipeline
argument-hint: "[--project <alias>] [optional initial statement]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - SlashCommand
  - Edit
---

<objective>
6-pass decision extraction pipeline: seed understanding, integrity check, deep dig, boundaries, stress test, crystallization+close.

Extracts the full shape of an architectural decision from the human, validates it adversarially, and propagates it surgically across all relevant planning artifacts with provenance.

Always interactive -- this skill requires human in the loop by design.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/elevate-decision.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
Arguments: $ARGUMENTS (may contain an initial decision statement -- Pass 1 will prompt if not provided)

**The 6-pass pipeline:**
1. Seed Understanding -- AI reads more, human writes less
2. Landscape Integrity Check -- fix stale docs before writing new decisions
3. Deep Dig -- structured questioning with lettered options, recursive branching
4. Boundaries -- scope definition with edge-case questions
5. Stress Test -- adversarial challenge, always runs
6. Crystallization + Close -- structured record, surgical edits, provenance commits

This skill is always interactive, even when agent_mode=true. Human time in the extraction loop is the most valuable resource.

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
Execute the elevate-decision workflow from @~/.claude/get-shit-done/workflows/elevate-decision.md end-to-end.
Preserve all pass gates and recursive branching logic.
</process>

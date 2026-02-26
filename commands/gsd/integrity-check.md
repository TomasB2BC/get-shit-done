---
name: gsd:integrity-check
description: Cross-reference planning docs against ground truth sources
argument-hint: "[--project <alias>] [--scope <all|state|roadmap|references>] [--fix-all]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - Edit
  - AskUserQuestion
---

<objective>
Cross-reference .planning/ document claims against ground truth sources (git history, actual file existence, phase directory contents). Present gaps with lettered fix options. Batch corrections committed.

Callable standalone, from elevate-decision Pass 2, or from other workflows that need doc freshness verification.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/integrity-check.md
</execution_context>

<context>
Arguments: $ARGUMENTS

**Flags:**
- `--scope <all|state|roadmap|references>` -- Narrow check focus (default: all)
- `--fix-all` -- Auto-apply all fixes without prompting

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
Execute the integrity-check workflow from @~/.claude/get-shit-done/workflows/integrity-check.md end-to-end.
</process>

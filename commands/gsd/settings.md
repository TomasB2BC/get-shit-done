---
name: gsd:settings
description: Configure GSD workflow toggles and model profile
allowed-tools:
  - Read
  - Write
  - AskUserQuestion
---

<objective>
Allow users to toggle workflow agents on/off and select model profile via interactive settings.

Updates `.planning/config.json` with workflow preferences and model profile selection.
</objective>

<process>

## 1. Ensure config exists

```bash
ls .planning/config.json 2>/dev/null
```

If `.planning/config.json` missing, create it with defaults:
```bash
mkdir -p .planning
```
```json
{
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  },
  "orchestration": "classic",
  "agent_teams": {
    "research": false,
    "debug": false,
    "verification": false,
    "codebase_mapping": false
  }
}
```
Write this to `.planning/config.json`, then continue.

## 2. Read Current Config

```bash
cat .planning/config.json
```

Parse current values (default to `true` if not present):
- `workflow.research` — spawn researcher during plan-phase
- `workflow.plan_check` — spawn plan checker during plan-phase
- `workflow.verifier` — spawn verifier during execute-phase
- `model_profile` — which model each agent uses (default: `balanced`)
- `git.branching_strategy` — branching approach (default: `"none"`)
- `orchestration` — orchestration mode (default: `"classic"`)
- `agent_teams.research` — Agent Teams for research (default: `false`)
- `agent_teams.debug` — Agent Teams for debug (default: `false`)
- `agent_teams.verification` — Agent Teams for verification (default: `false`)
- `agent_teams.codebase_mapping` — Agent Teams for codebase mapping (default: `false`)

## 3. Present Settings

Use AskUserQuestion with current values shown:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  },
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet phase goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies phase completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  },
  {
    question: "Git branching strategy?",
    header: "Branching",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "Commit directly to current branch" },
      { label: "Per Phase", description: "Create branch for each phase (gsd/phase-{N}-{name})" },
      { label: "Per Milestone", description: "Create branch for entire milestone (gsd/{version}-{name})" }
    ]
  },
  {
    question: "Orchestration mode?",
    header: "Orchestration",
    multiSelect: false,
    options: [
      { label: "Classic (Recommended)", description: "Task subagents only - stable, well-tested" },
      { label: "Hybrid (Experimental)", description: "Agent Teams where beneficial - higher token cost, richer collaboration" }
    ]
  },
  {
    question: "Use Agent Teams for research? (collaborative researchers with debate)",
    header: "AT: Research",
    multiSelect: false,
    options: [
      { label: "No", description: "Task subagents (classic)" },
      { label: "Yes", description: "Agent Teams with inter-agent debate (hybrid)" }
    ]
  },
  {
    question: "Use Agent Teams for debugging? (competing hypotheses pattern)",
    header: "AT: Debug",
    multiSelect: false,
    options: [
      { label: "No", description: "Single Task debugger (classic)" },
      { label: "Yes", description: "3-5 teammates testing different theories (hybrid)" }
    ]
  },
  {
    question: "Use Agent Teams for verification? (adversarial validation)",
    header: "AT: Verification",
    multiSelect: false,
    options: [
      { label: "No", description: "Single Task verifier (classic)" },
      { label: "Yes", description: "Validator + breaker + reviewer team (hybrid)" }
    ]
  },
  {
    question: "Use Agent Teams for codebase mapping? (collaborative exploration)",
    header: "AT: Mapping",
    multiSelect: false,
    options: [
      { label: "No", description: "Parallel Task mappers (classic)" },
      { label: "Yes", description: "Teammates with cross-referencing (hybrid)" }
    ]
  }
])
```

**Pre-select based on current config values.**

## 4. Update Config

Merge new settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "verifier": true/false
  },
  "git": {
    "branching_strategy": "none" | "phase" | "milestone"
  },
  "orchestration": "classic" | "hybrid",
  "agent_teams": {
    "research": true/false,
    "debug": true/false,
    "verification": true/false,
    "codebase_mapping": true/false
  }
}
```

Mapping notes:
- "Classic (Recommended)" -> "classic", "Hybrid (Experimental)" -> "hybrid"
- "Yes" -> true, "No" -> false for each AT toggle

Write updated config to `.planning/config.json`.

## 5. Confirm Changes

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |
| Git Branching        | {None/Per Phase/Per Milestone} |
| Orchestration        | {Classic/Hybrid} |
| AT: Research         | {On/Off} |
| AT: Debug            | {On/Off} |
| AT: Verification     | {On/Off} |
| AT: Mapping          | {On/Off} |

Note: Agent Teams (AT) settings only take effect when Orchestration is Hybrid
and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is set in your environment.

These settings apply to future /gsd:plan-phase and /gsd:execute-phase runs.

Quick commands:
- /gsd:set-profile <profile> — switch model profile
- /gsd:plan-phase --research — force research
- /gsd:plan-phase --skip-research — skip research
- /gsd:plan-phase --skip-verify — skip plan check
```

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with 10 settings (profile + 3 workflow + branching + orchestration + 4 AT toggles)
- [ ] Config updated with model_profile, workflow, git, orchestration, and agent_teams sections
- [ ] Changes confirmed to user
</success_criteria>

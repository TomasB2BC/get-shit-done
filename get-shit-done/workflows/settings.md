<purpose>
Interactive configuration of GSD workflow agents (research, plan_check, verifier) and model profile selection via multi-question prompt. Updates .planning/config.json with user preferences.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="ensure_config">
```bash
node C:\Users\tomas\.claude/get-shit-done/bin/gsd-tools.js config-ensure-section
```

Creates `.planning/config.json` with defaults if missing.
</step>

<step name="read_current">
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
- `agent_teams.research` — use Agent Teams for research (default: `false`)
- `agent_teams.debug` — use Agent Teams for debugging (default: `false`)
- `agent_teams.verification` — use Agent Teams for verification (default: `false`)
- `agent_teams.codebase_mapping` — use Agent Teams for codebase mapping (default: `false`)
</step>

<step name="present_settings">
Use AskUserQuestion with current values pre-selected:

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
      { label: "Classic (Recommended)", description: "Use Task subagents for all operations" },
      { label: "Hybrid (Experimental)", description: "Use Agent Teams where beneficial (requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)" }
    ]
  },
  {
    question: "Use Agent Teams for research?",
    header: "AT: Research",
    multiSelect: false,
    options: [
      { label: "No", description: "Use classic Task subagents for research" },
      { label: "Yes", description: "Use Agent Teams with debate protocol for research" }
    ]
  },
  {
    question: "Use Agent Teams for debugging?",
    header: "AT: Debug",
    multiSelect: false,
    options: [
      { label: "No", description: "Use classic Task subagent for debugging" },
      { label: "Yes", description: "Use Agent Teams with competing hypotheses for debugging" }
    ]
  },
  {
    question: "Use Agent Teams for verification?",
    header: "AT: Verify",
    multiSelect: false,
    options: [
      { label: "No", description: "Use classic Task subagent for verification" },
      { label: "Yes", description: "Use Agent Teams with adversarial validation for verification" }
    ]
  },
  {
    question: "Use Agent Teams for codebase mapping?",
    header: "AT: Mapping",
    multiSelect: false,
    options: [
      { label: "No", description: "Use classic Task subagents for codebase mapping" },
      { label: "Yes", description: "Use Agent Teams with collaborative analysis for codebase mapping" }
    ]
  },
  {
    question: "Autonomy level when agent_mode is enabled?",
    header: "Agent Autonomy",
    multiSelect: false,
    options: [
      { label: "Auto-decide (Recommended)", description: "All decisions automated, no human prompts (Phase 8-9 behavior)" },
      { label: "Lead-approval", description: "Architectural decisions routed to human via prompt, operational auto-decided" },
      { label: "Full-auto", description: "All decisions automated, no classification (same as auto-decide for now)" }
    ]
  }
])
```
</step>

<step name="update_config">
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
  },
  "agent_mode_settings": {
    ...existing_agent_mode_settings,
    "autonomy_level": "auto-decide" | "lead-approval" | "full-auto"
  }
}
```

Map the selected Agent Autonomy option to the config value:
- "Auto-decide (Recommended)" -> "auto-decide"
- "Lead-approval" -> "lead-approval"
- "Full-auto" -> "full-auto"

Write autonomy_level to agent_mode_settings in `.planning/config.json`.
</step>

<step name="confirm">
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
| Agent Autonomy       | {Auto-decide/Lead-approval/Full-auto} |

Agent Teams settings only take effect when Orchestration is Hybrid AND
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 environment variable is set.

Agent Autonomy only takes effect when agent_mode=true in config.json.
Lead-approval routes architectural decisions to you during /gsd:auto runs.

These settings apply to future /gsd:plan-phase and /gsd:execute-phase runs.

Quick commands:
- /gsd:set-profile <profile> — switch model profile
- /gsd:plan-phase --research — force research
- /gsd:plan-phase --skip-research — skip research
- /gsd:plan-phase --skip-verify — skip plan check
```
</step>

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with 11 settings (profile + 3 workflow toggles + git branching + orchestration + 4 agent teams toggles + agent autonomy)
- [ ] Config updated with model_profile, workflow, and git sections
- [ ] Changes confirmed to user
</success_criteria>

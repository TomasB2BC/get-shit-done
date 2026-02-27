#!/usr/bin/env node

/**
 * GSD Tools — CLI utility for GSD workflow operations
 *
 * Replaces repetitive inline bash patterns across ~50 GSD command/workflow/agent files.
 * Centralizes: config parsing, model resolution, phase lookup, git commits, summary verification.
 *
 * Usage: node gsd-tools.js <command> [args] [--raw]
 *
 * Commands:
 *   state load                         Load project config + state
 *   state update <field> <value>       Update a STATE.md field
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   find-phase <phase>                 Find phase directory by number
 *   list-phases                        List all phase numbers sorted numerically
 *   resolve-project <alias>            Resolve project alias to planning dir
 *   register-project [alias] [--dir]   Register current project
 *   list-projects                      List all registered projects
 *   commit <message> [--files f1 f2]   Commit planning docs
 *   verify-summary <path>              Verify a SUMMARY.md file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'gsd-planner':              { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'gsd-roadmapper':           { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-executor':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-phase-researcher':     { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-project-researcher':   { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-debugger':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-codebase-mapper':      { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'gsd-verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-plan-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-intent-loader':        { quality: 'sonnet', balanced: 'haiku',  budget: 'haiku' },
  'gsd-delivery-packager':    { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'gsd/phase-{phase}-{slug}',
    milestone_branch_template: 'gsd/{milestone}-{slug}',
    research: true,
    plan_checker: true,
    verifier: true,
    parallelization: true,
    agent_mode: false,
    agent_mode_settings: {
      auto_scope: 'conservative',
      max_phases: null,
      max_iterations_per_phase: 3,
      budget_tokens_per_phase: 500000,
      autonomy_level: 'auto-decide',
    },
    orchestration: 'classic',
    agent_teams: {
      research: false,
      debug: false,
      verification: false,
      codebase_mapping: false,
    },
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    const agentModeSettings = (() => {
      const settings = parsed.agent_mode_settings || {};
      return {
        auto_scope: settings.auto_scope ?? defaults.agent_mode_settings.auto_scope,
        max_phases: settings.max_phases ?? defaults.agent_mode_settings.max_phases,
        max_iterations_per_phase: settings.max_iterations_per_phase ?? defaults.agent_mode_settings.max_iterations_per_phase,
        budget_tokens_per_phase: settings.budget_tokens_per_phase ?? defaults.agent_mode_settings.budget_tokens_per_phase,
        autonomy_level: settings.autonomy_level ?? defaults.agent_mode_settings.autonomy_level,
      };
    })();

    return {
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      phase_branch_template: get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ?? defaults.phase_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      plan_checker: get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      parallelization,
      agent_mode: parsed.agent_mode ?? defaults.agent_mode,
      agent_mode_settings: agentModeSettings,
      orchestration: get('orchestration') ?? defaults.orchestration,
      agent_teams: (() => {
        const at = parsed.agent_teams || {};
        return {
          research: at.research ?? defaults.agent_teams.research,
          debug: at.debug ?? defaults.agent_teams.debug,
          verification: at.verification ?? defaults.agent_teams.verification,
          codebase_mapping: at.codebase_mapping ?? defaults.agent_teams.codebase_mapping,
        };
      })(),
    };
  } catch {
    return defaults;
  }
}

function isGitIgnored(cwd, targetPath) {
  try {
    execSync('git check-ignore -q -- ' + targetPath.replace(/[^a-zA-Z0-9._\-/]/g, ''), {
      cwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function execGit(cwd, args) {
  try {
    const escaped = args.map(a => {
      if (/^[a-zA-Z0-9._\-/=:@]+$/.test(a)) return a;
      return "'" + a.replace(/'/g, "'\\''") + "'";
    });
    const stdout = execSync('git ' + escaped.join(' '), {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

function normalizePhaseName(phase) {
  const match = phase.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return phase;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}

function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

function logAutoDecision(cwd, entry) {
  const logPath = path.join(cwd, '.planning', 'AUTO-DISPATCH-LOG.md');

  let content = '';
  try {
    content = fs.readFileSync(logPath, 'utf-8');
  } catch {
    // Create new log file with header
    content = '# Auto-Dispatch Log\n\n**Started:** ' + new Date().toISOString() + '\n\n## Decisions\n\n';
  }

  // Tiered verbosity per CONTEXT.md locked decision:
  // compact one-liners for standard rule-based, verbose for synthetic/skipped, verbose for architectural
  let logEntry;
  if (entry.architectural) {
    // Verbose format for architectural decisions routed to lead via AskUserQuestion
    logEntry = '### ARCHITECTURAL: ' + entry.type.toUpperCase() + '\n' +
      '[' + entry.timestamp + '] LEAD PROMPT: "' + entry.question + '"\n' +
      '  Response: ' + (entry.response || '(pending)') + '\n' +
      '  Wait time: ' + (entry.wait_time !== undefined ? entry.wait_time + 's' : 'N/A') + '\n' +
      '  Delegated: ' + (entry.delegated ? 'yes' : 'no') + '\n\n';
  } else if (entry.synthetic || entry.decision === null) {
    // Verbose format for synthetic and skipped decisions
    logEntry = '### ' + (entry.synthetic ? 'SYNTHETIC' : 'SKIPPED') + ': ' + entry.type.toUpperCase() + '\n' +
      '[' + entry.timestamp + '] ' + entry.type.toUpperCase() + ': "' + entry.question + '"\n' +
      '  Decision: ' + (entry.decision || '(skipped)') + '\n' +
      '  Rationale: ' + entry.rationale + '\n\n';
  } else {
    // Compact one-liner for rule-based decisions
    logEntry = '[' + entry.timestamp + '] ' + entry.type.toUpperCase() + ': "' + entry.question + '" -> "' +
      (typeof entry.decision === 'string' ? entry.decision : JSON.stringify(entry.decision)) +
      '" (' + entry.rationale + ')\n';
  }

  // Insert before Summary section if it exists, otherwise append
  const summaryIdx = content.indexOf('## Summary');
  if (summaryIdx >= 0) {
    content = content.slice(0, summaryIdx) + logEntry + '\n' + content.slice(summaryIdx);
  } else {
    content += logEntry;
  }

  fs.writeFileSync(logPath, content, 'utf-8');
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdConfigEnsureSection(cwd, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Create default config
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'gsd/phase-{phase}-{slug}',
    milestone_branch_template: 'gsd/{milestone}-{slug}',
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
    },
    parallelization: true,
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

function cmdStateLoad(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = path.join(cwd, '.planning');

  let stateRaw = '';
  try {
    stateRaw = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf-8');
  } catch {}

  const configExists = fs.existsSync(path.join(planningDir, 'config.json'));
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const stateExists = stateRaw.length > 0;

  const result = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    roadmap_exists: roadmapExists,
    config_exists: configExists,
  };

  // For --raw, output a condensed key=value format
  if (raw) {
    const c = config;
    const lines = [
      `model_profile=${c.model_profile}`,
      `commit_docs=${c.commit_docs}`,
      `branching_strategy=${c.branching_strategy}`,
      `phase_branch_template=${c.phase_branch_template}`,
      `milestone_branch_template=${c.milestone_branch_template}`,
      `parallelization=${c.parallelization}`,
      `research=${c.research}`,
      `plan_checker=${c.plan_checker}`,
      `verifier=${c.verifier}`,
      `agent_mode=${c.agent_mode}`,
      `auto_scope=${c.agent_mode_settings.auto_scope}`,
      `max_phases=${c.agent_mode_settings.max_phases}`,
      `max_iterations_per_phase=${c.agent_mode_settings.max_iterations_per_phase}`,
      `budget_tokens_per_phase=${c.agent_mode_settings.budget_tokens_per_phase}`,
      `autonomy_level=${c.agent_mode_settings.autonomy_level}`,
      `orchestration=${c.orchestration}`,
      `agent_teams_research=${c.agent_teams.research}`,
      `agent_teams_debug=${c.agent_teams.debug}`,
      `agent_teams_verification=${c.agent_teams.verification}`,
      `agent_teams_codebase_mapping=${c.agent_teams.codebase_mapping}`,
      `config_exists=${configExists}`,
      `roadmap_exists=${roadmapExists}`,
      `state_exists=${stateExists}`,
    ];
    process.stdout.write(lines.join('\n'));
    process.exit(0);
  }

  output(result);
}

function cmdStateUpdate(cwd, field, value) {
  if (!field || value === undefined) {
    error('field and value required for state update');
  }

  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${value}`);
      fs.writeFileSync(statePath, content, 'utf-8');
      output({ updated: true });
    } else {
      output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';

  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) {
    const result = { model: 'sonnet', profile, unknown_agent: true };
    output(result, raw, 'sonnet');
    return;
  }

  const model = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const result = { model, profile };
  output(result, raw, model);
}

function cmdFindPhase(cwd, phase, raw) {
  if (!phase) {
    error('phase identifier required');
  }

  const phasesDir = path.join(cwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  const notFound = { found: false, directory: null, phase_number: null, phase_name: null, plans: [], summaries: [] };

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const phaseDir = path.join(phasesDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);
    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    const result = {
      found: true,
      directory: path.join('.planning', 'phases', match),
      phase_number: phaseNumber,
      phase_name: phaseName,
      plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

function cmdListPhases(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    // Extract phase numbers from directory names
    const phases = [];
    for (const dir of dirs) {
      const match = dir.name.match(/^(\d+(?:\.\d+)?)-/);
      if (match) {
        phases.push(match[1]);
      }
    }

    // Sort numerically (integer part first, then decimal part)
    phases.sort((a, b) => {
      const aParts = a.split('.').map(Number);
      const bParts = b.split('.').map(Number);
      if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
      return (aParts[1] || 0) - (bParts[1] || 0);
    });

    // Deduplicate (multiple dirs with same phase number)
    const unique = [...new Set(phases)];

    const result = {
      phases: unique,
      count: unique.length
    };

    output(result, raw, unique.join('\n'));
  } catch {
    output({ phases: [], count: 0 }, raw, '');
  }
}

function cmdCommit(cwd, message, files, raw) {
  if (!message) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
  for (const file of filesToStage) {
    execGit(cwd, ['add', file]);
  }

  // Commit
  const commitResult = execGit(cwd, ['commit', '-m', message]);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = { committed: false, hash: null, reason: 'nothing_to_commit', error: commitResult.stderr };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const result = { committed: true, hash, reason: 'committed' };
  output(result, raw, hash || 'committed');
}

function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath = path.join(cwd, summaryPath);
  const checkCount = checkFileCount || 2;

  // Check 1: Summary exists
  if (!fs.existsSync(fullPath)) {
    const result = {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        self_check: 'not_found',
      },
      errors: ['SUMMARY.md not found'],
    };
    output(result, raw, 'failed');
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const errors = [];

  // Check 2: Spot-check files mentioned in summary
  const mentionedFiles = new Set();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck = Array.from(mentionedFiles).slice(0, checkCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check 3: Commits exist
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes = content.match(commitHashPattern) || [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      const result = execGit(cwd, ['cat-file', '-t', hash]);
      if (result.exitCode === 0 && result.stdout === 'commit') {
        commitsExist = true;
        break;
      }
    }
  }

  // Check 4: Self-check section
  let selfCheck = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (!commitsExist && hashes.length > 0) errors.push('Referenced commit hashes not found in git history');
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  const checks = {
    summary_exists: true,
    files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  const passed = missing.length === 0 && selfCheck !== 'failed';
  const result = { passed, checks, errors };
  output(result, raw, passed ? 'passed' : 'failed');
}

function cmdAutoDecide(cwd, questionType, question, options, context, raw) {
  if (!questionType || !question) {
    error('type and question required for auto-decide');
  }

  const config = loadConfig(cwd);
  const agentSettings = config.agent_mode_settings || {};
  const autoScope = agentSettings.auto_scope || 'conservative';

  let decision;
  let rationale;
  let synthetic = false;
  let needsAgentSynthesis = false;
  let optionIndex = 0;

  const optionsList = options ? (typeof options === 'string' ? JSON.parse(options) : options) : [];

  switch (questionType) {
    case 'scope':
      optionIndex = autoScope === 'comprehensive' ? Math.min(1, optionsList.length - 1) : 0;
      decision = optionsList[optionIndex] || optionsList[0];
      rationale = 'Scoping rule (auto_scope=' + autoScope + ')';
      break;

    case 'approval':
      decision = optionsList[0] || 'Approve';
      rationale = 'Auto-approve (no failure indicators)';
      break;

    case 'research':
      const researchYes = optionsList.findIndex(function(o) {
        const label = typeof o === 'string' ? o : (o.label || '');
        return /research|yes|recommended/i.test(label);
      });
      optionIndex = researchYes >= 0 ? researchYes : 0;
      decision = optionsList[optionIndex];
      rationale = 'Always research in agent mode';
      break;

    case 'binary':
      optionIndex = 0;
      decision = optionsList[0];
      rationale = 'Binary: selected recommended option (first)';
      break;

    case 'multiSelect':
      if (autoScope === 'comprehensive') {
        decision = optionsList;
      } else {
        decision = optionsList.filter(function(o) {
          const label = typeof o === 'string' ? o : (o.label || '');
          return !/none|skip|defer/i.test(label);
        });
        if (decision.length === 0) decision = [optionsList[0]];
      }
      rationale = 'Multi-select (auto_scope=' + autoScope + ')';
      break;

    case 'freeform':
      decision = null;
      needsAgentSynthesis = true;
      rationale = 'Freeform question requires LLM synthesis';
      break;

    default:
      optionIndex = 0;
      decision = optionsList[0] || null;
      rationale = 'Default rule: first option for unknown type "' + questionType + '"';
  }

  // Validate option index bounds (structured types only)
  if (!needsAgentSynthesis && optionsList.length > 0) {
    if (optionIndex >= optionsList.length) {
      optionIndex = 0;
      decision = optionsList[0];
      rationale += ' (FALLBACK: option index out of bounds)';
    }
  }

  // Log structured decisions (freeform logged by workflow after synthesis)
  if (!needsAgentSynthesis) {
    logAutoDecision(cwd, {
      timestamp: new Date().toISOString(),
      type: questionType,
      question: question,
      decision: decision,
      optionIndex: optionIndex,
      rationale: rationale,
      synthetic: false,
    });
  }

  const result = {
    decision: decision,
    option_index: optionIndex,
    rationale: rationale,
    synthetic: synthetic,
    needs_agent_synthesis: needsAgentSynthesis,
    logged: !needsAgentSynthesis,
  };

  const rawValue = needsAgentSynthesis ? 'NEEDS_SYNTHESIS' : (typeof decision === 'string' ? decision : JSON.stringify(decision));
  output(result, raw, rawValue);
}

function cmdLogDecision(cwd, decisionType, question, decision, rationale, raw, response, waitTime) {
  if (!decisionType || !question || decision === undefined || !rationale) {
    error('type, question, decision, and rationale required for log-decision');
  }

  const entry = {
    timestamp: new Date().toISOString(),
    type: decisionType,
    question: question,
    decision: decision,
    rationale: rationale,
  };

  if (decisionType === 'architectural') {
    entry.architectural = true;
    if (response) entry.response = response;
    if (waitTime !== undefined) entry.wait_time = waitTime;
  } else {
    entry.synthetic = true;
  }

  logAutoDecision(cwd, entry);

  const result = { logged: true };
  output(result, raw, 'logged');
}

// ─── Project Alias Resolution ─────────────────────────────────────────────────

function resolveProject(cwd, alias) {
  const projectsPath = path.join(cwd, '.planning', 'projects.json');

  try {
    const raw = fs.readFileSync(projectsPath, 'utf-8');
    const projects = JSON.parse(raw);

    if (!projects[alias]) {
      const available = Object.keys(projects);
      const availableStr = available.length > 0 ? available.join(', ') : '(none)';
      return {
        found: false,
        alias,
        planning_dir: null,
        error: 'Alias "' + alias + '" not found. Available: ' + availableStr
      };
    }

    const entry = projects[alias];
    const planningDir = entry.planning_dir || entry;
    const resolved = path.resolve(cwd, planningDir).replace(/\\/g, '/');

    return {
      found: true,
      alias,
      planning_dir: resolved
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        found: false,
        alias,
        planning_dir: null,
        error: 'No projects registered. Run /gsd:register-project first.'
      };
    }
    return {
      found: false,
      alias,
      planning_dir: null,
      error: 'Error reading projects.json: ' + err.message
    };
  }
}

function registerProject(cwd, alias, planningDir) {
  const projectsPath = path.join(cwd, '.planning', 'projects.json');

  // Read existing or create empty
  let projects = {};
  try {
    const raw = fs.readFileSync(projectsPath, 'utf-8');
    projects = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { registered: false, error: 'Error reading projects.json: ' + err.message };
    }
    // File doesn't exist, start fresh
  }

  // Normalize planning_dir for comparison
  const normalizedDir = planningDir.replace(/\\/g, '/');

  // Check if alias already exists
  if (projects[alias]) {
    const existingDir = (projects[alias].planning_dir || projects[alias]).replace(/\\/g, '/');
    if (existingDir === normalizedDir) {
      return { registered: true, reason: 'already_registered' };
    }
    return {
      registered: false,
      error: 'Alias "' + alias + '" already registered to: ' + existingDir
    };
  }

  // Validate the planning_dir exists
  const resolvedDir = path.resolve(cwd, planningDir);
  if (!fs.existsSync(resolvedDir)) {
    return {
      registered: false,
      error: 'Planning directory does not exist: ' + planningDir
    };
  }

  // Register
  projects[alias] = {
    planning_dir: normalizedDir,
    registered: new Date().toISOString()
  };

  // Ensure .planning directory exists
  const planningParent = path.join(cwd, '.planning');
  if (!fs.existsSync(planningParent)) {
    fs.mkdirSync(planningParent, { recursive: true });
  }

  fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2), 'utf-8');

  return {
    registered: true,
    reason: 'new_registration',
    alias,
    planning_dir: normalizedDir
  };
}

function listProjects(cwd) {
  const projectsPath = path.join(cwd, '.planning', 'projects.json');

  try {
    const raw = fs.readFileSync(projectsPath, 'utf-8');
    const projects = JSON.parse(raw);

    const projectList = Object.keys(projects).map(alias => ({
      alias,
      planning_dir: projects[alias].planning_dir || projects[alias],
      registered: projects[alias].registered || 'unknown'
    }));

    return { projects: projectList, count: projectList.length };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { projects: [], count: 0 };
    }
    return { projects: [], count: 0, error: err.message };
  }
}

function cmdResolveProject(cwd, alias, raw) {
  if (!alias) {
    error('alias required for resolve-project');
  }

  const result = resolveProject(cwd, alias);
  output(result, raw, result.found ? result.planning_dir : '');
}

function cmdRegisterProject(cwd, alias, planningDir, raw) {
  // Derive alias from directory name if not provided
  if (!alias) {
    alias = path.basename(cwd);
  }

  // Default planning dir to current .planning/
  if (!planningDir) {
    planningDir = '.planning';
  }

  const result = registerProject(cwd, alias, planningDir);

  if (raw) {
    if (result.registered) {
      process.stdout.write(result.reason);
    } else {
      process.stdout.write('error');
    }
    process.exit(0);
  }

  output(result);
}

function cmdListProjects(cwd, raw) {
  const result = listProjects(cwd);

  if (raw) {
    const aliases = result.projects.map(p => p.alias);
    process.stdout.write(aliases.join('\n'));
    process.exit(0);
  }

  output(result);
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error('Usage: gsd-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-phase, list-phases, resolve-project, register-project, list-projects, commit, verify-summary, auto-decide, log-decision, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section');
  }

  switch (command) {
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'update') {
        cmdStateUpdate(cwd, args[2], args[3]);
      } else {
        cmdStateLoad(cwd, raw);
      }
      break;
    }

    case 'resolve-model': {
      cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'find-phase': {
      cmdFindPhase(cwd, args[1], raw);
      break;
    }

    case 'list-phases': {
      cmdListPhases(cwd, raw);
      break;
    }

    case 'resolve-project': {
      cmdResolveProject(cwd, args[1], raw);
      break;
    }

    case 'register-project': {
      const alias = args[1] && !args[1].startsWith('--') ? args[1] : null;
      const dirIndex = args.indexOf('--dir');
      const planningDir = dirIndex !== -1 ? args[dirIndex + 1] : null;
      cmdRegisterProject(cwd, alias, planningDir, raw);
      break;
    }

    case 'list-projects': {
      cmdListProjects(cwd, raw);
      break;
    }

    case 'commit': {
      const message = args[1];
      // Parse --files flag
      const filesIndex = args.indexOf('--files');
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1) : [];
      cmdCommit(cwd, message, files, raw);
      break;
    }

    case 'verify-summary': {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      cmdVerifySummary(cwd, summaryPath, checkCount, raw);
      break;
    }

    case 'generate-slug': {
      cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'verify-path-exists': {
      cmdVerifyPathExists(cwd, args[1], raw);
      break;
    }

    case 'config-ensure-section': {
      cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'auto-decide': {
      // Parse arguments: --type <type> --question <question> [--options '<json>'] [--context '<json>']
      const typeIndex = args.indexOf('--type');
      const questionIndex = args.indexOf('--question');
      const optionsIndex = args.indexOf('--options');
      const contextIndex = args.indexOf('--context');

      const questionType = typeIndex !== -1 ? args[typeIndex + 1] : null;
      const question = questionIndex !== -1 ? args[questionIndex + 1] : null;
      const options = optionsIndex !== -1 ? args[optionsIndex + 1] : null;
      const context = contextIndex !== -1 ? args[contextIndex + 1] : null;

      cmdAutoDecide(cwd, questionType, question, options, context, raw);
      break;
    }

    case 'log-decision': {
      // Parse arguments: --type <type> --question <question> --decision <decision> --rationale <rationale>
      // Optional: --response <response> --wait-time <seconds> (for architectural type)
      const typeIndex = args.indexOf('--type');
      const questionIndex = args.indexOf('--question');
      const decisionIndex = args.indexOf('--decision');
      const rationaleIndex = args.indexOf('--rationale');
      const responseIndex = args.indexOf('--response');
      const waitTimeIndex = args.indexOf('--wait-time');

      const decisionType = typeIndex !== -1 ? args[typeIndex + 1] : null;
      const question = questionIndex !== -1 ? args[questionIndex + 1] : null;
      const decision = decisionIndex !== -1 ? args[decisionIndex + 1] : null;
      const rationale = rationaleIndex !== -1 ? args[rationaleIndex + 1] : null;
      const response = responseIndex !== -1 ? args[responseIndex + 1] : null;
      const waitTime = waitTimeIndex !== -1 ? args[waitTimeIndex + 1] : null;

      cmdLogDecision(cwd, decisionType, question, decision, rationale, raw, response, waitTime);
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();

import { spawn } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceFilters = {
  app: '@fastgpt/app',
  admin: '@fastgpt/admin',
  global: '@fastgpt/global',
  service: '@fastgpt/service',
  web: '@fastgpt/web'
};
const workspaceScopes = Object.keys(workspaceFilters);
const supportedModes = ['unit', 'integration', 'sandbox', 'all'];

const parseUnitScopes = (scopeValue) => {
  const scopes = scopeValue
    ? scopeValue
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean)
    : ['all'];

  if (scopes.length === 0) {
    throw new Error('FASTGPT_TEST_SCOPE must contain at least one scope');
  }

  const invalidScopes = scopes.filter(
    (scope) => !workspaceScopes.includes(scope) && !['all', 'workspace', 'repo'].includes(scope)
  );
  if (invalidScopes.length > 0) {
    throw new Error(
      `Unsupported FASTGPT_TEST_SCOPE: ${invalidScopes.join(', ')}. ` +
        `Expected one or more of: all, workspace, repo, ${workspaceScopes.join(', ')}`
    );
  }
  if (scopes.includes('all') && scopes.length > 1) {
    throw new Error('FASTGPT_TEST_SCOPE=all cannot be combined with other scopes');
  }

  const expandedScopes = scopes.flatMap((scope) => {
    if (scope === 'all') return [...workspaceScopes, 'repo'];
    if (scope === 'workspace') return workspaceScopes;
    return scope;
  });

  return [...new Set(expandedScopes)];
};

/** Resolve the root test mode and scope into an ordered execution plan. */
export const resolveTestPlan = ({ args = [], modeValue, scopeValue } = {}) => {
  if (args.length > 0) {
    if (modeValue || scopeValue) {
      throw new Error('Test paths cannot be combined with FASTGPT_TEST_MODE or FASTGPT_TEST_SCOPE');
    }
    return [{ command: 'node', args: ['./scripts/test/light.mjs', ...args] }];
  }

  const mode = modeValue?.trim() || 'unit';
  if (!supportedModes.includes(mode)) {
    throw new Error(
      `Unsupported FASTGPT_TEST_MODE: ${mode}. Expected one of: ${supportedModes.join(', ')}`
    );
  }

  if (mode === 'integration') {
    if (scopeValue && scopeValue.trim() !== 'service') {
      throw new Error(
        'FASTGPT_TEST_MODE=integration currently supports only FASTGPT_TEST_SCOPE=service'
      );
    }
    return [
      {
        command: 'pnpm',
        args: ['exec', 'turbo', 'run', 'test:integration', '--filter=@fastgpt/service']
      }
    ];
  }

  if (mode === 'sandbox') {
    if (scopeValue) {
      throw new Error('FASTGPT_TEST_MODE=sandbox does not accept FASTGPT_TEST_SCOPE');
    }
    return [
      {
        command: 'pnpm',
        args: ['--dir', 'packages/service', 'test:integration:sandbox']
      }
    ];
  }

  if (mode === 'all' && scopeValue) {
    throw new Error('FASTGPT_TEST_MODE=all does not accept FASTGPT_TEST_SCOPE');
  }

  const unitScopes = parseUnitScopes(mode === 'all' ? 'workspace' : scopeValue);
  const selectedWorkspaces = unitScopes.filter((scope) => scope in workspaceFilters);
  const plan = [];

  if (selectedWorkspaces.length > 0) {
    plan.push({
      command: 'node',
      args: [
        './scripts/test/withMongo.mjs',
        'pnpm',
        'exec',
        'turbo',
        'run',
        'test',
        '--concurrency=1',
        ...selectedWorkspaces.map((scope) => `--filter=${workspaceFilters[scope]}`)
      ]
    });
  }

  if (unitScopes.includes('repo')) {
    plan.push({
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.config.mts',
        '--coverage',
        '--passWithNoTests'
      ]
    });
  }

  if (mode === 'all') {
    plan.push({
      command: 'pnpm',
      args: ['exec', 'turbo', 'run', 'test:integration', '--filter=@fastgpt/service']
    });
  }

  return plan;
};

const runCommand = ({ command, args }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          signal
            ? `${command} terminated by signal ${signal}`
            : `${command} exited with code ${code ?? 1}`
        )
      );
    });
  });

const run = async () => {
  const plan = resolveTestPlan({
    args: process.argv.slice(2),
    modeValue: process.env.FASTGPT_TEST_MODE,
    scopeValue: process.env.FASTGPT_TEST_SCOPE
  });

  for (const command of plan) {
    await runCommand(command);
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

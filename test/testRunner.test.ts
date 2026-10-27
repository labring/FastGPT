import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTestPlan } from '../scripts/test/run.mjs';

describe('resolveTestPlan', () => {
  it('runs all workspace unit tests sequentially and then repo tests by default', () => {
    const plan = resolveTestPlan();

    expect(plan).toHaveLength(2);
    expect(plan[0]?.args).toEqual(
      expect.arrayContaining([
        '--concurrency=1',
        '--filter=@fastgpt/app',
        '--filter=@fastgpt/web',
        '--filter=@fastgpt/workflow-core',
        '--filter=@fastgpt/workflow-cli'
      ])
    );
    expect(plan[1]?.args).toContain('vitest.config.mts');
  });

  it.each([
    {
      scopeValue: 'global,service',
      filters: ['--filter=@fastgpt/global', '--filter=@fastgpt/service']
    },
    {
      scopeValue: 'workflow-core,workflow-cli',
      filters: ['--filter=@fastgpt/workflow-core', '--filter=@fastgpt/workflow-cli']
    }
  ])('filters unit tests to the requested $scopeValue scopes', ({ scopeValue, filters }) => {
    const plan = resolveTestPlan({ scopeValue });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.args.filter((argument: string) => argument.startsWith('--filter='))).toEqual(
      filters
    );
  });

  it('supports optional workflow package scopes used by the CI workflows', () => {
    const workflowScopes = ['workflow-core', 'workflow-cli'];
    const availableScopes = workflowScopes.filter((scope) =>
      existsSync(resolve(process.cwd(), 'packages', scope, 'package.json'))
    );
    const plan = resolveTestPlan({ scopeValue: workflowScopes.join(',') });

    expect(plan).toHaveLength(availableScopes.length > 0 ? 1 : 0);
    availableScopes.forEach((scope) => {
      expect(plan[0]?.args).toContain(`--filter=@fastgpt/${scope}`);
    });
  });

  it('supports repo-only and workspace-only unit tests', () => {
    expect(resolveTestPlan({ scopeValue: 'repo' })[0]?.args).toContain('vitest.config.mts');

    const workspacePlan = resolveTestPlan({ scopeValue: 'workspace' });
    expect(workspacePlan).toHaveLength(1);
    expect(workspacePlan[0]?.args).toContain('--filter=@fastgpt/admin');
  });

  it('routes integration modes to their service commands', () => {
    expect(resolveTestPlan({ modeValue: 'integration' })[0]?.args).toContain('test:integration');
    expect(resolveTestPlan({ modeValue: 'sandbox' })[0]?.args).toContain(
      'test:integration:sandbox'
    );
  });

  it('preserves the former test:all behavior', () => {
    const plan = resolveTestPlan({ modeValue: 'all' });

    expect(plan).toHaveLength(2);
    expect(plan[0]?.args).toContain('--concurrency=1');
    expect(plan[1]?.args).toContain('test:integration');
  });

  it('routes positional paths through the lightweight runner', () => {
    expect(resolveTestPlan({ args: ['test/example.test.ts', '--', '-u'] })).toEqual([
      {
        command: 'node',
        args: ['./scripts/test/light.mjs', 'test/example.test.ts', '--', '-u']
      }
    ]);
  });

  it('rejects unsupported or ambiguous combinations', () => {
    expect(() => resolveTestPlan({ scopeValue: 'unknown' })).toThrow(
      'Unsupported FASTGPT_TEST_SCOPE'
    );
    expect(() => resolveTestPlan({ scopeValue: ' ' })).toThrow('must contain at least one scope');
    expect(() => resolveTestPlan({ modeValue: 'unknown' })).toThrow(
      'Unsupported FASTGPT_TEST_MODE'
    );
    expect(() => resolveTestPlan({ args: ['test'], scopeValue: 'app' })).toThrow(
      'cannot be combined'
    );
  });
});

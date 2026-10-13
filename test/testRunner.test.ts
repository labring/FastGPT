import { describe, expect, it } from 'vitest';
import { resolveTestPlan } from '../scripts/test/run.mjs';

describe('resolveTestPlan', () => {
  it('runs all workspace unit tests sequentially and then repo tests by default', () => {
    const plan = resolveTestPlan();

    expect(plan).toHaveLength(2);
    expect(plan[0]?.args).toContain('--concurrency=1');
    expect(plan[0]?.args).toContain('--filter=@fastgpt/app');
    expect(plan[0]?.args).toContain('--filter=@fastgpt/web');
    expect(plan[1]?.args).toContain('vitest.config.mts');
  });

  it('filters unit tests to one or more requested scopes', () => {
    const plan = resolveTestPlan({ scopeValue: 'global,service' });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.args).toContain('--filter=@fastgpt/global');
    expect(plan[0]?.args).toContain('--filter=@fastgpt/service');
    expect(plan[0]?.args).not.toContain('--filter=@fastgpt/app');
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

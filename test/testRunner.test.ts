import { describe, expect, it } from 'vitest';
import { groupTestsByConfig } from '../scripts/test/light.mjs';
import { resolveTestPlan } from '../scripts/test/run.mjs';

describe('resolveTestPlan & groupTestsByConfig', () => {
  it('runs all workspace unit tests sequentially with Mongo and then repo tests by default', () => {
    const plan = resolveTestPlan();

    expect(plan).toHaveLength(2);
    expect(plan[0]?.command).toBe('node');
    expect(plan[0]?.args).toEqual(
      expect.arrayContaining([
        './scripts/test/withMongo.mjs',
        '--concurrency=1',
        '--filter=@fastgpt/app',
        '--filter=@fastgpt/web',
        '--filter=@fastgpt/opensandbox-proxy',
        '--filter=@fastgpt/volume-manager',
        '--filter=@fastgpt/workflow-core',
        '--filter=@fastgpt/workflow-cli'
      ])
    );
    expect(plan[1]?.args).toContain('vitest.config.mts');
  });

  it('skips withMongo wrapper when running Mongo-free scopes such as volume-manager or global', () => {
    const proxyPlan = resolveTestPlan({ scopeValue: 'opensandbox-proxy' });
    expect(proxyPlan).toEqual([
      {
        command: 'pnpm',
        args: [
          'exec',
          'turbo',
          'run',
          'test',
          '--concurrency=1',
          '--filter=@fastgpt/opensandbox-proxy'
        ]
      }
    ]);

    const vmPlan = resolveTestPlan({ scopeValue: 'volume-manager' });
    expect(vmPlan).toEqual([
      {
        command: 'pnpm',
        args: [
          'exec',
          'turbo',
          'run',
          'test',
          '--concurrency=1',
          '--filter=@fastgpt/volume-manager'
        ]
      }
    ]);

    const servicePlan = resolveTestPlan({ scopeValue: 'global,service' });
    expect(servicePlan[0]?.command).toBe('node');
    expect(servicePlan[0]?.args[0]).toBe('./scripts/test/withMongo.mjs');
    expect(servicePlan[0]?.args.filter((arg: string) => arg.startsWith('--filter='))).toEqual([
      '--filter=@fastgpt/global',
      '--filter=@fastgpt/service'
    ]);
  });

  it('supports repo-only, workspace-only, integration, sandbox, and all modes', () => {
    expect(resolveTestPlan({ scopeValue: 'repo' })[0]?.args).toContain('vitest.config.mts');
    expect(resolveTestPlan({ scopeValue: 'workspace' })).toHaveLength(1);
    expect(resolveTestPlan({ modeValue: 'integration' })[0]?.args).toContain('test:integration');
    expect(resolveTestPlan({ modeValue: 'sandbox' })[0]?.args).toContain(
      'test:integration:sandbox'
    );

    const allPlan = resolveTestPlan({ modeValue: 'all' });
    expect(allPlan).toHaveLength(2);
    expect(allPlan[1]?.args).toContain('test:integration');
  });

  it('routes positional paths through light.mjs and groups opensandbox-proxy tests under bun', () => {
    expect(resolveTestPlan({ args: ['test/testRunner.test.ts', '--', '-u'] })).toEqual([
      {
        command: 'node',
        args: ['./scripts/test/light.mjs', 'test/testRunner.test.ts', '--', '-u']
      }
    ]);

    const groups = groupTestsByConfig([
      'projects/opensandbox-proxy/test/proxy.test.ts',
      'test/testRunner.test.ts'
    ]);
    expect(groups).toMatchObject([
      { runner: 'bun', testPaths: ['test/proxy.test.ts'] },
      { runner: 'vitest', testPaths: ['test/testRunner.test.ts'] }
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

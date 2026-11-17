import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowCommandSpecs } from '../../src/cli/commands/workflow';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const APP_ID = '68ad85a7463006c963799a05';
const tempDirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-wf-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function exec({
  args,
  cwd,
  auth = [],
  fetchFn = vi.fn(),
  env = {}
}: {
  args: string[];
  cwd: string;
  auth?: string[];
  fetchFn?: CliFetchFn;
  env?: NodeJS.ProcessEnv;
}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli({
    argv: [...args, ...auth, '--format', 'json', '--no-color'],
    cwd,
    env: {
      FASTGPT_CONFIG_DIR: cwd,
      FASTGPT_SECRET_STORE: 'file',
      ...env
    },
    isTTY: false,
    fetchFn,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('Workflow CLI commands', () => {
  it('registers all local DSL and cloud workflow commands with accurate authModes', () => {
    const specs = createWorkflowCommandSpecs();
    const byPath = new Map(specs.map((spec) => [spec.path.join(' '), spec]));

    expect(byPath.get('workflow init')?.authModes).toEqual(['none']);
    expect(byPath.get('workflow changeset apply')?.authModes).toEqual(['none']);
    expect(byPath.get('workflow pull')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow push')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow publish')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow debug')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow test')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow sandbox-packages')?.authModes).toEqual(['token']);
    expect(byPath.get('workflow optimize-code')?.authModes).toEqual(['token', 'personalKey']);
    expect(specs.every((spec) => spec.examples && spec.examples.length > 0)).toBe(true);
  });

  it('blocks personalKey on token-only workflow commands before issuing HTTP requests', async () => {
    const dir = await makeDir();
    const fetchFn = vi.fn();
    const res = await exec({
      args: ['workflow', 'pull', APP_ID],
      cwd: dir,
      auth: ['--base-url', 'http://127.0.0.1:3000', '--api-key', 'fastgpt-personal-123'],
      fetchFn
    });

    expect(res.exitCode).toBe(3);
    expect(fetchFn).not.toHaveBeenCalled();
    const err = JSON.parse(res.stderr);
    expect(err.ok).toBe(false);
    expect(err.error.code).toBe('AUTH_MODE_UNSUPPORTED');
  });

  it('runs local workflow commands without touching config/auth and enforces exit code 2 on invalid graph ops', async () => {
    const dir = await makeDir();
    const initRes = await exec({
      args: ['workflow', 'init', '--name', 'CLI Flow'],
      cwd: dir
    });
    expect(initRes.exitCode).toBe(0);
    const initEnvelope = JSON.parse(initRes.stdout);
    expect(initEnvelope.schemaVersion).toBe('fastgpt-cli-result/v1');
    expect(initEnvelope.command).toBe('workflow init');
    expect(initEnvelope.changed).toBe(true);

    const addNodeRes = await exec({
      args: [
        'workflow',
        'node',
        'add',
        '--node',
        'chat1',
        '--template',
        'builtin:ai-chat',
        '--after',
        'start@next'
      ],
      cwd: dir
    });
    expect(addNodeRes.exitCode).toBe(0);

    // 重复添加同一 nodeId 应映射为退出码 2 (CLI_ARGUMENT_INVALID) 并携带 diagnostics
    const dupRes = await exec({
      args: ['workflow', 'node', 'add', '--node', 'chat1', '--template', 'builtin:ai-chat'],
      cwd: dir
    });
    expect(dupRes.exitCode).toBe(2);
    const dupErr = JSON.parse(dupRes.stderr);
    expect(dupErr.error.code).toBe('CLI_ARGUMENT_INVALID');
    expect(Array.isArray(dupErr.error.details.diagnostics)).toBe(true);

    const validateRes = await exec({
      args: ['workflow', 'validate'],
      cwd: dir
    });
    expect(validateRes.exitCode).toBe(0);
    expect(JSON.parse(validateRes.stdout).data.valid).toBe(true);
  });

  it('supports workflow test --dry-run and JSON test cases end-to-end', async () => {
    const dir = await makeDir();
    await exec({ args: ['workflow', 'init', '--name', 'Test Flow'], cwd: dir });
    await exec({
      args: [
        'workflow',
        'node',
        'add',
        '--node',
        'chat1',
        '--template',
        'builtin:ai-chat',
        '--after',
        'start@next'
      ],
      cwd: dir
    });
    const casesPath = join(dir, 'cases.json');
    await writeFile(
      casesPath,
      JSON.stringify([
        {
          name: 'basic-ok',
          query: 'hello',
          expect: { answerContains: ['Pong'], nodeExecuted: ['start'] }
        }
      ])
    );

    const dryRunRes = await exec({
      args: ['workflow', 'test', APP_ID, '--cases', casesPath, '--dry-run'],
      cwd: dir,
      auth: ['--base-url', 'http://127.0.0.1:3000/api', '--token', 'tok-123']
    });
    expect(dryRunRes.exitCode).toBe(0);
    expect(JSON.parse(dryRunRes.stdout).data.dryRun).toBe(true);

    const fetchFn: CliFetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              memoryEdges: [],
              memoryNodes: [],
              entryNodeIds: ['start'],
              nodeResponses: {
                start: { nodeId: 'start', type: 'run', response: { textOutput: 'Pong' } }
              },
              newVariables: {},
              usageId: 'usage_ok'
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );

    const testRes = await exec({
      args: ['workflow', 'test', APP_ID, '--cases', casesPath],
      cwd: dir,
      auth: ['--base-url', 'http://127.0.0.1:3000/api', '--token', 'tok-123'],
      fetchFn
    });
    expect(testRes.exitCode).toBe(0);
    const parsed = JSON.parse(testRes.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.passed).toBe(1);
  });

  it('redacts secrets in workflow changeset plan stdout while writing unredacted plan to --output', async () => {
    const dir = await makeDir();
    const initRes = await exec({
      args: ['workflow', 'init', '--name', 'Secret Plan Flow'],
      cwd: dir
    });
    expect(initRes.exitCode).toBe(0);

    const inspectRes = await exec({
      args: ['workflow', 'inspect'],
      cwd: dir
    });
    expect(inspectRes.exitCode).toBe(0);
    const baseChecksum = JSON.parse(inspectRes.stdout).data.checksum as string;

    const changeSetPath = join(dir, 'changeset.json');
    const planPath = join(dir, 'workflow-plan.json');
    const secretIntro = 'Header Authorization: Bearer super-secret-plan-token';
    await writeFile(
      changeSetPath,
      JSON.stringify({
        schemaVersion: 'fastgpt-workflow-changeset/v1',
        baseChecksum,
        commands: [{ type: 'meta.update', intro: secretIntro }]
      })
    );

    const planRes = await exec({
      args: ['workflow', 'changeset', 'plan', '--input', changeSetPath, '--output', planPath],
      cwd: dir
    });
    expect(planRes.exitCode).toBe(0);
    expect(planRes.stdout).not.toContain('super-secret-plan-token');
    const envelope = JSON.parse(planRes.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('workflow changeset plan');
    expect(envelope.data.changeSet.commands[0].intro).toBe(
      'Header Authorization: Bearer [REDACTED]'
    );

    const writtenPlan = JSON.parse(await readFile(planPath, 'utf8'));
    expect(writtenPlan.changeSet.commands[0].intro).toBe(secretIntro);
  });

  it('executes graph, io-tools, and meta-config CLI commands and enforces option validation', async () => {
    const dir = await makeDir();
    expect(
      (await exec({ args: ['workflow', 'init', '--name', 'Full CLI Flow'], cwd: dir })).exitCode
    ).toBe(0);

    // meta & config & variable
    expect(
      (
        await exec({
          args: ['workflow', 'meta', 'set', '--name', 'Updated Flow', '--intro', 'Desc'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const metaShow = await exec({ args: ['workflow', 'meta', 'show'], cwd: dir });
    expect(metaShow.exitCode).toBe(0);
    expect(JSON.parse(metaShow.stdout).data.name).toBe('Updated Flow');

    expect(
      (
        await exec({
          args: ['workflow', 'config', 'set', '--path', 'welcomeText', '--value', 'Welcome!'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const cfgGet = await exec({
      args: ['workflow', 'config', 'get', '--path', 'welcomeText'],
      cwd: dir
    });
    expect(cfgGet.exitCode).toBe(0);
    expect(JSON.parse(cfgGet.stdout).data.value).toBe('Welcome!');

    expect(
      (
        await exec({
          args: [
            'workflow',
            'variable',
            'add',
            '--key',
            'region',
            '--value-type',
            'string',
            '--required'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'variable',
            'update',
            '--key',
            'region',
            '--optional',
            '--label',
            'Region'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (await exec({ args: ['workflow', 'variable', 'remove', '--key', 'region'], cwd: dir }))
        .exitCode
    ).toBe(0);

    // template & graph (node/edge)
    const tplList = await exec({
      args: ['workflow', 'template', 'list', '--kind', 'builtin'],
      cwd: dir
    });
    expect(tplList.exitCode).toBe(0);
    expect(JSON.parse(tplList.stdout).data.total).toBeGreaterThan(0);

    const tplShow = await exec({
      args: ['workflow', 'template', 'show', '--template', 'builtin:ai-chat'],
      cwd: dir
    });
    expect(tplShow.exitCode).toBe(0);

    expect(
      (
        await exec({
          args: [
            'workflow',
            'node',
            'add',
            '--node',
            'chat1',
            '--template',
            'builtin:ai-chat',
            '--after',
            'start@next'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'node',
            'update',
            '--node',
            'chat1',
            '--name',
            'Main Chat',
            '--catch-error'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: ['workflow', 'node', 'move', '--node', 'chat1', '--position', '420,120'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'node',
            'clone',
            '--node',
            'chat1',
            '--id',
            'chat2',
            '--offset',
            '0,220'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const cloneConflict = await exec({
      args: [
        'workflow',
        'node',
        'clone',
        '--node',
        'chat1',
        '--id',
        'chat3',
        '--position',
        '0,0',
        '--offset',
        '10,10'
      ],
      cwd: dir
    });
    expect(cloneConflict.exitCode).toBe(2);

    expect(
      (
        await exec({
          args: ['workflow', 'edge', 'connect', '--from', 'start@next', '--to', 'chat2@target'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: ['workflow', 'edge', 'disconnect', '--from', 'start@next', '--to', 'chat2@target'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'edge',
            'reconnect',
            '--from',
            'start@next',
            '--old-to',
            'chat1@target',
            '--to',
            'chat2@target'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'edge',
            'reconnect',
            '--from',
            'start@next',
            '--old-to',
            'chat2@target',
            '--to',
            'chat1@target'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'node',
            'insert',
            '--from',
            'start@next',
            '--to',
            'chat1@target',
            '--template',
            'builtin:code',
            '--id',
            'code1'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (await exec({ args: ['workflow', 'node', 'remove', '--node', 'chat2'], cwd: dir })).exitCode
    ).toBe(0);

    // io-tools (input / output / tool)
    expect(
      (
        await exec({
          args: [
            'workflow',
            'input',
            'set',
            '--node',
            'chat1',
            '--key',
            'temperature',
            '--value-json',
            '0.5'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'input',
            'ref',
            '--node',
            'chat1',
            '--key',
            'userChatInput',
            '--from',
            'start.userChatInput'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: ['workflow', 'input', 'unset', '--node', 'chat1', '--key', 'temperature'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'output',
            'add',
            '--node',
            'code1',
            '--key',
            'customOut',
            '--value-type',
            'string'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: ['workflow', 'output', 'remove', '--node', 'code1', '--key', 'customOut'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: ['workflow', 'node', 'add', '--node', 'agent1', '--template', 'builtin:tool-call'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow',
            'tool',
            'attach',
            '--tool-call',
            'agent1',
            '--template',
            'builtin:dataset-search',
            '--id',
            'kb1'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const toolList = await exec({
      args: ['workflow', 'tool', 'list', '--tool-call', 'agent1'],
      cwd: dir
    });
    expect(toolList.exitCode).toBe(0);
    expect(JSON.parse(toolList.stdout).data.length).toBe(1);
    expect(
      (
        await exec({
          args: ['workflow', 'tool', 'detach', '--tool-call', 'agent1', '--tool-node', 'kb1'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
  });
});

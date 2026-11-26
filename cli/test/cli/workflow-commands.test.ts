import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowTemplateBasicTypeSchema } from '@fastgpt/global/core/workflow/type';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import {
  UserSelectNode,
  USER_SELECT_REFERENCE_HANDLE_KEY
} from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import commonLinearWorkflow from '../../../packages/workflow-core/test/fixtures/common-linear/workflow.json';
import { getCliCommandSpecs } from '../../src/cli/registry';
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
  it('registers workflow, App, plugin, and code sandbox commands under their public paths', () => {
    const specs = getCliCommandSpecs().filter(({ path: [domain] }) =>
      ['app', 'workflow', 'workflow-build', 'code-sandbox', 'plugin'].includes(domain)
    );
    const byPath = new Map(specs.map((spec) => [spec.path.join(' '), spec]));

    expect(byPath.get('workflow-build init')?.authModes).toEqual(['token', 'personalKey']);
    expect(byPath.get('workflow-build template load')?.authModes).toEqual(['token', 'personalKey']);
    expect(byPath.get('workflow-build changeset apply')?.authModes).toEqual(['none']);
    expect(byPath.get('app list')?.authModes).toEqual(['token', 'personalKey']);
    expect(byPath.get('plugin tool list')?.authModes).toEqual(['token', 'personalKey']);
    const remotePaths = specs
      .filter(({ authModes }) => authModes.includes('token'))
      .map(({ path }) => path.join(' '));
    expect(remotePaths.sort()).toEqual([
      'app list',
      'app publish',
      'app pull',
      'app run',
      'app save',
      'app test',
      'code-sandbox packages',
      'plugin tool list',
      'workflow debug',
      'workflow diff',
      'workflow-build init',
      'workflow-build template load'
    ]);
    for (const spec of specs) {
      expect(spec.examples?.length).toBeGreaterThan(0);
      for (const { args } of spec.examples ?? []) {
        expect(args.slice(0, spec.path.length)).toEqual(spec.path);
      }
    }
  });

  it('blocks personalKey on token-only App commands before issuing HTTP requests', async () => {
    const dir = await makeDir();
    const fetchFn = vi.fn();
    const res = await exec({
      args: ['app', 'pull', APP_ID],
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

  it('reads packaged skill references by ID without requiring a workspace or authentication', async () => {
    const cwd = await makeDir();
    const fetchFn = vi.fn();
    const overview = await exec({ args: ['workflow-build', 'skills'], cwd, fetchFn });
    expect(overview.exitCode).toBe(0);
    expect(JSON.parse(overview.stdout).data).toMatchObject({
      markdown: expect.stringContaining('name: fastgpt-workflow-build'),
      references: expect.arrayContaining(['changesets-and-plans', 'workflow-inspection'])
    });

    const args = ['workflow-build', 'skills'];
    const reference = await exec({ args: [...args, 'changesets-and-plans'], cwd, fetchFn });
    expect(reference.exitCode).toBe(0);
    expect(JSON.parse(reference.stdout).data).toEqual({
      id: 'changesets-and-plans',
      markdown: expect.stringContaining('# ChangeSets and WorkflowPlans')
    });

    for (const id of ['../SKILL.md', 'constructor', 'no-such-reference']) {
      const invalid = await exec({ args: [...args, id], cwd, fetchFn });
      expect(invalid.exitCode).toBe(2);
      expect(JSON.parse(invalid.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('runs local workflow commands without touching config/auth and enforces exit code 2 on invalid graph ops', async () => {
    const dir = await makeDir();
    const fetchFn = vi.fn();
    const initRes = await exec({
      args: ['workflow-build', 'init', '--offline', '--name', 'CLI Flow'],
      cwd: dir,
      fetchFn
    });
    expect(initRes.exitCode).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
    const offlineBundle = JSON.parse(await readFile(join(dir, 'template-bundle.json'), 'utf8'));
    expect(offlineBundle).toEqual(createWorkflowTemplateBundle({ locale: 'en' }));
    const initEnvelope = JSON.parse(initRes.stdout);
    expect(initEnvelope.schemaVersion).toBe('fastgpt-cli-result/v1');
    expect(initEnvelope.command).toBe('workflow-build init');
    expect(initEnvelope.changed).toBe(true);

    const addNodeRes = await exec({
      args: [
        'workflow-build',
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
      args: ['workflow-build', 'node', 'add', '--node', 'chat1', '--template', 'builtin:ai-chat'],
      cwd: dir
    });
    expect(dupRes.exitCode).toBe(2);
    const dupErr = JSON.parse(dupRes.stderr);
    expect(dupErr.error.code).toBe('CLI_ARGUMENT_INVALID');
    expect(Array.isArray(dupErr.error.details.diagnostics)).toBe(true);

    const validateRes = await exec({
      args: ['workflow-build', 'validate'],
      cwd: dir
    });
    expect(validateRes.exitCode).toBe(0);
    expect(JSON.parse(validateRes.stdout).data.valid).toBe(true);
  });

  it('encodes dynamic option defaults as output IDs and restores their keys on import', async () => {
    const cwd = await makeDir();
    const document = WorkflowDocumentSchema.parse(commonLinearWorkflow);
    const edge = document.executionEdges.find((item) => item.target.nodeId === 'answer')!;
    const references = (outputSelector: string) => [['code', outputSelector]];
    const forms = (outputSelector: string) => {
      const choice = {
        key: 'choice',
        label: 'Choice',
        type: FlowNodeInputTypeEnum.multipleSelect,
        valueType: WorkflowIOValueTypeEnum.arrayString,
        required: false,
        defaultValue: ['code', 'result'],
        listInputType: FlowNodeInputTypeEnum.reference,
        listReference: references(outputSelector)
      };
      return [
        choice,
        {
          ...choice,
          key: 'manual',
          listInputType: FlowNodeInputTypeEnum.input,
          listReference: references('result')
        }
      ];
    };
    document.nodes.push(
      {
        nodeId: 'choices',
        name: 'Choices',
        flowNodeType: UserSelectNode.flowNodeType,
        inputs: UserSelectNode.inputs.map((input) =>
          input.key === NodeInputKeyEnum.userSelectOptions
            ? {
                ...input,
                selectedType: FlowNodeInputTypeEnum.reference,
                value: null,
                defaultValue: references('result')
              }
            : input
        ),
        outputs: UserSelectNode.outputs
      },
      {
        nodeId: 'form',
        name: 'Form',
        flowNodeType: FormInputNode.flowNodeType,
        inputs: FormInputNode.inputs.map((input) =>
          input.key === NodeInputKeyEnum.userInputForms
            ? {
                ...input,
                value: null,
                defaultValue: forms('result')
              }
            : input
        ),
        outputs: [
          ...FormInputNode.outputs,
          ...forms('result').map(({ key, valueType }) => ({
            id: key,
            key,
            valueType,
            type: FlowNodeOutputTypeEnum.static
          }))
        ]
      }
    );
    const answer = edge.target;
    edge.target = { kind: 'target', nodeId: 'choices' };
    document.executionEdges.push(
      {
        source: { kind: 'branch', nodeId: 'choices', branchKey: USER_SELECT_REFERENCE_HANDLE_KEY },
        target: { kind: 'target', nodeId: 'form' }
      },
      { source: { kind: 'next', nodeId: 'form' }, target: answer }
    );
    await writeFile(join(cwd, 'workflow.json'), JSON.stringify(document));

    const expectOutputSelector = (nodes: StoreNodeItemType[], selector: string) => {
      expect(
        nodes
          .find((node) => node.nodeId === 'choices')
          ?.inputs.find((input) => input.key === NodeInputKeyEnum.userSelectOptions)
      ).toMatchObject({
        selectedType: FlowNodeInputTypeEnum.reference,
        value: null,
        defaultValue: references(selector)
      });
      expect(
        nodes
          .find((node) => node.nodeId === 'form')
          ?.inputs.find((input) => input.key === NodeInputKeyEnum.userInputForms)
      ).toMatchObject({
        value: null,
        defaultValue: forms(selector)
      });
    };
    const output = join(cwd, 'store.json');
    for (const args of [['validate'], ['build', '--output', output]]) {
      expect(await exec({ args: ['workflow-build', ...args], cwd })).toMatchObject({
        exitCode: 0,
        stderr: ''
      });
    }
    const store = WorkflowTemplateBasicTypeSchema.parse(JSON.parse(await readFile(output, 'utf8')));
    expectOutputSelector(store.nodes, 'qLUQfhG0ILRX');

    const importedDir = await makeDir();
    expect(
      await exec({ args: ['workflow-build', 'import', '--input', output], cwd: importedDir })
    ).toMatchObject({
      exitCode: 0,
      stderr: ''
    });
    const imported = WorkflowDocumentSchema.parse(
      JSON.parse(await readFile(join(importedDir, 'workflow.json'), 'utf8'))
    );
    expectOutputSelector(imported.nodes, 'result');
  });

  it('initializes and reloads the workspace bundle with one authenticated request per command', async () => {
    const dir = await makeDir();
    const project = join(dir, 'flow');
    const bundle = createWorkflowTemplateBundle({ locale: 'en' });
    const template = bundle.items.find(
      ({ ref }) => ref.kind === 'builtin' && ref.templateId === 'ai-chat'
    )!.template;
    template.name = 'Remote Chat';
    const auth = ['--base-url', 'http://127.0.0.1:3000', '--token', 'session-token'];
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.method).toBe('GET');
      expect(request.url).toBe(
        'http://127.0.0.1:3000/api/core/workflow/getTemplateBundle?locale=en'
      );
      expect(request.headers.get('token')).toBe('session-token');
      return Response.json({ code: 200, data: bundle });
    });
    const initialized = await exec({
      args: ['workflow-build', 'init', '--dir', 'flow'],
      cwd: dir,
      auth,
      fetchFn
    });
    expect(initialized.exitCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(join(project, 'template-bundle.json'), 'utf8'))).toEqual(
      bundle
    );
    const before = await readFile(join(project, 'workflow.json'), 'utf8');
    const beforeBundle = await readFile(join(project, 'template-bundle.json'), 'utf8');

    template.name = 'Refreshed Chat';
    const preview = await exec({
      args: ['workflow-build', 'template', 'load', '--dir', 'flow', '--dry-run'],
      cwd: dir,
      auth,
      fetchFn
    });
    expect(preview.exitCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await readFile(join(project, 'template-bundle.json'), 'utf8')).toBe(beforeBundle);

    const refreshed = await exec({
      args: ['workflow-build', 'template', 'load', '--dir', 'flow'],
      cwd: dir,
      auth,
      fetchFn
    });
    expect(refreshed.exitCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await readFile(join(project, 'workflow.json'), 'utf8')).toBe(before);
    const shown = await exec({
      args: [
        'workflow-build',
        'template',
        'show',
        '--dir',
        'flow',
        '--template',
        'builtin:ai-chat'
      ],
      cwd: dir
    });
    expect(JSON.parse(shown.stdout).data.name).toBe('Refreshed Chat');
  });

  it('requires auth by default and preserves files when template retrieval fails', async () => {
    const dir = await makeDir();
    const noAuth = await exec({ args: ['workflow-build', 'init'], cwd: dir });
    expect(noAuth.exitCode).toBe(3);
    const auth = ['--base-url', 'http://127.0.0.1:3000', '--token', 'session-token'];
    const fetchFn = vi.fn<CliFetchFn>(async () => Response.json({ code: 200, data: {} }));
    const failed = await exec({ args: ['workflow-build', 'init'], cwd: dir, auth, fetchFn });
    expect(failed.exitCode).not.toBe(0);
    await expect(readFile(join(dir, 'workflow.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
    await expect(readFile(join(dir, 'template-bundle.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });

    await exec({ args: ['workflow-build', 'init', '--offline'], cwd: dir });
    const bundlePath = join(dir, 'template-bundle.json');
    const before = await readFile(bundlePath, 'utf8');
    const refresh = await exec({
      args: ['workflow-build', 'template', 'load'],
      cwd: dir,
      auth,
      fetchFn
    });
    expect(refresh.exitCode).not.toBe(0);
    expect(await readFile(bundlePath, 'utf8')).toBe(before);
  });

  it('rolls back initialization if workflow.json cannot be created', async () => {
    const dir = await makeDir();
    const fetchFn = vi.fn<CliFetchFn>(async () => {
      // 模拟另一个进程在模板下载期间占用了工作流文件。
      await writeFile(join(dir, 'workflow.json'), 'preserve this document', { flag: 'wx' });
      return Response.json({ code: 200, data: createWorkflowTemplateBundle({ locale: 'en' }) });
    });
    const result = await exec({
      args: ['workflow-build', 'init'],
      cwd: dir,
      auth: ['--base-url', 'http://127.0.0.1:3000', '--token', 'session-token'],
      fetchFn
    });
    expect(result.exitCode).toBe(2);
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe('preserve this document');
    await expect(readFile(join(dir, 'template-bundle.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('supports app test --dry-run and JSON test cases end-to-end', async () => {
    const dir = await makeDir();
    await exec({ args: ['workflow-build', 'init', '--offline', '--name', 'Test Flow'], cwd: dir });
    await exec({
      args: [
        'workflow-build',
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
      args: ['app', 'test', APP_ID, '--cases', casesPath, '--dry-run'],
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
      args: ['app', 'test', APP_ID, '--cases', casesPath],
      cwd: dir,
      auth: ['--base-url', 'http://127.0.0.1:3000/api', '--token', 'tok-123'],
      fetchFn
    });
    expect(testRes.exitCode).toBe(0);
    const parsed = JSON.parse(testRes.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.passed).toBe(1);
  });

  it('redacts secrets in workflow-build changeset plan stdout while writing unredacted plan to --output', async () => {
    const dir = await makeDir();
    const initRes = await exec({
      args: ['workflow-build', 'init', '--offline', '--name', 'Secret Plan Flow'],
      cwd: dir
    });
    expect(initRes.exitCode).toBe(0);

    const inspectRes = await exec({
      args: ['workflow-build', 'inspect'],
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
      args: ['workflow-build', 'changeset', 'plan', '--input', changeSetPath, '--output', planPath],
      cwd: dir
    });
    expect(planRes.exitCode).toBe(0);
    expect(planRes.stdout).not.toContain('super-secret-plan-token');
    const envelope = JSON.parse(planRes.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('workflow-build changeset plan');
    expect(envelope.data.changeSet.commands[0].intro).toBe(
      'Header Authorization: Bearer [REDACTED]'
    );

    const writtenPlan = JSON.parse(await readFile(planPath, 'utf8'));
    expect(writtenPlan.changeSet.commands[0].intro).toBe(secretIntro);
  });

  it('executes graph, io-tools, and meta-config CLI commands and enforces option validation', async () => {
    const dir = await makeDir();
    expect(
      (
        await exec({
          args: ['workflow-build', 'init', '--offline', '--name', 'Full CLI Flow'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);

    // meta & config & variable
    expect(
      (
        await exec({
          args: ['workflow-build', 'meta', 'set', '--name', 'Updated Flow', '--intro', 'Desc'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const metaShow = await exec({ args: ['workflow-build', 'meta', 'show'], cwd: dir });
    expect(metaShow.exitCode).toBe(0);
    expect(JSON.parse(metaShow.stdout).data.name).toBe('Updated Flow');

    expect(
      (
        await exec({
          args: ['workflow-build', 'config', 'set', '--path', 'welcomeText', '--value', 'Welcome!'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    const cfgGet = await exec({
      args: ['workflow-build', 'config', 'get', '--path', 'welcomeText'],
      cwd: dir
    });
    expect(cfgGet.exitCode).toBe(0);
    expect(JSON.parse(cfgGet.stdout).data.value).toBe('Welcome!');

    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
            'workflow-build',
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
      (await exec({ args: ['workflow-build', 'variable', 'remove', '--key', 'region'], cwd: dir }))
        .exitCode
    ).toBe(0);

    // template & graph (node/edge)
    const tplList = await exec({
      args: ['workflow-build', 'template', 'list', '--kind', 'builtin'],
      cwd: dir
    });
    expect(tplList.exitCode).toBe(0);
    expect(JSON.parse(tplList.stdout).data.total).toBeGreaterThan(0);

    const tplShow = await exec({
      args: ['workflow-build', 'template', 'show', '--template', 'builtin:ai-chat'],
      cwd: dir
    });
    expect(tplShow.exitCode).toBe(0);

    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
            'workflow-build',
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
          args: ['workflow-build', 'node', 'move', '--node', 'chat1', '--position', '420,120'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
        'workflow-build',
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
          args: [
            'workflow-build',
            'edge',
            'connect',
            '--from',
            'start@next',
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
            'workflow-build',
            'edge',
            'disconnect',
            '--from',
            'start@next',
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
            'workflow-build',
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
            'workflow-build',
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
            'workflow-build',
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
      (await exec({ args: ['workflow-build', 'node', 'remove', '--node', 'chat2'], cwd: dir }))
        .exitCode
    ).toBe(0);

    // io-tools (input / output / tool)
    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
            'workflow-build',
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
          args: ['workflow-build', 'input', 'unset', '--node', 'chat1', '--key', 'temperature'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
          args: ['workflow-build', 'output', 'remove', '--node', 'code1', '--key', 'customOut'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow-build',
            'node',
            'add',
            '--node',
            'agent1',
            '--template',
            'builtin:tool-call'
          ],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
    expect(
      (
        await exec({
          args: [
            'workflow-build',
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
      args: ['workflow-build', 'tool', 'list', '--tool-call', 'agent1'],
      cwd: dir
    });
    expect(toolList.exitCode).toBe(0);
    expect(JSON.parse(toolList.stdout).data.length).toBe(1);
    expect(
      (
        await exec({
          args: ['workflow-build', 'tool', 'detach', '--tool-call', 'agent1', '--tool-node', 'kb1'],
          cwd: dir
        })
      ).exitCode
    ).toBe(0);
  });

  it('handles --no-catch-error standalone and alongside --name via Commander', async () => {
    const dir = await makeDir();
    await exec({ args: ['workflow-build', 'init', '--offline', '--name', 'Catch Flow'], cwd: dir });
    await exec({
      args: [
        'workflow-build',
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

    const enableRes = await exec({
      args: ['workflow-build', 'node', 'update', '--node', 'chat1', '--catch-error'],
      cwd: dir
    });
    expect(enableRes.exitCode).toBe(0);

    // 仅传 --no-catch-error 必须生效且退出码为 0
    const disableAloneRes = await exec({
      args: ['workflow-build', 'node', 'update', '--node', 'chat1', '--no-catch-error'],
      cwd: dir
    });
    expect(disableAloneRes.exitCode).toBe(0);
    const showAfterDisable = await exec({
      args: ['workflow-build', 'node', 'show', '--node', 'chat1'],
      cwd: dir
    });
    expect(JSON.parse(showAfterDisable.stdout).data.node.catchError).toBe(false);

    // 再次开启后同时传 --name 和 --no-catch-error
    await exec({
      args: ['workflow-build', 'node', 'update', '--node', 'chat1', '--catch-error'],
      cwd: dir
    });
    const disableWithNameRes = await exec({
      args: [
        'workflow-build',
        'node',
        'update',
        '--node',
        'chat1',
        '--name',
        'Renamed Chat',
        '--no-catch-error'
      ],
      cwd: dir
    });
    expect(disableWithNameRes.exitCode).toBe(0);
    const showAfterCombo = await exec({
      args: ['workflow-build', 'node', 'show', '--node', 'chat1'],
      cwd: dir
    });
    const nodeData = JSON.parse(showAfterCombo.stdout).data as {
      node: {
        name: string;
        catchError: boolean;
      };
    };
    expect(nodeData.node.name).toBe('Renamed Chat');
    expect(nodeData.node.catchError).toBe(false);
  });

  it('supports --dry-run on workflow-build build and marks workflow-build changeset plan as write with --dry-run', async () => {
    const dir = await makeDir();
    await exec({
      args: ['workflow-build', 'init', '--offline', '--name', 'Artifact Flow'],
      cwd: dir
    });
    await exec({
      args: [
        'workflow-build',
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

    const buildDryPath = join(dir, 'dry-store.json');
    const buildDryRes = await exec({
      args: ['workflow-build', 'build', '--output', buildDryPath, '--dry-run'],
      cwd: dir
    });
    expect(buildDryRes.exitCode).toBe(0);
    expect(JSON.parse(buildDryRes.stdout).data).toMatchObject({
      dryRun: true,
      operation: 'workflow-build build',
      risk: 'write'
    });
    await expect(readFile(buildDryPath, 'utf8')).rejects.toThrow();

    const changeSetPath = join(dir, 'changeset.json');
    const planDryPath = join(dir, 'dry-plan.json');
    const inspectRes = await exec({ args: ['workflow-build', 'inspect'], cwd: dir });
    expect(inspectRes.exitCode).toBe(0);
    const baseChecksum = (JSON.parse(inspectRes.stdout).data as { checksum: string }).checksum;
    await writeFile(
      changeSetPath,
      JSON.stringify({
        schemaVersion: 'fastgpt-workflow-changeset/v1',
        baseChecksum,
        commands: [{ type: 'meta.update', intro: 'Dry plan intro' }]
      })
    );
    const planDryRes = await exec({
      args: [
        'workflow-build',
        'changeset',
        'plan',
        '--input',
        changeSetPath,
        '--output',
        planDryPath,
        '--dry-run'
      ],
      cwd: dir
    });
    expect(planDryRes.exitCode).toBe(0);
    expect(JSON.parse(planDryRes.stdout).data).toMatchObject({
      dryRun: true,
      operation: 'workflow-build changeset plan',
      risk: 'write'
    });
    await expect(readFile(planDryPath, 'utf8')).rejects.toThrow();

    const writeSpecs = getCliCommandSpecs()
      .filter((spec) => spec.path[0] === 'workflow-build' && spec.risk === 'write')
      .map((spec) => spec.path.join(' '));
    expect(writeSpecs).toContain('workflow-build changeset plan');
    expect(writeSpecs).toContain('workflow-build build');
  });
});

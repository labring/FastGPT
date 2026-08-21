import { runCli } from '../src';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const createHarness = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'workflow-cli-'));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const invoke = async (
    argv: string[],
    env: NodeJS.ProcessEnv = { NODE_ENV: 'test' },
    stdinValue = ''
  ) => {
    stdout.length = 0;
    stderr.length = 0;
    const exitCode = await runCli({
      argv,
      cwd,
      env,
      stdin: async () => stdinValue,
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value)
    });
    return { exitCode, stdout: [...stdout], stderr: [...stderr] };
  };
  return { cwd, invoke };
};

const jsonArgs = (dir: string, args: string[]) => [...args, '--dir', dir, '--format', 'json'];

describe('PR1 through PR4 CLI end to end', () => {
  it('builds basic-ai with pure JSON stdout and deterministic output', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'basic-ai');
    expect((await invoke(jsonArgs(dir, ['init', '--name', 'Demo workflow']))).exitCode).toBe(0);
    const initializedDocument = JSON.parse(await readFile(join(dir, 'workflow.json'), 'utf8'));
    expect(initializedDocument.nodes).toHaveLength(2);
    expect(initializedDocument.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'userGuide', flowNodeType: 'userGuide' }),
        expect.objectContaining({ nodeId: 'start', flowNodeType: 'workflowStart' })
      ])
    );
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'node',
            'add',
            '--node',
            'ai',
            '--template',
            'builtin:ai-chat',
            '--name',
            'Answer user',
            '--after',
            'start@next'
          ])
        )
      ).exitCode
    ).toBe(0);
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'systemPrompt',
        '--value',
        'Be concise'
      ])
    );
    const inputShow = await invoke(
      jsonArgs(dir, ['input', 'show', '--node', 'ai', '--key', 'systemPrompt'])
    );
    expect(JSON.parse(inputShow.stdout[0]).result.value).toBe('Be concise');
    await invoke(jsonArgs(dir, ['input', 'unset', '--node', 'ai', '--key', 'systemPrompt']));
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'systemPrompt',
        '--value',
        'Be concise'
      ])
    );
    const validation = await invoke(jsonArgs(dir, ['validate']));
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.stdout[0])).toMatchObject({
      schemaVersion: 'fastgpt-workflow-cli-result/v1',
      ok: true,
      changed: false,
      result: { valid: true }
    });

    const output = join(dir, 'workflow.generated.json');
    await invoke(jsonArgs(dir, ['build', '--output', output]));
    const firstBuild = await readFile(output, 'utf8');
    await invoke(jsonArgs(dir, ['build', '--output', output]));
    expect(await readFile(output, 'utf8')).toBe(firstBuild);
    expect(JSON.parse(firstBuild).edges[0]).toEqual({
      source: 'start',
      sourceHandle: 'start-source-right',
      target: 'ai',
      targetHandle: 'ai-target-left'
    });

    const templateList = await invoke(jsonArgs(dir, ['template', 'list', '--kind', 'builtin']));
    expect(JSON.parse(templateList.stdout[0]).result).toMatchObject({
      total: 22,
      counts: { builtin: 22, teamApp: 0, systemTool: 0, tool: 0 }
    });
    const nodeList = await invoke(jsonArgs(dir, ['node', 'list', '--type', 'chatNode']));
    expect(JSON.parse(nodeList.stdout[0]).result).toHaveLength(1);
    const nodeShow = await invoke(jsonArgs(dir, ['node', 'show', '--node', 'ai']));
    const nodeShowResult = JSON.parse(nodeShow.stdout[0]).result;
    expect(nodeShowResult.node.name).toBe('Answer user');
    expect(nodeShowResult.descriptor.template).toEqual({
      kind: 'builtin',
      templateId: 'ai-chat'
    });
    expect(JSON.parse(await readFile(join(dir, 'workflow.json'), 'utf8')).app.name).toBe(
      'Demo workflow'
    );
  });

  it('builds basic-static with literal and reference inputs', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'basic-static');
    await invoke(jsonArgs(dir, ['init']));
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'text',
        '--template',
        'builtin:text-editor',
        '--after',
        'start@next'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'text',
        '--key',
        'system_textareaInput',
        '--value',
        'Static response'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'answer',
        '--template',
        'builtin:assigned-answer',
        '--after',
        'text@next'
      ])
    );
    const refResult = await invoke(
      jsonArgs(dir, [
        'input',
        'ref',
        '--node',
        'answer',
        '--key',
        'text',
        '--from',
        'text.system_text'
      ])
    );
    expect(refResult.exitCode).toBe(0);
    expect((await invoke(jsonArgs(dir, ['validate']))).exitCode).toBe(0);
  });

  it('builds output key references as Store output ids and imports them back as keys', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'code-reference');
    await invoke(jsonArgs(dir, ['init']));
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'code',
        '--template',
        'builtin:code',
        '--after',
        'start@next'
      ])
    );
    for (const inputKey of ['data1', 'data2']) {
      expect(
        (
          await invoke(
            jsonArgs(dir, [
              'input',
              'ref',
              '--node',
              'code',
              '--key',
              inputKey,
              '--from',
              'start.userChatInput'
            ])
          )
        ).exitCode
      ).toBe(0);
    }
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'answer',
        '--template',
        'builtin:assigned-answer',
        '--after',
        'code@next'
      ])
    );
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'input',
            'ref',
            '--node',
            'answer',
            '--key',
            'text',
            '--from',
            'code.result'
          ])
        )
      ).exitCode
    ).toBe(0);

    const document = JSON.parse(await readFile(join(dir, 'workflow.json'), 'utf8'));
    expect(
      document.nodes
        .find((node: { nodeId: string }) => node.nodeId === 'answer')
        .inputs.find((input: { key: string }) => input.key === 'text').value
    ).toEqual(['code', 'result']);

    const output = join(cwd, 'code-reference-store.json');
    expect((await invoke(jsonArgs(dir, ['build', '--output', output]))).exitCode).toBe(0);
    const store = JSON.parse(await readFile(output, 'utf8'));
    expect(
      store.nodes
        .find((node: { nodeId: string }) => node.nodeId === 'answer')
        .inputs.find((input: { key: string }) => input.key === 'text').value
    ).toEqual(['code', 'qLUQfhG0ILRX']);

    const importedDir = join(cwd, 'code-reference-imported');
    expect((await invoke(jsonArgs(importedDir, ['import', '--input', output]))).exitCode).toBe(0);
    const importedDocument = JSON.parse(await readFile(join(importedDir, 'workflow.json'), 'utf8'));
    expect(
      importedDocument.nodes
        .find((node: { nodeId: string }) => node.nodeId === 'answer')
        .inputs.find((input: { key: string }) => input.key === 'text').value
    ).toEqual(['code', 'result']);
  });

  it('builds workflows with unresolved resources and reports their bindings', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'resource-bindings');
    await invoke(jsonArgs(dir, ['init']));
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'search',
        '--template',
        'builtin:dataset-search',
        '--after',
        'start@next'
      ])
    );

    const validation = await invoke(jsonArgs(dir, ['validate']));
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.stdout[0])).toMatchObject({
      ok: true,
      result: {
        valid: true,
        executable: false,
        bindings: [
          {
            nodeId: 'search',
            inputKey: 'datasets',
            resourceKind: 'dataset',
            status: 'missing'
          }
        ]
      },
      warnings: [
        {
          code: 'WORKFLOW_BINDING_REQUIRED',
          nodeId: 'search',
          inputKey: 'datasets'
        }
      ]
    });

    const output = join(dir, 'workflow.generated.json');
    const build = await invoke(jsonArgs(dir, ['build', '--output', output]));
    expect(build.exitCode).toBe(0);
    expect(JSON.parse(build.stdout[0]).warnings).toMatchObject([
      { code: 'WORKFLOW_BINDING_REQUIRED', nodeId: 'search', inputKey: 'datasets' }
    ]);
    const workflow = JSON.parse(await readFile(output, 'utf8'));
    expect(
      workflow.nodes
        .find((node: { nodeId: string }) => node.nodeId === 'search')
        .inputs.find((input: { key: string }) => input.key === 'datasets').value
    ).toEqual([]);
    expect(JSON.stringify(workflow)).not.toContain('demo-dataset');
  });

  it('keeps mutations and template queries write-free in dry-run/query mode', async () => {
    const { cwd, invoke } = await createHarness();
    const dryDir = join(cwd, 'dry');
    expect((await invoke(jsonArgs(dryDir, ['init', '--dry-run']))).exitCode).toBe(0);
    await expect(access(join(dryDir, 'workflow.json'))).rejects.toThrow();

    const queryDir = join(cwd, 'query');
    const template = await invoke(
      jsonArgs(queryDir, ['template', 'show', '--template', 'builtin:ai-chat', '--locale', 'zh-CN'])
    );
    const descriptor = JSON.parse(template.stdout[0]).result;
    expect(descriptor.name).toBe('AI 对话');
    expect(descriptor.inputs.find((input: { key: string }) => input.key === 'model')).toMatchObject(
      {
        defaultPolicy: 'remoteValidated',
        resourceKind: 'model'
      }
    );
    expect(JSON.stringify(descriptor)).not.toContain('workflow:template.ai_chat');
    expect(JSON.stringify(descriptor)).not.toContain('workflow:cli.input');
    await expect(access(join(queryDir, 'workflow.json'))).rejects.toThrow();

    const persistedDir = join(cwd, 'persisted');
    await invoke(jsonArgs(persistedDir, ['init']));
    const before = await readFile(join(persistedDir, 'workflow.json'), 'utf8');
    await invoke(
      jsonArgs(persistedDir, [
        'node',
        'add',
        '--node',
        'ai',
        '--template',
        'builtin:ai-chat',
        '--after',
        'start@next',
        '--dry-run'
      ])
    );
    expect(await readFile(join(persistedDir, 'workflow.json'), 'utf8')).toBe(before);
  });

  it('configures dataset concat dynamic references and builds custom feedback', async () => {
    const { cwd, invoke } = await createHarness();
    const concatDir = join(cwd, 'dataset-concat');
    await invoke(jsonArgs(concatDir, ['init']));
    await invoke(
      jsonArgs(concatDir, [
        'node',
        'add',
        '--node',
        'search',
        '--template',
        'builtin:dataset-search',
        '--after',
        'start@next'
      ])
    );
    await invoke(
      jsonArgs(concatDir, [
        'node',
        'add',
        '--node',
        'concat',
        '--template',
        'builtin:dataset-concat',
        '--after',
        'search@next'
      ])
    );
    expect(
      (
        await invoke(
          jsonArgs(concatDir, [
            'input',
            'add',
            '--node',
            'concat',
            '--key',
            'quote_1',
            '--value-type',
            'datasetQuote',
            '--mode',
            'reference',
            '--required'
          ])
        )
      ).exitCode
    ).toBe(0);
    expect(
      (
        await invoke(
          jsonArgs(concatDir, [
            'input',
            'ref',
            '--node',
            'concat',
            '--key',
            'quote_1',
            '--from',
            'search.quoteQA'
          ])
        )
      ).exitCode
    ).toBe(0);
    const inputList = await invoke(jsonArgs(concatDir, ['input', 'list', '--node', 'concat']));
    expect(JSON.parse(inputList.stdout[0]).result).toContainEqual(
      expect.objectContaining({ key: 'quote_1', value: ['search', 'quoteQA'] })
    );
    expect(
      (
        await invoke(
          jsonArgs(concatDir, ['input', 'remove', '--node', 'concat', '--key', 'quote_1'])
        )
      ).exitCode
    ).toBe(0);

    const feedbackDir = join(cwd, 'custom-feedback');
    await invoke(jsonArgs(feedbackDir, ['init']));
    await invoke(
      jsonArgs(feedbackDir, [
        'node',
        'add',
        '--node',
        'feedback',
        '--template',
        'builtin:custom-feedback',
        '--after',
        'start@next'
      ])
    );
    await invoke(
      jsonArgs(feedbackDir, [
        'input',
        'set',
        '--node',
        'feedback',
        '--key',
        'system_textareaInput',
        '--value',
        'Accurate answer'
      ])
    );
    const output = join(feedbackDir, 'workflow.generated.json');
    expect((await invoke(jsonArgs(feedbackDir, ['build', '--output', output]))).exitCode).toBe(0);
    expect(JSON.parse(await readFile(output, 'utf8')).nodes).toContainEqual(
      expect.objectContaining({ flowNodeType: 'customFeedback' })
    );
  });

  it('parses scalar, JSON, file and environment values from one command contract', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'values');
    await invoke(jsonArgs(dir, ['init']));
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'ai',
        '--template',
        'builtin:ai-chat',
        '--after',
        'start@next'
      ])
    );
    const envResult = await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'maxToken',
        '--value-env',
        'MAX_TOKEN'
      ]),
      { NODE_ENV: 'test', MAX_TOKEN: '512' }
    );
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout[0]).not.toContain('512');
    await invoke(
      jsonArgs(dir, ['input', 'set', '--node', 'ai', '--key', 'temperature', '--value-json', '0.5'])
    );
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'isResponseAnswerText',
        '--value',
        'false'
      ])
    );
    const promptPath = join(cwd, 'prompt.txt');
    await writeFile(promptPath, 'Prompt from file', 'utf8');
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'systemPrompt',
        '--value-file',
        promptPath
      ])
    );
    await invoke(
      jsonArgs(dir, ['input', 'set', '--node', 'ai', '--key', 'systemPrompt', '--value-file', '-']),
      { NODE_ENV: 'test' },
      'Prompt from stdin'
    );
    const node = JSON.parse(
      (await invoke(jsonArgs(dir, ['node', 'show', '--node', 'ai']))).stdout[0]
    ).result.node;
    const values = Object.fromEntries(
      node.inputs.map((input: { key: string; value: unknown }) => [input.key, input.value])
    );
    expect(values).toMatchObject({
      maxToken: 512,
      temperature: 0.5,
      isResponseAnswerText: false,
      systemPrompt: 'Prompt from stdin'
    });
  });

  it('maps argument, command and validation failures and never writes partial state', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'failure');
    await invoke(jsonArgs(dir, ['init']));
    const before = await readFile(join(dir, 'workflow.json'), 'utf8');

    expect((await invoke(jsonArgs(dir, ['init']))).exitCode).toBe(2);
    expect((await invoke(jsonArgs(dir, ['node', 'show', '--node', 'missing']))).exitCode).toBe(2);
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'node',
            'add',
            '--node',
            'bad-position',
            '--template',
            'builtin:ai-chat',
            '--position',
            'invalid'
          ])
        )
      ).exitCode
    ).toBe(2);

    const argument = await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'start',
        '--key',
        'userChatInput',
        '--value-json',
        '{'
      ])
    );
    expect(argument.exitCode).toBe(2);

    const command = await invoke(
      jsonArgs(dir, ['node', 'add', '--node', 'broken', '--template', 'builtin:missing'])
    );
    expect(command.exitCode).toBe(3);
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(before);

    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'text',
        '--template',
        'builtin:text-editor',
        '--after',
        'start@next'
      ])
    );
    expect((await invoke(jsonArgs(dir, ['validate']))).exitCode).toBe(4);
  });

  it('renders global/command help, version and text output without executing handlers', async () => {
    const { invoke } = await createHarness();
    expect((await invoke(['--help'])).stdout[0]).toContain('Commands:');
    expect((await invoke(['--version'])).stdout).toEqual(['0.3.0-beta.1']);
    const commandHelp = await invoke(['node', 'show', '--help']);
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.stdout[0]).toContain('Usage: fastgpt-workflow node show');
  });

  it('honors JSON output for parser failures from flags or environment', async () => {
    const { invoke } = await createHarness();
    const flagFailure = await invoke(['unknown', '--format', 'json']);
    expect(flagFailure.exitCode).toBe(2);
    expect(JSON.parse(flagFailure.stderr[0])).toMatchObject({ ok: false, changed: false });

    const envFailure = await invoke(['unknown'], {
      NODE_ENV: 'test',
      FASTGPT_WORKFLOW_FORMAT: 'json'
    });
    expect(JSON.parse(envFailure.stderr[0])).toMatchObject({ ok: false, changed: false });
  });

  it('supports the complete PR2 linear workflow command surface and import round-trip', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'pr2-linear');
    await invoke(jsonArgs(dir, ['init', '--name', 'PR2 workflow']));
    await invoke(jsonArgs(dir, ['meta', 'set', '--intro', 'Linear workflow fixture']));
    await invoke(jsonArgs(dir, ['config', 'set', '--path', 'welcomeText', '--value', 'Welcome']));
    expect(
      JSON.parse((await invoke(jsonArgs(dir, ['meta', 'show']))).stdout[0]).result
    ).toMatchObject({
      name: 'PR2 workflow',
      intro: 'Linear workflow fixture'
    });
    expect(
      JSON.parse(
        (await invoke(jsonArgs(dir, ['config', 'get', '--path', 'welcomeText']))).stdout[0]
      ).result.value
    ).toBe('Welcome');
    expect(JSON.parse((await invoke(jsonArgs(dir, ['config', 'list']))).stdout[0]).result).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'welcomeText', value: 'Welcome' })])
    );
    await invoke(
      jsonArgs(dir, ['config', 'set', '--path', 'questionGuide', '--value-json', '{"open":true}'])
    );
    await invoke(jsonArgs(dir, ['config', 'unset', '--path', 'questionGuide']));
    await invoke(
      jsonArgs(dir, [
        'variable',
        'add',
        '--key',
        'tenantId',
        '--value-type',
        'string',
        '--description',
        'Tenant ID',
        '--required'
      ])
    );
    expect(
      JSON.parse((await invoke(jsonArgs(dir, ['variable', 'list']))).stdout[0]).result
    ).toHaveLength(1);
    await invoke(
      jsonArgs(dir, [
        'variable',
        'update',
        '--key',
        'tenantId',
        '--description',
        'Current tenant ID'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'text',
        '--template',
        'builtin:text-editor',
        '--after',
        'start@next'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'text',
        '--key',
        'system_textareaInput',
        '--value',
        'Hello'
      ])
    );
    await invoke(
      jsonArgs(dir, ['node', 'clone', '--node', 'text', '--id', 'text-copy', '--offset', '320,0'])
    );
    await invoke(
      jsonArgs(dir, ['edge', 'connect', '--from', 'text@next', '--to', 'text-copy@target'])
    );
    await invoke(
      jsonArgs(dir, ['node', 'add', '--node', 'answer', '--template', 'builtin:assigned-answer'])
    );
    await invoke(
      jsonArgs(dir, ['edge', 'connect', '--from', 'text-copy@next', '--to', 'answer@target'])
    );
    expect(
      JSON.parse((await invoke(jsonArgs(dir, ['edge', 'list']))).stdout[0]).result
    ).toHaveLength(3);
    await invoke(
      jsonArgs(dir, [
        'input',
        'ref',
        '--node',
        'answer',
        '--key',
        'text',
        '--from',
        'text-copy.system_text'
      ])
    );
    await invoke(jsonArgs(dir, ['node', 'update', '--node', 'answer', '--name', 'Final answer']));
    await invoke(jsonArgs(dir, ['node', 'move', '--node', 'text-copy', '--position', '900,300']));

    const available = await invoke(
      jsonArgs(dir, ['input', 'available', '--node', 'answer', '--key', 'text'])
    );
    expect(JSON.parse(available.stdout[0]).result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: { nodeId: 'text-copy', outputKey: 'system_text' },
          source: 'node'
        }),
        expect.objectContaining({
          ref: { nodeId: 'VARIABLE_NODE_ID', outputKey: 'tenantId' },
          source: 'variable'
        })
      ])
    );
    expect((await invoke(jsonArgs(dir, ['validate']))).exitCode).toBe(0);
    const inspect = await invoke(jsonArgs(dir, ['inspect']));
    expect(JSON.parse(inspect.stdout[0]).result.diagnostics.errorCount).toBe(0);

    await invoke(jsonArgs(dir, ['variable', 'remove', '--key', 'tenantId']));
    const output = join(cwd, 'pr2-store.json');
    expect((await invoke(jsonArgs(dir, ['build', '--output', output]))).exitCode).toBe(0);

    const importedDir = join(cwd, 'pr2-imported');
    expect((await invoke(jsonArgs(importedDir, ['import', '--input', output]))).exitCode).toBe(0);
    const importedOutput = join(cwd, 'pr2-imported-store.json');
    await invoke(jsonArgs(importedDir, ['build', '--output', importedOutput]));
    expect(JSON.parse(await readFile(importedOutput, 'utf8'))).toEqual(
      JSON.parse(await readFile(output, 'utf8'))
    );

    const invalidStore = JSON.parse(await readFile(output, 'utf8'));
    invalidStore.edges[0].sourceHandle = 'unknown-handle';
    const invalidStorePath = join(cwd, 'invalid-store.json');
    await writeFile(invalidStorePath, JSON.stringify(invalidStore), 'utf8');
    const invalidImportDir = join(cwd, 'invalid-import');
    expect(
      (await invoke(jsonArgs(invalidImportDir, ['import', '--input', invalidStorePath]))).exitCode
    ).toBe(3);
    await expect(access(join(invalidImportDir, 'workflow.json'))).rejects.toThrow();

    await invoke(
      jsonArgs(importedDir, [
        'edge',
        'reconnect',
        '--from',
        'text-copy@next',
        '--old-to',
        'answer@target',
        '--to',
        'text@target'
      ])
    );
    await invoke(
      jsonArgs(importedDir, [
        'edge',
        'disconnect',
        '--from',
        'text-copy@next',
        '--to',
        'text@target'
      ])
    );
    const remove = await invoke(jsonArgs(importedDir, ['node', 'remove', '--node', 'answer']));
    expect(JSON.parse(remove.stdout[0]).changes[0]).toMatchObject({
      type: 'node.remove',
      nodeId: 'answer'
    });
  });

  it('supports explicit variable input types and type-specific config', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'variable-types');
    await invoke(jsonArgs(dir, ['init']));

    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'variable',
            'add',
            '--key',
            'quizResults',
            '--type',
            'internal',
            '--value-type',
            'arrayObject',
            '--value-json',
            '[]'
          ])
        )
      ).exitCode
    ).toBe(0);
    await invoke(
      jsonArgs(dir, [
        'variable',
        'add',
        '--key',
        'theme',
        '--type',
        'select',
        '--value-type',
        'string',
        '--options-json',
        '[{"value":"math"},{"label":"Science","value":"science"}]'
      ])
    );
    const numberConfigPath = join(cwd, 'number-variable.json');
    await writeFile(numberConfigPath, JSON.stringify({ step: 0.5, precision: 1 }), 'utf8');
    await invoke(
      jsonArgs(dir, [
        'variable',
        'add',
        '--key',
        'questionCount',
        '--type',
        'numberInput',
        '--value-type',
        'number',
        '--config-file',
        numberConfigPath,
        '--min',
        '1',
        '--max',
        '20'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'variable',
        'add',
        '--key',
        'externalContext',
        '--type',
        'external',
        '--value-type',
        'object'
      ])
    );
    await invoke(
      jsonArgs(dir, ['variable', 'update', '--key', 'quizResults', '--value-type', 'arrayString'])
    );

    const variables = JSON.parse(
      (await invoke(jsonArgs(dir, ['variable', 'list']))).stdout[0]
    ).result;
    expect(variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'quizResults',
          type: 'internal',
          valueType: 'arrayString',
          required: false
        }),
        expect.objectContaining({
          key: 'theme',
          type: 'select',
          list: [
            { label: 'math', value: 'math' },
            { label: 'Science', value: 'science' }
          ]
        }),
        expect.objectContaining({
          key: 'questionCount',
          type: 'numberInput',
          min: 1,
          max: 20,
          step: 0.5,
          precision: 1
        }),
        expect.objectContaining({ key: 'externalContext', type: 'custom', valueType: 'object' })
      ])
    );

    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'variable',
            'add',
            '--key',
            'invalidSwitch',
            '--type',
            'switch',
            '--value-type',
            'string'
          ])
        )
      ).exitCode
    ).toBe(2);
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'variable',
            'add',
            '--key',
            'invalidInternal',
            '--type',
            'internal',
            '--value-type',
            'string',
            '--required'
          ])
        )
      ).exitCode
    ).toBe(2);
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'variable',
            'add',
            '--key',
            'invalidConfig',
            '--value-type',
            'string',
            '--config-json',
            '{"type":"internal"}'
          ])
        )
      ).exitCode
    ).toBe(2);
  });

  it('adds system config when importing a legacy workflow without overwriting chatConfig', async () => {
    const { cwd, invoke } = await createHarness();
    const sourceDir = join(cwd, 'legacy-source');
    await invoke(jsonArgs(sourceDir, ['init']));
    await invoke(
      jsonArgs(sourceDir, ['config', 'set', '--path', 'welcomeText', '--value', 'Legacy welcome'])
    );
    await invoke(
      jsonArgs(sourceDir, ['variable', 'add', '--key', 'tenantId', '--value-type', 'string'])
    );
    const sourceStorePath = join(cwd, 'legacy-store.json');
    await invoke(jsonArgs(sourceDir, ['build', '--output', sourceStorePath]));
    const legacyStore = JSON.parse(await readFile(sourceStorePath, 'utf8'));
    legacyStore.nodes = legacyStore.nodes.filter(
      (node: { flowNodeType: string }) => node.flowNodeType !== 'userGuide'
    );
    await writeFile(sourceStorePath, JSON.stringify(legacyStore), 'utf8');

    const importedDir = join(cwd, 'legacy-imported');
    expect(
      (await invoke(jsonArgs(importedDir, ['import', '--input', sourceStorePath]))).exitCode
    ).toBe(0);
    const importedDocument = JSON.parse(await readFile(join(importedDir, 'workflow.json'), 'utf8'));
    expect(importedDocument.nodes).toContainEqual(
      expect.objectContaining({ nodeId: 'userGuide', flowNodeType: 'userGuide' })
    );
    expect(importedDocument.chatConfig).toMatchObject({
      welcomeText: 'Legacy welcome',
      variables: [expect.objectContaining({ key: 'tenantId' })]
    });
  });

  it('supports PR3 branch, insert, tool, output and nesting commands', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'pr3-complex');
    await invoke(jsonArgs(dir, ['init']));
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'route',
        '--template',
        'builtin:if-else',
        '--after',
        'start@next'
      ])
    );
    await invoke(
      jsonArgs(dir, [
        'input',
        'set',
        '--node',
        'route',
        '--key',
        'ifElseList',
        '--value-json',
        '[{"branchId":"positive","condition":"AND","list":[{"variable":["start","userChatInput"],"condition":"isNotEmpty","valueType":"input"}]}]'
      ])
    );
    await invoke(
      jsonArgs(dir, ['node', 'add', '--node', 'answer', '--template', 'builtin:assigned-answer'])
    );
    await invoke(
      jsonArgs(dir, ['input', 'set', '--node', 'answer', '--key', 'text', '--value', 'ok'])
    );
    await invoke(
      jsonArgs(dir, ['edge', 'connect', '--from', 'route@branch:positive', '--to', 'answer@target'])
    );
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'node',
            'insert',
            '--from',
            'route@branch:positive',
            '--to',
            'answer@target',
            '--template',
            'builtin:text-editor',
            '--id',
            'middle'
          ])
        )
      ).exitCode
    ).toBe(0);

    await invoke(
      jsonArgs(dir, ['node', 'add', '--node', 'caller', '--template', 'builtin:tool-call'])
    );
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'tool',
            'attach',
            '--tool-call',
            'caller',
            '--template',
            'builtin:user-select',
            '--id',
            'confirm'
          ])
        )
      ).exitCode
    ).toBe(0);
    expect(
      JSON.parse((await invoke(jsonArgs(dir, ['tool', 'list', '--tool-call', 'caller']))).stdout[0])
        .result
    ).toHaveLength(1);

    await invoke(jsonArgs(dir, ['node', 'add', '--node', 'code', '--template', 'builtin:code']));
    await invoke(jsonArgs(dir, ['node', 'update', '--node', 'code', '--catch-error']));
    await invoke(
      jsonArgs(dir, ['output', 'add', '--node', 'code', '--key', 'score', '--value-type', 'number'])
    );
    expect(
      JSON.parse((await invoke(jsonArgs(dir, ['output', 'list', '--node', 'code']))).stdout[0])
        .result
    ).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'score' })]));
    expect(
      (await invoke(jsonArgs(dir, ['output', 'remove', '--node', 'code', '--key', 'score'])))
        .exitCode
    ).toBe(0);

    await invoke(
      jsonArgs(dir, ['node', 'add', '--node', 'loop', '--template', 'builtin:loop-run'])
    );
    await invoke(
      jsonArgs(dir, [
        'node',
        'add',
        '--node',
        'break',
        '--template',
        'builtin:loop-run-break',
        '--parent',
        'loop'
      ])
    );
    expect(
      JSON.parse(
        (await invoke(jsonArgs(dir, ['container', 'children', '--node', 'loop']))).stdout[0]
      ).result.map((node: { nodeId: string }) => node.nodeId)
    ).toEqual(expect.arrayContaining(['loop__start', 'break']));
    expect(
      (await invoke(jsonArgs(dir, ['node', 'move', '--node', 'break', '--root']))).exitCode
    ).toBe(3);
  });

  it('builds a file-upload workflow after enabling file selection', async () => {
    const { cwd, invoke } = await createHarness();
    const dir = join(cwd, 'file-upload');
    await invoke(jsonArgs(dir, ['init']));
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'config',
            'set',
            '--path',
            'fileSelectConfig',
            '--value-json',
            '{"maxFiles":1,"canSelectFile":true}'
          ])
        )
      ).exitCode
    ).toBe(0);
    const fileSelectDescriptor = JSON.parse(
      (
        await invoke(
          jsonArgs(dir, ['config', 'get', '--path', 'fileSelectConfig', '--locale', 'zh-CN'])
        )
      ).stdout[0]
    ).result;
    expect(fileSelectDescriptor).toMatchObject({
      path: 'fileSelectConfig',
      description: expect.stringContaining('用户从对话入口提供的文件'),
      capabilities: ['user-file-input'],
      value: { maxFiles: 1, canSelectFile: true },
      valueSchema: {
        type: 'object',
        properties: {
          canSelectFile: expect.objectContaining({ type: 'boolean' })
        }
      }
    });
    expect(
      (
        await invoke(
          jsonArgs(dir, [
            'node',
            'add',
            '--node',
            'read',
            '--template',
            'builtin:read-files',
            '--after',
            'start@next'
          ])
        )
      ).exitCode
    ).toBe(0);
    expect((await invoke(jsonArgs(dir, ['validate']))).exitCode).toBe(0);
    expect(
      JSON.parse(
        (await invoke(jsonArgs(dir, ['input', 'show', '--node', 'read', '--key', 'fileUrlList'])))
          .stdout[0]
      ).result.value
    ).toEqual([['start', 'userFiles']]);
  });
});

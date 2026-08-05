import { builtinTemplateProvider } from '@fastgpt/workflow-core';
import { runCli } from '../src';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('request-scoped CLI template provider', () => {
  it('lists and shows authorized system tools from the injected bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'workflow-cli-templates-'));
    const workflowDirectory = join(directory, 'workflow');
    const bundleFile = join(directory, 'template-bundle.json');
    const source = 'debug:tmbId:session-1';
    const toolId = 'systemTool-weather/forecast';
    const { template: workflowStartTemplate } = await builtinTemplateProvider.resolve(
      { kind: 'builtin', templateId: 'workflow-start' },
      { locale: 'en' }
    );
    await writeFile(
      bundleFile,
      JSON.stringify({
        schemaVersion: 'fastgpt-workflow-template-bundle/v1',
        items: [
          {
            ref: { kind: 'systemTool', source, toolId },
            template: {
              ...workflowStartTemplate,
              id: toolId,
              pluginId: toolId,
              flowNodeType: 'tool',
              unique: false,
              name: 'Weather forecast',
              source,
              toolConfig: { systemTool: { toolId, source } }
            }
          }
        ]
      })
    );

    const invoke = async (argv: string[]) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = await runCli({
        argv: [...argv, '--dir', workflowDirectory, '--format', 'json'],
        cwd: directory,
        env: { FASTGPT_WORKFLOW_TEMPLATE_BUNDLE: bundleFile },
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value)
      });
      return { exitCode, stdout, stderr };
    };

    try {
      const list = await invoke(['template', 'list', '--kind', 'systemTool']);
      expect(list.exitCode).toBe(0);
      expect(JSON.parse(list.stdout[0]).result).toMatchObject({
        total: 1,
        counts: { builtin: 0, teamApp: 0, systemTool: 1, tool: 0 },
        items: [
          {
            kind: 'systemTool',
            ref: 'systemTool:debug%3AtmbId%3Asession-1/systemTool-weather%2Fforecast',
            template: { kind: 'systemTool', source, toolId },
            name: 'Weather forecast'
          }
        ]
      });

      const show = await invoke([
        'template',
        'show',
        '--template',
        'systemTool:debug%3AtmbId%3Asession-1/systemTool-weather%2Fforecast'
      ]);
      expect(show.exitCode).toBe(0);
      expect(JSON.parse(show.stdout[0]).result).toMatchObject({
        template: { kind: 'systemTool', source, toolId },
        name: 'Weather forecast'
      });

      const initialized = await invoke(['init', '--name', 'System tool workflow']);
      expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
      const add = await invoke([
        'node',
        'add',
        '--node',
        'weather',
        '--template',
        'systemTool:debug%3AtmbId%3Asession-1/systemTool-weather%2Fforecast'
      ]);
      expect(add.exitCode).toBe(0);
      const workflow = JSON.parse(await readFile(join(workflowDirectory, 'workflow.json'), 'utf8'));
      expect(workflow.nodes).toContainEqual(
        expect.objectContaining({
          nodeId: 'weather',
          flowNodeType: 'tool',
          pluginId: toolId,
          source
        })
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

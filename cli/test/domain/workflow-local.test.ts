import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';
import { createWorkflowLocalService } from '../../src/domain/workflow/workflow-local-service';
import { createNodeFileIoAdapter } from '../../src/infra/fs/file-io';
import { createNonTtyPrompter } from '../../src/infra/ui/prompter';
import {
  WORKFLOW_TEMPLATE_BUNDLE_ENV,
  createWorkflowTemplateLoader
} from '../../src/infra/workflow/template-loader';
import { CliArgumentError } from '../../src/shared/errors';

const tempDirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-wf-local-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createLocalService(
  dir: string,
  overrides?: {
    env?: NodeJS.ProcessEnv;
    isTTY?: boolean;
    confirmed?: boolean;
    stdin?: string;
  }
) {
  const fileIo = createNodeFileIoAdapter({ cwd: dir });
  const templateLoader = createWorkflowTemplateLoader({ fileIo });
  const prompter = overrides?.isTTY
    ? {
        ...createNonTtyPrompter(),
        isInteractive: true,
        confirm: async () => overrides.confirmed ?? true
      }
    : createNonTtyPrompter();
  return createWorkflowLocalService({
    fileIo,
    templateLoader,
    env: overrides?.env ?? {},
    prompter,
    readStdin: async () => overrides?.stdin ?? ''
  });
}

describe('WorkflowLocalService', () => {
  it('supports init, meta, config, variable, template, node, edge, input, output, tool, container, build, import, and inspect', async () => {
    const dir = await makeDir();
    const service = createLocalService(dir);

    const initDry = await service.init({ dir, locale: 'en', name: 'Dry Flow', dryRun: true });
    expect(initDry.changed).toBe(false);
    expect((initDry.data as { dryRun: boolean }).dryRun).toBe(true);

    const initRes = await service.init({ dir, locale: 'en', name: 'Support Bot' });
    expect(initRes.changed).toBe(true);
    await expect(service.init({ dir, locale: 'en' })).rejects.toBeInstanceOf(CliArgumentError);

    const metaSet = await service.metaSet({
      dir,
      locale: 'en',
      name: 'Support Bot v2',
      intro: 'Answers support tickets'
    });
    expect(metaSet.changed).toBe(true);
    const metaShow = await service.metaShow({ dir });
    expect((metaShow.data as { name: string }).name).toBe('Support Bot v2');

    const cfgList = await service.configList({ dir, locale: 'en' });
    expect(Array.isArray(cfgList.data)).toBe(true);
    await service.configSet({
      dir,
      locale: 'en',
      path: 'welcomeText',
      valueInput: { value: 'Welcome!' }
    });
    const cfgGet = await service.configGet({ dir, locale: 'en', path: 'welcomeText' });
    expect((cfgGet.data as { value: unknown }).value).toBe('Welcome!');
    await service.configUnset({ dir, locale: 'en', path: 'welcomeText' });

    await service.variableAdd({
      dir,
      locale: 'en',
      key: 'city',
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      valueInput: { value: 'Shanghai' }
    });
    await service.variableUpdate({
      dir,
      locale: 'en',
      key: 'city',
      label: 'City Name',
      optional: true
    });
    const varList = await service.variableList({ dir });
    expect((varList.data as Array<{ key: string; label: string }>)[0].label).toBe('City Name');
    await service.variableRemove({ dir, locale: 'en', key: 'city' });

    await service.variableAdd({
      dir,
      locale: 'en',
      label: 'Auto Key Var',
      valueType: WorkflowIOValueTypeEnum.string
    });
    const autoVarList = (await service.variableList({ dir })).data as Array<{
      key: string;
      label: string;
    }>;
    expect(autoVarList).toHaveLength(1);
    expect(autoVarList[0].key).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(autoVarList[0].label).toBe('Auto Key Var');
    await service.variableRemove({ dir, locale: 'en', key: autoVarList[0].key });

    const templates = await service.templateList({ locale: 'en', kind: 'builtin' });
    expect((templates.data as { total: number }).total).toBeGreaterThan(5);
    const aiTpl = await service.templateShow({ locale: 'en', template: 'builtin:ai-chat' });
    expect((aiTpl.data as { flowNodeType: string }).flowNodeType).toBe('chatNode');

    await service.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      template: 'builtin:ai-chat',
      after: 'start@next',
      position: '900,120'
    });
    await service.nodeUpdate({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      name: 'Main Chat',
      catchError: true
    });
    await service.nodeClone({
      dir,
      locale: 'en',
      sourceNodeId: 'chat1',
      id: 'chat2',
      offset: '0,200'
    });
    await service.edgeConnect({
      dir,
      locale: 'en',
      from: 'chat1@next',
      to: 'chat2@target'
    });
    await service.edgeReconnect({
      dir,
      locale: 'en',
      from: 'start@next',
      oldTo: 'chat1@target',
      to: 'chat2@target'
    });
    await service.edgeDisconnect({
      dir,
      locale: 'en',
      from: 'start@next',
      to: 'chat2@target'
    });
    await service.edgeConnect({
      dir,
      locale: 'en',
      from: 'start@next',
      to: 'chat1@target'
    });

    await service.inputSet({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      key: 'systemPrompt',
      valueInput: { value: 'Be concise' }
    });
    await service.inputRef({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      key: 'userChatInput',
      from: 'start.userChatInput'
    });
    const availRefs = await service.inputAvailable({ dir, nodeId: 'chat1', key: 'userChatInput' });
    expect(Array.isArray(availRefs.data)).toBe(true);
    await service.inputUnset({ dir, locale: 'en', nodeId: 'chat1', key: 'systemPrompt' });

    await service.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'code1',
      template: 'builtin:code',
      after: 'chat1@next',
      position: '1300,120'
    });
    await service.inputRef({
      dir,
      locale: 'en',
      nodeId: 'code1',
      key: 'data1',
      from: 'start.userChatInput'
    });
    await service.inputRef({
      dir,
      locale: 'en',
      nodeId: 'code1',
      key: 'data2',
      from: 'start.userChatInput'
    });
    await service.inputAdd({
      dir,
      locale: 'en',
      nodeId: 'code1',
      key: 'payload',
      valueType: WorkflowIOValueTypeEnum.string,
      mode: 'both'
    });
    await service.outputAdd({
      dir,
      locale: 'en',
      nodeId: 'code1',
      key: 'summary',
      valueType: WorkflowIOValueTypeEnum.string
    });
    const outputs = await service.outputList({ dir, nodeId: 'code1' });
    expect((outputs.data as Array<{ key: string }>).some((o) => o.key === 'summary')).toBe(true);
    await service.outputRemove({ dir, locale: 'en', nodeId: 'code1', key: 'summary' });
    await service.inputRemove({ dir, locale: 'en', nodeId: 'code1', key: 'payload' });

    await service.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'tools1',
      template: 'builtin:tool-call',
      after: 'code1@next',
      position: '1650,120'
    });
    await service.toolAttach({
      dir,
      locale: 'en',
      toolCallNodeId: 'tools1',
      template: 'builtin:dataset-search',
      id: 'kb1'
    });
    const attached = await service.toolList({ dir, toolCallNodeId: 'tools1' });
    expect((attached.data as Array<{ nodeId: string }>).map((n) => n.nodeId)).toEqual(['kb1']);
    await service.toolDetach({ dir, locale: 'en', toolCallNodeId: 'tools1', toolNodeId: 'kb1' });

    await service.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'loop1',
      template: 'builtin:loop-run',
      after: 'tools1@next',
      position: '2000,120'
    });
    const children = await service.containerChildren({ dir, nodeId: 'loop1' });
    expect(Array.isArray(children.data)).toBe(true);
    await service.nodeRemove({ dir, locale: 'en', nodeId: 'chat2' });
    await service.nodeRemove({ dir, locale: 'en', nodeId: 'kb1' });
    await service.nodeRemove({ dir, locale: 'en', nodeId: 'loop1' });
    await service.nodeRemove({ dir, locale: 'en', nodeId: 'tools1' });

    const inspectRes = await service.inspect({ dir });
    expect((inspectRes.data as { nodes: unknown[] }).nodes.length).toBeGreaterThanOrEqual(3);

    const validateRes = await service.validate({ dir });
    expect((validateRes.data as { valid: boolean }).valid).toBe(true);

    const storePath = join(dir, 'store.json');
    const buildRes = await service.build({ dir, output: storePath });
    expect((buildRes.data as { output: string }).output).toBe(storePath);

    const dir2 = await makeDir();
    const service2 = createLocalService(dir2);
    const imported = await service2.importWorkflow({
      dir: dir2,
      locale: 'en',
      inputPath: storePath
    });
    expect(imported.changed).toBe(true);
    const importedNodes = await service2.nodeList({ dir: dir2 });
    expect((importedNodes.data as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('plans and applies changesets with checksum verification and loads custom template bundle env', async () => {
    const dir = await makeDir();
    const bundlePath = join(dir, 'bundle.json');
    await writeFile(bundlePath, JSON.stringify(createWorkflowTemplateBundle({ locale: 'zh-CN' })));
    const service = createLocalService(dir, {
      env: { [WORKFLOW_TEMPLATE_BUNDLE_ENV]: bundlePath }
    });

    await service.init({ dir, locale: 'zh-CN', name: 'Plan Test' });
    const inspected = await service.inspect({ dir });
    const baseChecksum = (inspected.data as { checksum: string }).checksum;

    const changeSetPath = join(dir, 'changeset.json');
    await writeFile(
      changeSetPath,
      JSON.stringify({
        schemaVersion: 'fastgpt-workflow-changeset/v1',
        baseChecksum,
        commands: [
          {
            type: 'node.add',
            nodeId: 'chat1',
            template: { kind: 'builtin', templateId: 'ai-chat' },
            connectFrom: { kind: 'next', nodeId: 'start' }
          }
        ]
      })
    );

    const planPath = join(dir, 'plan.json');
    const planRes = await service.changesetPlan({
      dir,
      locale: 'zh-CN',
      inputSource: changeSetPath,
      output: planPath
    });
    const plan = JSON.parse(await readFile(planPath, 'utf8')) as { targetChecksum: string };
    expect(planRes.meta?.checksum).toBe(plan.targetChecksum);

    // 非 TTY 缺少 --confirm 必须被拦截
    await expect(
      service.changesetApply({ dir, locale: 'zh-CN', planSource: planPath })
    ).rejects.toBeInstanceOf(CliArgumentError);

    // 错误 --confirm 必须被拦截
    await expect(
      service.changesetApply({
        dir,
        locale: 'zh-CN',
        planSource: planPath,
        confirm: 'sha256:0000'
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    const applyRes = await service.changesetApply({
      dir,
      locale: 'zh-CN',
      planSource: planPath,
      confirm: plan.targetChecksum
    });
    expect(applyRes.changed).toBe(true);
    expect((applyRes.data as { targetChecksum: string }).targetChecksum).toBe(plan.targetChecksum);

    const nodesAfter = await service.nodeList({ dir });
    expect((nodesAfter.data as Array<{ nodeId: string }>).some((n) => n.nodeId === 'chat1')).toBe(
      true
    );
  });

  it('loads the template bundle once per template list', async () => {
    const dir = await makeDir();
    const fileIo = createNodeFileIoAdapter({ cwd: dir });
    const baseLoader = createWorkflowTemplateLoader({ fileIo });
    const loadBundleSpy = vi.fn(baseLoader.loadBundle);
    const service = createWorkflowLocalService({
      fileIo,
      templateLoader: { loadBundle: loadBundleSpy },
      env: {},
      prompter: createNonTtyPrompter(),
      readStdin: async () => ''
    });

    const res = await service.templateList({ locale: 'en' });
    expect((res.data as { total: number }).total).toBeGreaterThan(1);
    expect(loadBundleSpy).toHaveBeenCalledTimes(1);
  });
});

import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowCommandError,
  WorkflowTemplateBundleSchema,
  builtinTemplateProvider,
  composeWorkflowTemplateProviders,
  createWorkflowTemplateBundleProvider,
  createWorkflowDocument,
  formatNodeTemplateRef,
  instantiateNodeFromTemplate,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const systemToolRef = {
  kind: 'systemTool' as const,
  source: 'debug:tmbId:session-1',
  toolId: 'systemTool-weather/forecast'
};

const createBundle = () => ({
  schemaVersion: 'fastgpt-workflow-template-bundle/v1' as const,
  items: [
    {
      ref: systemToolRef,
      template: {
        ...structuredClone(WorkflowStart),
        id: systemToolRef.toolId,
        pluginId: systemToolRef.toolId,
        flowNodeType: FlowNodeTypeEnum.tool,
        unique: false,
        name: 'Weather forecast',
        source: systemToolRef.source,
        toolConfig: {
          systemTool: { toolId: systemToolRef.toolId, source: systemToolRef.source }
        }
      }
    }
  ]
});

describe('workflow template provider', () => {
  it('uses source and tool id as the canonical system tool identity', () => {
    const encoded = 'systemTool:debug%3AtmbId%3Asession-1/systemTool-weather%2Fforecast';

    expect(formatNodeTemplateRef(systemToolRef)).toBe(encoded);
    expect(parseNodeTemplateRef(encoded)).toEqual(systemToolRef);
    expect(() => parseNodeTemplateRef('systemTool:systemTool-weather')).toThrow();
  });

  it('loads a strict request-scoped template bundle', async () => {
    const provider = createWorkflowTemplateBundleProvider(createBundle());

    await expect(provider.list({ locale: 'en' })).resolves.toEqual([systemToolRef]);
    await expect(provider.resolve(systemToolRef, { locale: 'en' })).resolves.toMatchObject({
      template: { id: systemToolRef.toolId, source: systemToolRef.source }
    });
    await expect(
      provider.resolve(
        { kind: 'systemTool', source: 'system', toolId: 'missing' },
        { locale: 'en' }
      )
    ).rejects.toMatchObject({
      diagnostics: [{ code: 'WORKFLOW_TEMPLATE_UNAVAILABLE' }]
    });
  });

  it('composes builtin and request-scoped providers without changing Core execution', async () => {
    const provider = composeWorkflowTemplateProviders([
      builtinTemplateProvider,
      createWorkflowTemplateBundleProvider(createBundle())
    ]);
    const refs = await provider.list({ locale: 'en' });

    expect(refs).toContainEqual({ kind: 'builtin', templateId: 'ai-chat' });
    expect(refs).toContainEqual(systemToolRef);
    await expect(
      provider.resolve({ kind: 'builtin', templateId: '__system-config' }, { locale: 'en' })
    ).resolves.toMatchObject({ template: { flowNodeType: FlowNodeTypeEnum.systemConfig } });
    await expect(
      instantiateNodeFromTemplate({
        document: createWorkflowDocument(),
        templateRef: systemToolRef,
        nodeId: 'weather',
        provider,
        locale: 'en'
      })
    ).resolves.toMatchObject({
      node: {
        nodeId: 'weather',
        flowNodeType: FlowNodeTypeEnum.tool,
        pluginId: systemToolRef.toolId,
        source: systemToolRef.source
      }
    });
  });

  it('rejects duplicate identities and unknown transport fields', async () => {
    const duplicateProvider = composeWorkflowTemplateProviders([
      createWorkflowTemplateBundleProvider(createBundle()),
      createWorkflowTemplateBundleProvider(createBundle())
    ]);

    await expect(duplicateProvider.list({ locale: 'en' })).rejects.toBeInstanceOf(
      WorkflowCommandError
    );
    expect(() =>
      WorkflowTemplateBundleSchema.parse({
        ...createBundle(),
        items: [
          {
            ...createBundle().items[0],
            template: {
              ...createBundle().items[0].template,
              secretsVal: { token: 'secret' }
            }
          }
        ]
      })
    ).toThrow();
    expect(() =>
      WorkflowTemplateBundleSchema.parse({
        ...createBundle(),
        items: [
          {
            ...createBundle().items[0],
            template: { ...createBundle().items[0].template, pluginId: 'another-tool' }
          }
        ]
      })
    ).toThrow();
  });
});

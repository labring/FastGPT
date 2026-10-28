import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import {
  composeWorkflowTemplateProviders,
  createWorkflowTemplateBundleProvider
} from '../../src/template/provider';
import { WorkflowTemplateBundleSchema } from '@fastgpt/global/core/workflow/template/type';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { formatNodeTemplateRef, parseNodeTemplateRef } from '../../src/template/type';
import { instantiateNodeFromTemplate } from '../../src/template/instantiate';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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

  it('loads a request-scoped template bundle', async () => {
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
      diagnostics: [{ code: WorkflowDiagnosticCodeEnum.templateUnavailable }]
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
    ).rejects.toMatchObject({
      diagnostics: [{ code: WorkflowDiagnosticCodeEnum.templateUnavailable }]
    });
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

  it('strips canvas output callbacks before resolving and instantiating injected templates', async () => {
    const ref = { kind: 'builtin' as const, templateId: 'ai-chat' };
    const provider = createWorkflowTemplateBundleProvider({
      schemaVersion: 'fastgpt-workflow-template-bundle/v1',
      items: [{ ref, template: AiChatModule }]
    });
    const { template } = await provider.resolve(ref, { locale: 'en' });
    expect(template.outputs.some((output) => 'invalidCondition' in output)).toBe(false);
    expect(() => structuredClone(template)).not.toThrow();

    const { node } = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: ref,
      nodeId: 'ai',
      provider,
      locale: 'en'
    });
    expect(node.outputs).toEqual(template.outputs);
    expect(
      AiChatModule.outputs.find((output) => output.key === 'reasoningText')?.invalidCondition
    ).toBeTypeOf('function');
  });

  it('strips unknown transport fields while retaining opaque schema and default values', () => {
    const bundle = createBundle();
    const item = bundle.items[0];
    const inputMeta = { valueSchema: { type: 'string', customKeyword: true } };
    const inputDefault = { provided: true as const, value: { customValue: true } };
    const parsed = WorkflowTemplateBundleSchema.parse({
      ...bundle,
      extra: true,
      items: [
        {
          ...item,
          extra: true,
          ref: { ...item.ref, extra: true },
          template: { ...item.template, secretsVal: { token: 'secret' } },
          automationMeta: {
            extra: true,
            inputs: { input: { ...inputMeta, extra: true } }
          },
          validatedInputDefaults: { input: { ...inputDefault, extra: true } }
        }
      ]
    });
    expect(parsed).toEqual({
      ...bundle,
      items: [
        {
          ...item,
          automationMeta: { inputs: { input: inputMeta } },
          validatedInputDefaults: { input: inputDefault }
        }
      ]
    });
  });

  it('rejects duplicate identities and inconsistent tool references', async () => {
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
            template: { ...createBundle().items[0].template, pluginId: 'another-tool' }
          }
        ]
      })
    ).toThrow();
  });

  it('uses validated defaults and hidden templates directly from the injected bundle', async () => {
    const ref = { kind: 'builtin' as const, templateId: 'ai-chat' };
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const validatedInputDefaults = {
      [NodeInputKeyEnum.aiModelId]: { provided: true as const, value: 'test-llm-model-id' }
    };
    const providerWithDefaults = createWorkflowTemplateBundleProvider({
      ...createBundle(),
      items: [{ ref, ...resolved, listed: false, validatedInputDefaults }]
    });
    await expect(providerWithDefaults.list({ locale: 'en' })).resolves.toEqual([]);

    const resolvedAiChat = await providerWithDefaults.resolve(
      { kind: 'builtin', templateId: 'ai-chat' },
      { locale: 'en' }
    );
    expect(resolvedAiChat.validatedInputDefaults?.[NodeInputKeyEnum.aiModelId]).toEqual({
      provided: true,
      value: 'test-llm-model-id'
    });

    const { node } = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: { kind: 'builtin', templateId: 'ai-chat' },
      nodeId: 'ai-node-1',
      provider: providerWithDefaults,
      locale: 'en'
    });

    const modelInput = node.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId);
    expect(modelInput?.value).toBe('test-llm-model-id');
  });
});

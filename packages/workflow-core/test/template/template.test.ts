import {
  FlowNodeInputTypeEnum,
  WorkflowIOValueTypeEnum,
  WorkflowCommandError,
  builtinTemplateProvider,
  createWorkflowDocument,
  formatNodeTemplateRef,
  instantiateNodeFromTemplate,
  normalizeNodeTemplateDescriptor,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

describe('builtinTemplateProvider', () => {
  it('exposes the PR1 through PR3 builtin templates', async () => {
    await expect(builtinTemplateProvider.list({ locale: 'en' })).resolves.toEqual([
      { kind: 'builtin', templateId: 'workflow-start' },
      { kind: 'builtin', templateId: 'ai-chat' },
      { kind: 'builtin', templateId: 'text-editor' },
      { kind: 'builtin', templateId: 'assigned-answer' },
      { kind: 'builtin', templateId: 'dataset-search' },
      { kind: 'builtin', templateId: 'question-optimization' },
      { kind: 'builtin', templateId: 'content-extract' },
      { kind: 'builtin', templateId: 'http-request' },
      { kind: 'builtin', templateId: 'code' },
      { kind: 'builtin', templateId: 'call-app' },
      { kind: 'builtin', templateId: 'if-else' },
      { kind: 'builtin', templateId: 'question-classification' },
      { kind: 'builtin', templateId: 'user-select' },
      { kind: 'builtin', templateId: 'form-input' },
      { kind: 'builtin', templateId: 'tool-call' },
      { kind: 'builtin', templateId: 'read-files' },
      { kind: 'builtin', templateId: 'variable-update' },
      { kind: 'builtin', templateId: 'parallel-run' },
      { kind: 'builtin', templateId: 'loop-run' },
      { kind: 'builtin', templateId: 'loop-run-break' },
      { kind: 'builtin', templateId: 'dataset-concat' },
      { kind: 'builtin', templateId: 'custom-feedback' }
    ]);
    await expect(
      builtinTemplateProvider.resolve(parseNodeTemplateRef('builtin:missing'), { locale: 'en' })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('publishes value schemas for common complex PR2 parameters', async () => {
    const ref = parseNodeTemplateRef('builtin:http-request');
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const descriptor = normalizeNodeTemplateDescriptor({
      ...resolved,
      templateRef: ref
    });
    expect(
      descriptor.inputs.find((input) => input.key === 'system_httpHeader')?.constraints?.valueSchema
    ).toMatchObject({ type: 'array' });
    expect(
      descriptor.inputs.find((input) => input.key === 'system_addInputParam')?.configurable
    ).toBe(false);
  });

  it('documents distinct text and node-reference formats for text editor inputs', async () => {
    const ref = parseNodeTemplateRef('builtin:text-editor');
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const descriptor = normalizeNodeTemplateDescriptor({
      ...resolved,
      templateRef: ref
    });
    const input = descriptor.inputs.find((item) => item.key === 'system_textareaInput');

    expect(input?.examples).toEqual([
      'Plain text',
      'Hello {{name}}',
      'Topic: {{$validateCode.topic$}}'
    ]);
    expect(input?.description).toContain('Never use {{nodeId.outputKey}} for a node reference.');
  });

  it('keeps automation metadata aligned with template inputs and explicit for resources', async () => {
    const resourceRenderTypes = new Map<FlowNodeInputTypeEnum, string>([
      [FlowNodeInputTypeEnum.selectDataset, 'dataset'],
      [FlowNodeInputTypeEnum.selectLLMModel, 'model'],
      [FlowNodeInputTypeEnum.settingLLMModel, 'model'],
      [FlowNodeInputTypeEnum.selectApp, 'app'],
      [FlowNodeInputTypeEnum.password, 'secret']
    ]);
    for (const ref of await builtinTemplateProvider.list({ locale: 'en' })) {
      const templateName = formatNodeTemplateRef(ref);
      const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
      const inputKeys = new Set(resolved.template.inputs.map((input) => input.key));
      expect(resolved.automationMeta, templateName).toBeDefined();
      for (const [inputKey, meta] of Object.entries(resolved.automationMeta?.inputs ?? {})) {
        expect(inputKeys.has(inputKey), `${templateName}.${inputKey}`).toBe(true);
        if (meta.resourceKind !== undefined) {
          expect(meta.defaultPolicy, `${templateName}.${inputKey}`).toBeDefined();
        }
        if (meta.resourceKind === 'secret') {
          expect(meta.defaultPolicy, `${templateName}.${inputKey}`).toBe('userRequired');
        }
      }
      for (const input of resolved.template.inputs) {
        const resourceKind = input.renderTypeList
          .map((renderType) => resourceRenderTypes.get(renderType))
          .find((value) => value !== undefined);
        if (resourceKind !== undefined) {
          expect(
            resolved.automationMeta?.inputs?.[input.key],
            `${templateName}.${input.key}`
          ).toMatchObject({ resourceKind });
        }
      }
    }
  });

  it('publishes a complete machine contract for every exposed builtin template', async () => {
    const structuredValueTypes = new Set([
      WorkflowIOValueTypeEnum.object,
      WorkflowIOValueTypeEnum.arrayObject,
      WorkflowIOValueTypeEnum.arrayAny,
      WorkflowIOValueTypeEnum.selectDataset,
      WorkflowIOValueTypeEnum.selectApp,
      WorkflowIOValueTypeEnum.dynamic
    ]);
    const systemInputKeys = new Set([
      'system_addInputParam',
      'childrenNodeIdList',
      'nodeWidth',
      'nodeHeight',
      'loopNodeInputHeight',
      'loopCustomOutputs'
    ]);

    for (const ref of await builtinTemplateProvider.list({ locale: 'en' })) {
      const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
      const descriptor = normalizeNodeTemplateDescriptor({ ...resolved, templateRef: ref });
      const templateName = formatNodeTemplateRef(ref);

      expect(descriptor.schemaVersion, templateName).toBe('fastgpt-workflow-node-contract/v1');
      expect(descriptor.execution.sourceKinds, templateName).toEqual(
        expect.arrayContaining(
          descriptor.execution.sourceKinds.filter((kind) =>
            ['next', 'branch', 'sourceOutput', 'catch', 'selectedTools'].includes(kind)
          )
        )
      );
      expect(descriptor.execution.terminal, templateName).toBe(
        descriptor.execution.sourceKinds.length === 0
      );
      for (const input of descriptor.inputs) {
        if (input.configurable) {
          expect(input.description.trim().length, `${templateName}.${input.key}`).toBeGreaterThan(
            0
          );
          expect(input.inputModes.length, `${templateName}.${input.key}`).toBeGreaterThan(0);
        }
        if (input.inputModes.includes('reference')) {
          expect(
            input.referencePolicy?.acceptedSourceValueTypes.length,
            `${templateName}.${input.key}`
          ).toBeGreaterThan(0);
        } else {
          expect(input.referencePolicy, `${templateName}.${input.key}`).toBeUndefined();
        }
        if (
          input.configurable &&
          input.inputModes.includes('literal') &&
          input.valueType &&
          structuredValueTypes.has(input.valueType as WorkflowIOValueTypeEnum)
        ) {
          expect(input.constraints?.valueSchema, `${templateName}.${input.key}`).toBeDefined();
        }
        if (systemInputKeys.has(input.key)) {
          expect(input.configurable, `${templateName}.${input.key}`).toBe(false);
        }
      }
    }
  });
});

describe('normalizeNodeTemplateDescriptor', () => {
  it('normalizes current template fields and automation metadata', async () => {
    const ref = parseNodeTemplateRef('builtin:ai-chat');
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const descriptor = normalizeNodeTemplateDescriptor({
      ...resolved,
      templateRef: ref,
      translate: (value) => `translated:${value}`
    });
    const userInput = descriptor.inputs.find((input) => input.key === 'userChatInput');
    const promptInput = descriptor.inputs.find((input) => input.key === 'systemPrompt');
    const modelInput = descriptor.inputs.find((input) => input.key === 'model');

    expect(descriptor.name).toMatch(/^translated:/);
    expect(descriptor.schemaVersion).toBe('fastgpt-workflow-node-contract/v1');
    expect(userInput?.inputModes).toEqual(['literal', 'reference']);
    expect(userInput?.referencePolicy?.acceptedSourceValueTypes).toEqual(
      expect.arrayContaining([WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.any])
    );
    expect(promptInput?.examples).toEqual(['You are a helpful assistant.']);
    expect(modelInput).toMatchObject({
      defaultPolicy: 'remoteValidated',
      resourceKind: 'model',
      bindingRequired: false
    });
    expect(modelInput?.examples).toBeUndefined();
    expect(descriptor.constraints.isTool).toBe(true);
    expect(descriptor.execution).toMatchObject({
      sourceKinds: expect.arrayContaining(['next']),
      targetKinds: expect.arrayContaining(['target', 'selectedTools']),
      terminal: false
    });
    expect(JSON.stringify(resolved.template)).not.toContain('invalidCondition');
  });

  it('publishes the same scalar-to-array reference contract used by the editor', async () => {
    const ref = parseNodeTemplateRef('builtin:dataset-search');
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const descriptor = normalizeNodeTemplateDescriptor({ ...resolved, templateRef: ref });
    const searchInput = descriptor.inputs.find(
      (input) => input.valueType === WorkflowIOValueTypeEnum.arrayString
    );

    expect(searchInput).toMatchObject({
      inputModes: expect.arrayContaining(['reference']),
      referencePolicy: {
        acceptedSourceValueTypes: [
          WorkflowIOValueTypeEnum.string,
          WorkflowIOValueTypeEnum.arrayString,
          WorkflowIOValueTypeEnum.arrayAny,
          WorkflowIOValueTypeEnum.any
        ]
      }
    });
  });

  it('describes branch, terminal, container and dynamic IO capabilities', async () => {
    const getDescriptor = async (templateId: string) => {
      const ref = parseNodeTemplateRef(`builtin:${templateId}`);
      const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
      return normalizeNodeTemplateDescriptor({ ...resolved, templateRef: ref });
    };

    await expect(getDescriptor('if-else')).resolves.toMatchObject({
      execution: {
        sourceKinds: ['branch'],
        targetKinds: ['target'],
        terminal: false,
        branch: {
          inputKey: 'ifElseList',
          keyField: 'branchId',
          keyFieldRequiredForNewValues: true,
          fallbackKey: 'ELSE',
          configureBeforeConnect: true
        }
      },
      effects: expect.arrayContaining(['prune-invalid-branch-edges'])
    });
    await expect(getDescriptor('assigned-answer')).resolves.toMatchObject({
      execution: { sourceKinds: [], terminal: true }
    });
    await expect(getDescriptor('loop-run-break')).resolves.toMatchObject({
      execution: { sourceKinds: [], targetKinds: ['target'], terminal: true },
      container: { rootAllowed: false, allowedParentTypes: ['loopRun'] }
    });
    await expect(getDescriptor('parallel-run')).resolves.toMatchObject({
      container: { kind: 'parallel', rootAllowed: true, allowedParentTypes: [] },
      dynamicIO: {
        inputs: { manual: false, derivedFromInputKeys: [] },
        outputs: { manual: false, derivedFromInputKeys: [] }
      }
    });
    await expect(getDescriptor('code')).resolves.toMatchObject({
      dynamicIO: {
        inputs: { manual: true, derivedFromInputKeys: ['code'] },
        outputs: { manual: true, derivedFromInputKeys: ['code'] }
      }
    });
    await expect(getDescriptor('form-input')).resolves.toMatchObject({
      container: { rootAllowed: true, allowedParentTypes: ['loop', 'loopRun'] },
      dynamicIO: {
        inputs: { manual: false },
        outputs: { manual: false, derivedFromInputKeys: ['userInputForms'] }
      }
    });
  });

  it('exposes explicit binding requirements without storing metadata in nodes', async () => {
    const ref = parseNodeTemplateRef('builtin:http-request');
    const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
    const descriptor = normalizeNodeTemplateDescriptor({
      ...resolved,
      templateRef: ref
    });

    expect(descriptor.inputs.find((input) => input.key === 'system_httpReqUrl')).toMatchObject({
      required: true,
      bindingRequired: true,
      defaultPolicy: 'userRequired'
    });
  });
});

describe('instantiateNodeFromTemplate', () => {
  it('creates a complete store node with the current default reference', async () => {
    const start = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: parseNodeTemplateRef('builtin:workflow-start'),
      nodeId: 'start',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    const document = createWorkflowDocument({ nodes: [start.node] });
    const ai = await instantiateNodeFromTemplate({
      document,
      templateRef: parseNodeTemplateRef('builtin:ai-chat'),
      nodeId: 'ai',
      provider: builtinTemplateProvider,
      locale: 'en'
    });

    expect(ai.node.inputs.length).toBeGreaterThan(10);
    expect(ai.node.inputs.find((input) => input.key === 'userChatInput')?.value).toEqual([
      'start',
      'userChatInput'
    ]);
    expect(JSON.stringify(ai.node)).not.toContain('agentHint');
    expect(JSON.stringify(ai.node)).not.toContain('examples');
  });

  it('uses validated remote defaults and clears unverified resource template values', async () => {
    const ref = parseNodeTemplateRef('builtin:ai-chat');
    const provider = {
      list: builtinTemplateProvider.list,
      resolve: async () => {
        const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
        const template = structuredClone(resolved.template);
        template.inputs.find((input) => input.key === 'model')!.value = 'template-model';
        return {
          ...resolved,
          template,
          validatedInputDefaults: {
            model: { provided: true as const, value: 'validated-model' }
          }
        };
      }
    };
    const node = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: ref,
      nodeId: 'ai',
      provider,
      locale: 'en'
    });
    expect(node.node.inputs.find((input) => input.key === 'model')).toMatchObject({
      value: 'validated-model'
    });

    const localNode = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: ref,
      nodeId: 'local-ai',
      provider: {
        ...provider,
        resolve: async () => {
          const resolved = await provider.resolve();
          return { ...resolved, validatedInputDefaults: undefined };
        }
      },
      locale: 'en'
    });
    const localModel = localNode.node.inputs.find((input) => input.key === 'model');
    expect(localModel?.value).toBeUndefined();
    expect(localModel?.defaultValue).toBeUndefined();
  });

  it('keeps the scalar Start reference for an array input', async () => {
    const start = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: parseNodeTemplateRef('builtin:workflow-start'),
      nodeId: 'start',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    const ref = parseNodeTemplateRef('builtin:ai-chat');
    const provider = {
      list: builtinTemplateProvider.list,
      resolve: async () => {
        const resolved = await builtinTemplateProvider.resolve(ref, { locale: 'en' });
        const template = structuredClone(resolved.template);
        const userInput = template.inputs.find((input) => input.key === 'userChatInput')!;
        userInput.valueType = WorkflowIOValueTypeEnum.arrayString;
        return { ...resolved, template };
      }
    };
    const ai = await instantiateNodeFromTemplate({
      document: createWorkflowDocument({ nodes: [start.node] }),
      templateRef: ref,
      nodeId: 'ai',
      provider,
      locale: 'en'
    });
    const userInput = ai.node.inputs.find((input) => input.key === 'userChatInput');
    expect(userInput?.value).toEqual(['start', 'userChatInput']);
    expect(userInput?.selectedTypeIndex).toBe(
      userInput?.renderTypeList.indexOf(FlowNodeInputTypeEnum.reference)
    );
  });

  it('keeps the composite Start reference for the array search input', async () => {
    const start = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: parseNodeTemplateRef('builtin:workflow-start'),
      nodeId: 'start',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    const search = await instantiateNodeFromTemplate({
      document: createWorkflowDocument({ nodes: [start.node] }),
      templateRef: parseNodeTemplateRef('builtin:dataset-search'),
      nodeId: 'search',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    expect(search.node.inputs.find((input) => input.key === 'datasetSearchInput')?.value).toEqual([
      ['start', 'userChatInput']
    ]);
    expect(search.node.inputs.find((input) => input.key === 'datasets')?.value).toEqual([]);
  });

  it('rejects duplicate IDs and unique templates', async () => {
    const start = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: parseNodeTemplateRef('builtin:workflow-start'),
      nodeId: 'start',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    const document = createWorkflowDocument({ nodes: [start.node] });

    await expect(
      instantiateNodeFromTemplate({
        document,
        templateRef: parseNodeTemplateRef('builtin:ai-chat'),
        nodeId: 'start',
        provider: builtinTemplateProvider,
        locale: 'en'
      })
    ).rejects.toThrow(WorkflowCommandError);
    await expect(
      instantiateNodeFromTemplate({
        document,
        templateRef: parseNodeTemplateRef('builtin:workflow-start'),
        nodeId: 'other-start',
        provider: builtinTemplateProvider,
        locale: 'en'
      })
    ).rejects.toThrow(WorkflowCommandError);
  });
});

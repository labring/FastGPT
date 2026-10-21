import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  VARIABLE_NODE_ID,
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { getAvailableInputReferences } from '../../src/reference/query';
import { instantiateNodeFromTemplate } from '../../src/template/instantiate';
import { parseNodeTemplateRef } from '../../src/template/type';
import { setInputReference, setInputValue } from '../../src/reference/service';
import { validateWorkflow } from '../../src/validation/index';
import { addNodeFromTemplate } from '../../src/node/add';
import { assertExecutionEdge } from '../../src/edge/validation';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import { DatasetTagFilterLogicEnum } from '@fastgpt/global/core/dataset/constants';

describe('input mutation services', () => {
  let document: ReturnType<typeof WorkflowDocumentSchema.parse>;

  beforeEach(() => {
    document = WorkflowDocumentSchema.parse(aiWorkflow);
  });

  it.each([
    createEmptyTagFilterValue(),
    { logic: DatasetTagFilterLogicEnum.AND, conditions: [{ tag: 'price', op: '$gte', value: 10 }] }
  ])('sets structured tag filters without converting the stored editor value: %j', (value) => {
    const input: FlowNodeInputItemType = {
      key: NodeInputKeyEnum.collectionFilterMatch,
      label: 'Tag filter',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.datasetTagFilter],
      selectedType: FlowNodeInputTypeEnum.reference,
      valueType: WorkflowIOValueTypeEnum.string,
      customJsonSchema: { type: 'string' }
    };
    document.nodes.find((node) => node.nodeId === 'ai')!.inputs.push(input);
    const before = structuredClone(value);
    setInputValue({ document, nodeId: 'ai', inputKey: input.key, value });

    expect(input.value).toEqual(value);
    expect(input.value).not.toBe(value);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.datasetTagFilter);
    expect(value).toEqual(before);
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).filter(
        (issue) => issue.inputKey === input.key
      )
    ).toEqual([]);
    expect(() =>
      setInputValue({
        document,
        nodeId: 'ai',
        inputKey: input.key,
        value: { logic: 'invalid', conditions: [] }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputValueTypeInvalid);
    expect(input.value).toEqual(value);
  });

  it('validates node, input, configurability, mode and scalar type', () => {
    expect(() =>
      setInputValue({ document, nodeId: 'missing', inputKey: 'model', value: 'x' })
    ).toThrow(WorkflowCommandError);
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: 'missing', value: 'x' })
    ).toThrow(WorkflowCommandError);

    const model = document.nodes.find((node) => node.nodeId === 'ai')!.inputs[0];
    model.canEdit = false;
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: model.key, value: 'x' })
    ).toThrow(WorkflowCommandError);
    model.canEdit = true;

    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: 'history', value: '100' })
    ).toThrow(WorkflowCommandError);
    setInputValue({ document, nodeId: 'ai', inputKey: 'history', value: 100 });
    expect(
      document.nodes
        .find((node) => node.nodeId === 'ai')!
        .inputs.find((input) => input.key === 'history')?.value
    ).toBe(100);
  });

  it('distinguishes literal, reference and runtime-generated input capabilities', () => {
    const userInput = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'userChatInput')!;

    userInput.renderTypeList = [FlowNodeInputTypeEnum.reference];
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputModeNotAllowed);
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: userInput.key,
      ref: { nodeId: 'start', outputKey: 'userChatInput' }
    });

    userInput.renderTypeList = [FlowNodeInputTypeEnum.textarea];
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: userInput.key,
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputModeNotAllowed);
    setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' });

    userInput.renderTypeList = [FlowNodeInputTypeEnum.agentGenerated];
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputNotConfigurable);
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: userInput.key,
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputNotConfigurable);

    userInput.renderTypeList = [
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ];
    setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' });
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: userInput.key,
      ref: { nodeId: 'start', outputKey: 'userChatInput' }
    });
  });

  it('uses explicit automation metadata to expose hidden modal inputs', async () => {
    const ref = parseNodeTemplateRef('builtin:http-request');
    const { node } = await instantiateNodeFromTemplate({
      document: createWorkflowDocument(),
      templateRef: ref,
      nodeId: 'http',
      provider: builtinTemplateProvider,
      locale: 'en'
    });
    const httpDocument = createWorkflowDocument({ nodes: [node] });

    setInputValue({
      document: httpDocument,
      nodeId: 'http',
      inputKey: 'system_httpReqUrl',
      value: 'https://example.com'
    });
    expect(
      httpDocument.nodes[0].inputs.find((input) => input.key === 'system_httpReqUrl')?.value
    ).toBe('https://example.com');
    expect(() =>
      setInputReference({
        document: httpDocument,
        nodeId: 'http',
        inputKey: 'system_httpReqUrl',
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputModeNotAllowed);

    const headers = [{ key: 'X-Custom', value: 'enabled' }];
    setInputValue({
      document: httpDocument,
      nodeId: 'http',
      inputKey: NodeInputKeyEnum.httpHeaders,
      value: headers
    });
    expect(
      httpDocument.nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.httpHeaders)
        ?.value
    ).toEqual(headers);
    expect(() =>
      setInputValue({
        document: httpDocument,
        nodeId: 'http',
        inputKey: NodeInputKeyEnum.httpHeaders,
        value: [{ key: 'X-Custom', value: 1 }]
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid);
  });

  it('validates dynamic input customJsonSchema on input.set', () => {
    const promptInput = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'systemPrompt')!;
    promptInput.customJsonSchema = { type: 'string', minLength: 3 };

    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: promptInput.key, value: 'x' })
    ).toThrow(WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid);
    setInputValue({ document, nodeId: 'ai', inputKey: promptInput.key, value: 'valid' });
  });

  it.each([
    { valueType: WorkflowIOValueTypeEnum.object, value: { name: 'Alice', enabled: true } },
    { valueType: WorkflowIOValueTypeEnum.arrayObject, value: [{ name: 'Alice' }] },
    { valueType: WorkflowIOValueTypeEnum.arrayAny, value: [{ name: 'Alice' }, 1, 'text'] },
    { valueType: WorkflowIOValueTypeEnum.any, value: { nested: { enabled: true } } }
  ])(
    'sets and validates $valueType inputs without requiring a custom schema',
    ({ valueType, value }) => {
      const input: FlowNodeInputItemType = {
        key: 'customPayload',
        label: 'Payload',
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.JSONEditor],
        selectedType: FlowNodeInputTypeEnum.reference,
        valueType
      };
      document.nodes.find((node) => node.nodeId === 'ai')!.inputs.push(input);

      setInputValue({ document, nodeId: 'ai', inputKey: input.key, value });

      expect(input).toMatchObject({ value, selectedType: FlowNodeInputTypeEnum.JSONEditor });
      expect(
        validateWorkflow(document, { invalidReferencePolicy: 'error' }).filter(
          (diagnostic) => diagnostic.inputKey === input.key
        )
      ).toEqual([]);
    }
  );

  it.each([
    { valueType: WorkflowIOValueTypeEnum.object, value: [] },
    { valueType: WorkflowIOValueTypeEnum.arrayAny, value: {} }
  ])('retains basic type checks for $valueType inputs without a schema', ({ valueType, value }) => {
    const input = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'systemPrompt')!;
    input.valueType = valueType;

    expect(() => setInputValue({ document, nodeId: 'ai', inputKey: input.key, value })).toThrow(
      WorkflowDiagnosticCodeEnum.inputValueTypeInvalid
    );
  });

  it('accepts unrestricted object schemas and retains explicit field constraints', () => {
    const input = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'systemPrompt')!;
    input.valueType = WorkflowIOValueTypeEnum.object;
    input.renderTypeList = [FlowNodeInputTypeEnum.JSONEditor];
    input.customJsonSchema = { type: 'object' };
    const value = { count: 2, extra: { enabled: true } };

    setInputValue({ document, nodeId: 'ai', inputKey: input.key, value });
    expect(input.value).toEqual(value);

    input.customJsonSchema = {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'number' } }
    };
    for (const invalidValue of [{ count: 'two' }, {}]) {
      expect(() =>
        setInputValue({ document, nodeId: 'ai', inputKey: input.key, value: invalidValue })
      ).toThrow(WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid);
      expect(input.value).toEqual(value);
    }

    setInputValue({ document, nodeId: 'ai', inputKey: input.key, value: { count: 3 } });
    expect(input.value).toEqual({ count: 3 });
  });

  it('validates reference mode, source output and value type', () => {
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: 'maxToken',
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      })
    ).toThrow(WorkflowCommandError);
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: 'userChatInput',
        ref: { nodeId: 'start', outputKey: 'missing' }
      })
    ).toThrow(WorkflowCommandError);
    const fileInput = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'fileUrlList')!;
    fileInput.selectedType = FlowNodeInputTypeEnum.input;
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: 'fileUrlList',
      ref: { nodeId: 'start', outputKey: 'userChatInput' }
    });
    expect(fileInput).toMatchObject({
      value: ['start', 'userChatInput'],
      selectedType: FlowNodeInputTypeEnum.reference
    });

    setInputValue({ document, nodeId: 'ai', inputKey: 'fileUrlList', value: ['manual-value'] });
    expect(fileInput).toMatchObject({
      value: ['manual-value'],
      selectedType: FlowNodeInputTypeEnum.input
    });
    document.chatConfig.variables = [
      {
        key: 'fileUrl',
        label: 'File URL',
        description: '',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: 'fileUrlList',
      ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'fileUrl' }
    });
    expect(document.nodes.find((node) => node.nodeId === 'ai')?.inputs).toContainEqual(
      expect.objectContaining({
        key: 'fileUrlList',
        value: [VARIABLE_NODE_ID, 'fileUrl']
      })
    );
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map(
        (diagnostic) => diagnostic.code
      )
    ).not.toContain(WorkflowDiagnosticCodeEnum.referenceTypeMismatch);
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: 'fileUrlList', value: 'not-an-array' })
    ).toThrow(WorkflowCommandError);
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: 'userChatInput',
        ref: { nodeId: 'ai', outputKey: 'answerText' }
      })
    ).toThrow(WorkflowCommandError);

    expect(
      getAvailableInputReferences({
        document,
        nodeId: 'ai',
        inputKey: 'fileUrlList'
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: { nodeId: 'start', outputKey: 'userChatInput' },
          valueType: WorkflowIOValueTypeEnum.string
        }),
        expect.objectContaining({
          ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'fileUrl' },
          valueType: WorkflowIOValueTypeEnum.string
        })
      ])
    );
  });
});

describe('system variable references', () => {
  it.each([
    ['userId', WorkflowIOValueTypeEnum.string],
    ['appId', WorkflowIOValueTypeEnum.string],
    ['chatId', WorkflowIOValueTypeEnum.string],
    ['responseChatItemId', WorkflowIOValueTypeEnum.string],
    ['histories', WorkflowIOValueTypeEnum.chatHistory],
    ['cTime', WorkflowIOValueTypeEnum.string]
  ])('queries, assigns and validates the runtime variable %s', (key, valueType) => {
    const document = WorkflowDocumentSchema.parse(aiWorkflow);
    const input = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'userChatInput')!;
    input.valueType = valueType as WorkflowIOValueTypeEnum;
    const ref = { nodeId: VARIABLE_NODE_ID, outputKey: key };

    expect(
      getAvailableInputReferences({ document, nodeId: 'ai', inputKey: input.key })
    ).toContainEqual(expect.objectContaining({ ref, valueType }));
    setInputReference({ document, nodeId: 'ai', inputKey: input.key, ref });
    expect(input.value).toEqual([VARIABLE_NODE_ID, key]);
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('uses runtime system types over colliding user variables and rejects invalid references', () => {
    const document = WorkflowDocumentSchema.parse(aiWorkflow);
    document.chatConfig.variables = [
      {
        key: 'chatId',
        label: 'Custom chat ID',
        description: '',
        type: VariableInputEnum.numberInput,
        valueType: WorkflowIOValueTypeEnum.number
      }
    ];
    const input = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'userChatInput')!;
    const refs = getAvailableInputReferences({ document, nodeId: 'ai', inputKey: input.key });
    expect(refs.filter((item) => item.ref.outputKey === 'chatId')).toEqual([
      expect.objectContaining({ valueType: WorkflowIOValueTypeEnum.string })
    ]);
    expect(refs.some((item) => item.ref.outputKey === 'histories')).toBe(false);
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: input.key,
      ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'chatId' }
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);

    for (const [key, error] of [
      ['histories', WorkflowDiagnosticCodeEnum.referenceTypeMismatch],
      ['missing', WorkflowDiagnosticCodeEnum.referenceOutputNotFound]
    ]) {
      expect(() =>
        setInputReference({
          document,
          nodeId: 'ai',
          inputKey: input.key,
          ref: { nodeId: VARIABLE_NODE_ID, outputKey: key }
        })
      ).toThrow(error);
      input.value = [VARIABLE_NODE_ID, key];
      expect(
        validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
      ).toContain(error);
    }
  });
});

describe('container reference scopes', () => {
  /** 使用真实模板创建容器及系统子节点，避免测试绕过实际的容器结构约束。 */
  const createContainerWorkflow = async (templateId: string) => {
    const document = WorkflowDocumentSchema.parse(aiWorkflow);
    const dependencies = { templateProvider: builtinTemplateProvider };
    for (const { nodeId, parentNodeId, template } of [
      { nodeId: 'container', parentNodeId: undefined, template: templateId },
      { nodeId: 'child', parentNodeId: 'container', template: 'ai-chat' }
    ]) {
      await addNodeFromTemplate({
        document,
        nodeId,
        parentNodeId,
        template: { kind: 'builtin', templateId: template },
        dependencies
      });
    }
    document.executionEdges.push(
      { source: { kind: 'next', nodeId: 'ai' }, target: { kind: 'target', nodeId: 'container' } },
      {
        source: { kind: 'next', nodeId: 'container__start' },
        target: { kind: 'target', nodeId: 'child' }
      }
    );
    const container = document.nodes.find((node) => node.nodeId === 'container')!;
    const arrayInput = container.inputs.find(
      (input) =>
        input.key ===
        (templateId === 'loop-run'
          ? NodeInputKeyEnum.loopRunInputArray
          : NodeInputKeyEnum.nestedInputArray)
    )!;
    arrayInput.value = ['start', 'userChatInput'];
    if (templateId === 'parallel-run') {
      // 并行开始输入由运行时注入，测试提供占位值并补齐结束引用，以单独验证作用域。
      document.nodes
        .find((node) => node.nodeId === 'container__start')!
        .inputs.find((input) => input.key === NodeInputKeyEnum.nestedStartInput)!.value = 'item';
      document.nodes
        .find((node) => node.nodeId === 'container__end')!
        .inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput)!.value = [
        'child',
        'answerText'
      ];
      document.executionEdges.push({
        source: { kind: 'next', nodeId: 'child' },
        target: { kind: 'target', nodeId: 'container__end' }
      });
    }
    return document;
  };

  it.each(['loop-run', 'parallel-run'])(
    'inherits parent upstream sources in %s',
    async (templateId) => {
      const document = await createContainerWorkflow(templateId);
      const params = { document, nodeId: 'child', inputKey: 'userChatInput' };
      for (const ref of [
        { nodeId: 'start', outputKey: 'userChatInput' },
        { nodeId: 'ai', outputKey: 'answerText' }
      ]) {
        expect(getAvailableInputReferences(params)).toContainEqual(
          expect.objectContaining({ ref })
        );
        setInputReference({ ...params, ref });
        expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
      }
      expect(() =>
        assertExecutionEdge(document, {
          source: { kind: 'next', nodeId: 'ai' },
          target: { kind: 'target', nodeId: 'child' }
        })
      ).toThrow(WorkflowDiagnosticCodeEnum.edgeCrossScope);
    }
  );

  it('allows only editable container outputs to read children and preserves ordinary upstream references', async () => {
    const document = await createContainerWorkflow('loop-run');
    const container = document.nodes.find((node) => node.nodeId === 'container')!;
    const resultInput = {
      key: 'result',
      label: 'Result',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      canEdit: true
    };
    container.inputs.push(resultInput);
    const params = { document, nodeId: 'container', inputKey: 'result' };
    const ref = { nodeId: 'child', outputKey: 'answerText' };
    expect(getAvailableInputReferences(params)).toContainEqual(expect.objectContaining({ ref }));
    setInputReference({ ...params, ref });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);

    resultInput.canEdit = false;
    expect(
      getAvailableInputReferences({
        document,
        nodeId: 'container',
        inputKey: NodeInputKeyEnum.loopRunInputArray
      })
    ).not.toContainEqual(expect.objectContaining({ ref }));
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream);
    resultInput.canEdit = true;

    await addNodeFromTemplate({
      document,
      nodeId: 'next',
      parentNodeId: 'container',
      template: { kind: 'builtin', templateId: 'ai-chat' },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    document.executionEdges.push({
      source: { kind: 'next', nodeId: 'child' },
      target: { kind: 'target', nodeId: 'next' }
    });
    setInputReference({ document, nodeId: 'next', inputKey: 'userChatInput', ref });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('inherits reference-only parent inputs without exposing other containers or self references', async () => {
    const document = await createContainerWorkflow('loop-run');
    const dependencies = { templateProvider: builtinTemplateProvider };
    await addNodeFromTemplate({
      document,
      nodeId: 'other',
      template: { kind: 'builtin', templateId: 'loop-run' },
      dependencies
    });
    await addNodeFromTemplate({
      document,
      nodeId: 'foreign',
      parentNodeId: 'other',
      template: { kind: 'builtin', templateId: 'ai-chat' },
      dependencies
    });
    await addNodeFromTemplate({
      document,
      nodeId: 'unrelated',
      template: { kind: 'builtin', templateId: 'ai-chat' },
      dependencies
    });
    document.executionEdges = document.executionEdges.filter(
      (edge) => edge.target.nodeId !== 'container'
    );
    const container = document.nodes.find((node) => node.nodeId === 'container')!;
    container.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)!.value = [
      ['ai', 'answerText'],
      ['foreign', 'answerText']
    ];
    const params = { document, nodeId: 'child', inputKey: 'userChatInput' };
    const refs = getAvailableInputReferences(params);
    expect(refs).toContainEqual(
      expect.objectContaining({ ref: { nodeId: 'ai', outputKey: 'answerText' } })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ ref: { nodeId: 'start', outputKey: 'userChatInput' } })
    );
    setInputReference({ ...params, ref: { nodeId: 'ai', outputKey: 'answerText' } });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).filter(
        (item) => item.nodeId === 'child'
      )
    ).toEqual([]);

    for (const sourceNodeId of ['unrelated', 'foreign', 'child']) {
      const ref = { nodeId: sourceNodeId, outputKey: 'answerText' };
      expect(refs).not.toContainEqual(expect.objectContaining({ ref }));
      expect(() => setInputReference({ ...params, ref })).toThrow(
        WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream
      );
      document.nodes
        .find((node) => node.nodeId === 'child')!
        .inputs.find((input) => input.key === 'userChatInput')!.value = [
        sourceNodeId,
        'answerText'
      ];
      expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toContainEqual(
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream,
          nodeId: 'child'
        })
      );
    }
    expect(() =>
      setInputReference({ ...params, ref: { nodeId: 'start', outputKey: 'missing' } })
    ).toThrow(WorkflowDiagnosticCodeEnum.referenceOutputNotFound);
    expect(() =>
      setInputReference({
        document,
        nodeId: 'child',
        inputKey: 'fileUrlList',
        ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'histories' }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.referenceTypeMismatch);
  });
});

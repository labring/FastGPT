import {
  FlowNodeInputTypeEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowCommandError,
  WorkflowDocumentSchema,
  WorkflowIOValueTypeEnum,
  areWorkflowValueTypesCompatible,
  builtinTemplateProvider,
  createWorkflowDocument,
  getAvailableInputReferences,
  instantiateNodeFromTemplate,
  parseNodeTemplateRef,
  setInputReference,
  setInputValue,
  validateWorkflow
} from '../../src';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import { beforeEach, describe, expect, it } from 'vitest';

describe('input mutation services', () => {
  let document: ReturnType<typeof WorkflowDocumentSchema.parse>;

  beforeEach(() => {
    document = WorkflowDocumentSchema.parse(aiWorkflow);
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
    ).toThrow('WORKFLOW_INPUT_MODE_NOT_ALLOWED');
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
    ).toThrow('WORKFLOW_INPUT_MODE_NOT_ALLOWED');
    setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' });

    userInput.renderTypeList = [FlowNodeInputTypeEnum.agentGenerated];
    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: userInput.key, value: 'manual' })
    ).toThrow('WORKFLOW_INPUT_NOT_CONFIGURABLE');
    expect(() =>
      setInputReference({
        document,
        nodeId: 'ai',
        inputKey: userInput.key,
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      })
    ).toThrow('WORKFLOW_INPUT_NOT_CONFIGURABLE');

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
    ).toThrow('WORKFLOW_INPUT_MODE_NOT_ALLOWED');
  });

  it('validates dynamic input customJsonSchema on input.set', () => {
    const promptInput = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'systemPrompt')!;
    promptInput.customJsonSchema = { type: 'string', minLength: 3 };

    expect(() =>
      setInputValue({ document, nodeId: 'ai', inputKey: promptInput.key, value: 'x' })
    ).toThrow('WORKFLOW_INPUT_VALUE_SCHEMA_INVALID');
    setInputValue({ document, nodeId: 'ai', inputKey: promptInput.key, value: 'valid' });
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
    expect(fileInput.renderTypeList[fileInput.selectedTypeIndex!]).toBe(
      FlowNodeInputTypeEnum.reference
    );

    setInputValue({ document, nodeId: 'ai', inputKey: 'fileUrlList', value: ['manual-value'] });
    expect(fileInput).toMatchObject({
      value: ['manual-value'],
      selectedType: FlowNodeInputTypeEnum.input
    });
    expect(fileInput.renderTypeList[fileInput.selectedTypeIndex!]).toBe(
      FlowNodeInputTypeEnum.input
    );
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
    expect(validateWorkflow(document).map((diagnostic) => diagnostic.code)).not.toContain(
      'WORKFLOW_REFERENCE_TYPE_MISMATCH'
    );
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

describe('areWorkflowValueTypesCompatible', () => {
  it('accepts scalar items for array references without widening reverse types', () => {
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.arrayString,
        actual: WorkflowIOValueTypeEnum.string
      })
    ).toBe(true);
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.arrayString,
        actual: WorkflowIOValueTypeEnum.string
      })
    ).toBe(true);
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.arrayString,
        actual: WorkflowIOValueTypeEnum.arrayString
      })
    ).toBe(true);
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.arrayString,
        actual: WorkflowIOValueTypeEnum.number
      })
    ).toBe(false);
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.string,
        actual: WorkflowIOValueTypeEnum.arrayString
      })
    ).toBe(false);
    expect(
      areWorkflowValueTypesCompatible({
        expected: WorkflowIOValueTypeEnum.arrayAny,
        actual: WorkflowIOValueTypeEnum.string
      })
    ).toBe(true);
  });
});

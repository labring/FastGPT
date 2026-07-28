import {
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowCommandError,
  WorkflowDocumentSchema,
  WorkflowIOValueTypeEnum,
  areWorkflowValueTypesCompatible,
  getAvailableInputReferences,
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
      setInputValue({ document, nodeId: 'ai', inputKey: 'maxToken', value: '100' })
    ).toThrow(WorkflowCommandError);
    setInputValue({ document, nodeId: 'ai', inputKey: 'maxToken', value: 100 });
    expect(
      document.nodes
        .find((node) => node.nodeId === 'ai')!
        .inputs.find((input) => input.key === 'maxToken')?.value
    ).toBe(100);
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
    setInputReference({
      document,
      nodeId: 'ai',
      inputKey: 'fileUrlList',
      ref: { nodeId: 'start', outputKey: 'userChatInput' }
    });
    expect(document.nodes.find((node) => node.nodeId === 'ai')?.inputs).toContainEqual(
      expect.objectContaining({
        key: 'fileUrlList',
        value: ['start', 'userChatInput']
      })
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

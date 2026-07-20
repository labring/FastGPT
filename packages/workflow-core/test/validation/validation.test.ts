import {
  VARIABLE_NODE_ID,
  FlowNodeInputTypeEnum,
  VariableInputEnum,
  WorkflowDocumentSchema,
  WorkflowIOValueTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  parseNodeTemplateRef,
  type WorkflowDocument,
  validateWorkflow
} from '../../src';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import staticWorkflow from '../fixtures/basic-static/workflow.json';
import commonLinearWorkflow from '../fixtures/common-linear/workflow.json';
import { describe, expect, it } from 'vitest';

describe('validateWorkflow', () => {
  it.each([aiWorkflow, staticWorkflow, commonLinearWorkflow])(
    'accepts a golden workflow',
    (workflow) => {
      expect(validateWorkflow(WorkflowDocumentSchema.parse(workflow))).toEqual([]);
    }
  );

  it('reports duplicate IDs, missing start, unreachable nodes and required inputs', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(staticWorkflow));
    broken.nodes = broken.nodes.filter((node) => node.nodeId !== 'start');
    broken.nodes[0].inputs[0].value = undefined;
    broken.nodes.push({ ...broken.nodes[0], nodeId: broken.nodes[0].nodeId });
    broken.executionEdges = [];
    const codes = validateWorkflow(broken).map((item) => item.code);
    expect(codes).toContain('WORKFLOW_NODE_ID_DUPLICATED');
    expect(codes).toContain('WORKFLOW_START_COUNT_INVALID');
    expect(codes).toContain('WORKFLOW_REQUIRED_INPUT_MISSING');
  });

  it('reports malformed and non-upstream references', () => {
    const malformed: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(aiWorkflow));
    const input = malformed.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((item) => item.key === 'userChatInput')!;
    input.value = ['missing'];
    expect(validateWorkflow(malformed).map((item) => item.code)).toContain(
      'WORKFLOW_REFERENCE_FORMAT_INVALID'
    );

    input.value = ['ai', 'answerText'];
    expect(validateWorkflow(malformed).map((item) => item.code)).toContain(
      'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM'
    );
  });

  it('accepts missing external bindings and aggregate Start references', async () => {
    const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
    const start = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    });
    const search = await applyWorkflowCommand({
      document: start.document,
      command: {
        type: 'node.add',
        nodeId: 'search',
        template: parseNodeTemplateRef('builtin:dataset-search'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      },
      dependencies
    });

    expect(validateWorkflow(search.document)).toEqual([]);
  });

  it('returns schema diagnostics instead of throwing', () => {
    expect(validateWorkflow({ schemaVersion: 'wrong' } as never)[0]?.code).toBe(
      'WORKFLOW_SCHEMA_INVALID'
    );
  });

  it('reports duplicate and invalid execution edges', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(aiWorkflow));
    broken.executionEdges.push(structuredClone(broken.executionEdges[0]));
    broken.executionEdges.push({
      source: { kind: 'next', nodeId: 'missing' },
      target: { kind: 'target', nodeId: 'ai' }
    });
    const codes = validateWorkflow(broken).map((item) => item.code);
    expect(codes).toContain('WORKFLOW_EDGE_DUPLICATED');
    expect(codes).toContain('WORKFLOW_EDGE_INVALID');
  });

  it('validates global references, reference types and deleted relation leftovers', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(staticWorkflow));
    broken.chatConfig.variables = [
      {
        key: 'count',
        label: 'Count',
        description: 'Counter',
        type: VariableInputEnum.numberInput,
        valueType: WorkflowIOValueTypeEnum.number
      }
    ];
    const answer = broken.nodes.find((node) => node.nodeId === 'answer')!;
    answer.parentNodeId = 'deleted-parent';
    const textInput = broken.nodes.find((node) => node.nodeId === 'text')!.inputs[0];
    textInput.renderTypeList.push(FlowNodeInputTypeEnum.reference);
    textInput.value = [VARIABLE_NODE_ID, 'count'];
    textInput.selectedTypeIndex = textInput.renderTypeList.indexOf(FlowNodeInputTypeEnum.reference);
    const codes = validateWorkflow(broken).map((item) => item.code);
    expect(codes).toContain('WORKFLOW_PARENT_NODE_NOT_FOUND');
    expect(codes).toContain('WORKFLOW_REFERENCE_TYPE_MISMATCH');

    textInput.value = [VARIABLE_NODE_ID, 'deleted-variable'];
    expect(validateWorkflow(broken).map((item) => item.code)).toContain(
      'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND'
    );
  });
});

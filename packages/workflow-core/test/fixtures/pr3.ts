import {
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  FlowNodeOutputTypeEnum,
  parseNodeTemplateRef,
  WorkflowIOValueTypeEnum,
  type WorkflowCommand,
  type WorkflowDocument
} from '../../src';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

const apply = async (document: WorkflowDocument, command: WorkflowCommand) =>
  (await applyWorkflowCommand({ document, command, dependencies })).document;

const addStart = () =>
  apply(createWorkflowDocument(), {
    type: 'node.add',
    nodeId: 'start',
    template: parseNodeTemplateRef('builtin:workflow-start')
  });

const addAnswer = async ({
  document,
  nodeId,
  source
}: {
  document: WorkflowDocument;
  nodeId: string;
  source: WorkflowCommand & { type: 'edge.connect' };
}) => {
  let next = await apply(document, {
    type: 'node.add',
    nodeId,
    template: parseNodeTemplateRef('builtin:assigned-answer')
  });
  next = await apply(next, source);
  return apply(next, {
    type: 'input.set',
    nodeId,
    inputKey: NodeInputKeyEnum.answerText,
    value: nodeId
  });
};

export const createBranchingFixture = async () => {
  let document = await addStart();
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'route',
    template: parseNodeTemplateRef('builtin:if-else'),
    connectFrom: { kind: 'next', nodeId: 'start' }
  });
  document = await apply(document, {
    type: 'input.set',
    nodeId: 'route',
    inputKey: NodeInputKeyEnum.ifElseList,
    value: [
      {
        branchId: 'positive',
        condition: 'AND',
        list: [
          {
            variable: ['start', 'userChatInput'],
            condition: VariableConditionEnum.isNotEmpty,
            valueType: 'input'
          }
        ]
      }
    ]
  });
  document = await addAnswer({
    document,
    nodeId: 'yes',
    source: {
      type: 'edge.connect',
      edge: {
        source: { kind: 'branch', nodeId: 'route', branchKey: 'positive' },
        target: { kind: 'target', nodeId: 'yes' }
      }
    }
  });
  return addAnswer({
    document,
    nodeId: 'fallback',
    source: {
      type: 'edge.connect',
      edge: {
        source: { kind: 'branch', nodeId: 'route', branchKey: 'ELSE' },
        target: { kind: 'target', nodeId: 'fallback' }
      }
    }
  });
};

export const createToolCallToolsFixture = async () => {
  let document = await addStart();
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'caller',
    template: parseNodeTemplateRef('builtin:tool-call'),
    connectFrom: { kind: 'next', nodeId: 'start' }
  });
  return apply(document, {
    type: 'tool.attach',
    toolCallNodeId: 'caller',
    template: parseNodeTemplateRef('builtin:user-select'),
    newNodeId: 'confirm'
  });
};

export const createNestedLoopFixture = async () => {
  let document = await addStart();
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'loop',
    template: parseNodeTemplateRef('builtin:loop-run'),
    connectFrom: { kind: 'next', nodeId: 'start' }
  });
  document = await apply(document, {
    type: 'input.set',
    nodeId: 'loop',
    inputKey: NodeInputKeyEnum.loopRunMode,
    value: LoopRunModeEnum.conditional
  });
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'break',
    template: parseNodeTemplateRef('builtin:loop-run-break'),
    parentNodeId: 'loop'
  });
  return apply(document, {
    type: 'edge.connect',
    edge: {
      source: { kind: 'next', nodeId: 'loop__start' },
      target: { kind: 'target', nodeId: 'break' }
    }
  });
};

export const createDynamicIoCatchFixture = async () => {
  let document = await addStart();
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'code',
    template: parseNodeTemplateRef('builtin:code'),
    connectFrom: { kind: 'next', nodeId: 'start' }
  });
  document = await apply(document, {
    type: 'node.update',
    nodeId: 'code',
    catchError: true
  });
  for (const inputKey of ['data1', 'data2']) {
    document = await apply(document, {
      type: 'input.ref',
      nodeId: 'code',
      inputKey,
      ref: { nodeId: 'start', outputKey: 'userChatInput' }
    });
  }
  document = await apply(document, {
    type: 'output.add',
    nodeId: 'code',
    output: {
      id: 'score',
      key: 'score',
      label: 'Score',
      type: FlowNodeOutputTypeEnum.dynamic,
      valueType: WorkflowIOValueTypeEnum.number
    }
  });
  return addAnswer({
    document,
    nodeId: 'recover',
    source: {
      type: 'edge.connect',
      edge: {
        source: { kind: 'catch', nodeId: 'code' },
        target: { kind: 'target', nodeId: 'recover' }
      }
    }
  });
};

export const pr3FixtureFactories = {
  branching: createBranchingFixture,
  'tool-call-tools': createToolCallToolsFixture,
  'nested-loop': createNestedLoopFixture,
  'dynamic-io-catch': createDynamicIoCatchFixture
};

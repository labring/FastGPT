import { describe, expect, it } from 'vitest';
import {
  extractDeepestInteractive,
  getMaxHistoryLimitFromNodes,
  valueTypeFormat,
  getLastInteractiveValue,
  storeEdges2RuntimeEdges,
  getWorkflowEntryNodeIds,
  storeNodes2RuntimeNodes,
  filterWorkflowEdges,
  checkNodeRunStatus,
  getReferenceVariableValue,
  formatVariableValByType,
  replaceEditorVariable,
  textAdaptGptResponse,
  rewriteNodeOutputByHistories
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  RuntimeEdgeItemType,
  StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';

describe('extractDeepestInteractive', () => {
  it('should return the same interactive when no childrenResponse', () => {
    const interactive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'test',
        userSelectOptions: []
      }
    } as WorkflowInteractiveResponseType;

    const result = extractDeepestInteractive(interactive);
    expect(result).toBe(interactive);
  });

  it('should extract deepest interactive from nested childrenResponse', () => {
    const deepest = {
      type: 'userInput',
      entryNodeIds: ['node3'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'deepest',
        inputForm: [],
        submitted: false
      }
    } as WorkflowInteractiveResponseType;

    const nested = {
      type: 'childrenInteractive',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        childrenResponse: deepest
      }
    } as WorkflowInteractiveResponseType;

    const result = extractDeepestInteractive(nested);
    expect(result).toBe(deepest);
  });

  it('should handle multiple levels of nesting', () => {
    const level3 = {
      type: 'userSelect',
      entryNodeIds: ['node3'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'level3',
        userSelectOptions: []
      }
    } as WorkflowInteractiveResponseType;

    const level2 = {
      type: 'loopInteractive',
      entryNodeIds: ['node2'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        loopResult: [],
        childrenResponse: level3,
        currentIndex: 0
      }
    } as WorkflowInteractiveResponseType;

    const level1 = {
      type: 'childrenInteractive',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        childrenResponse: level2
      }
    } as WorkflowInteractiveResponseType;

    const result = extractDeepestInteractive(level1);
    expect(result).toBe(level3);
  });
});

describe('getMaxHistoryLimitFromNodes', () => {
  it('should return default limit 20 when no history inputs', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    expect(getMaxHistoryLimitFromNodes(nodes)).toBe(20);
  });

  it('should return double of max history value', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [{ key: NodeInputKeyEnum.history, label: '', renderTypeList: [], value: 15 }],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    expect(getMaxHistoryLimitFromNodes(nodes)).toBe(30);
  });

  it('should handle historyMaxAmount key', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          { key: NodeInputKeyEnum.historyMaxAmount, label: '', renderTypeList: [], value: 25 }
        ],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    expect(getMaxHistoryLimitFromNodes(nodes)).toBe(50);
  });

  it('should return max value from multiple nodes', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [{ key: NodeInputKeyEnum.history, label: '', renderTypeList: [], value: 5 }],
        outputs: [],
        position: { x: 0, y: 0 }
      },
      {
        nodeId: 'node2',
        name: 'test2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          { key: NodeInputKeyEnum.historyMaxAmount, label: '', renderTypeList: [], value: 30 }
        ],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    expect(getMaxHistoryLimitFromNodes(nodes)).toBe(60);
  });

  it('should ignore non-number values', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          { key: NodeInputKeyEnum.history, label: '', renderTypeList: [], value: 'invalid' }
        ],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    expect(getMaxHistoryLimitFromNodes(nodes)).toBe(20);
  });
});

describe('valueTypeFormat', () => {
  it('should return undefined/null as is', () => {
    expect(valueTypeFormat(undefined, WorkflowIOValueTypeEnum.string)).toBe(undefined);
    expect(valueTypeFormat(null, WorkflowIOValueTypeEnum.string)).toBe(null);
  });

  it('should return value as is when no valueType or any type', () => {
    expect(valueTypeFormat('test')).toBe('test');
    expect(valueTypeFormat('test', WorkflowIOValueTypeEnum.any)).toBe('test');
  });

  it('should return secret value as is for string type', () => {
    const secretVal = { secret: true, value: 'password' };
    expect(valueTypeFormat(secretVal, WorkflowIOValueTypeEnum.string)).toBe(secretVal);
  });

  it('should return value when already matches target type', () => {
    expect(valueTypeFormat('hello', WorkflowIOValueTypeEnum.string)).toBe('hello');
    expect(valueTypeFormat(123, WorkflowIOValueTypeEnum.number)).toBe(123);
    expect(valueTypeFormat(true, WorkflowIOValueTypeEnum.boolean)).toBe(true);
    expect(valueTypeFormat([1, 2], WorkflowIOValueTypeEnum.arrayNumber)).toEqual([1, 2]);
    expect(valueTypeFormat({ a: 1 }, WorkflowIOValueTypeEnum.object)).toEqual({ a: 1 });
  });

  it('should handle chatHistory type', () => {
    expect(
      valueTypeFormat([{ obj: 'Human', value: 'hi' }], WorkflowIOValueTypeEnum.chatHistory)
    ).toEqual([{ obj: 'Human', value: 'hi' }]);
    expect(valueTypeFormat(5, WorkflowIOValueTypeEnum.chatHistory)).toBe(5);
  });

  it('should convert to string type', () => {
    expect(valueTypeFormat(123, WorkflowIOValueTypeEnum.string)).toBe('123');
    expect(valueTypeFormat({ a: 1 }, WorkflowIOValueTypeEnum.string)).toBe('{"a":1}');
    expect(valueTypeFormat(true, WorkflowIOValueTypeEnum.string)).toBe('true');
  });

  it('should convert to number type', () => {
    expect(valueTypeFormat('123', WorkflowIOValueTypeEnum.number)).toBe(123);
    expect(valueTypeFormat('', WorkflowIOValueTypeEnum.number)).toBe(null);
    expect(valueTypeFormat('3.14', WorkflowIOValueTypeEnum.number)).toBe(3.14);
  });

  it('should convert to boolean type', () => {
    expect(valueTypeFormat('true', WorkflowIOValueTypeEnum.boolean)).toBe(true);
    expect(valueTypeFormat('TRUE', WorkflowIOValueTypeEnum.boolean)).toBe(true);
    expect(valueTypeFormat('false', WorkflowIOValueTypeEnum.boolean)).toBe(false);
    expect(valueTypeFormat(1, WorkflowIOValueTypeEnum.boolean)).toBe(true);
    expect(valueTypeFormat(0, WorkflowIOValueTypeEnum.boolean)).toBe(false);
  });

  it('should convert string to object type', () => {
    expect(valueTypeFormat('{"a":1}', WorkflowIOValueTypeEnum.object)).toEqual({ a: 1 });
    expect(valueTypeFormat('  {"b":2}  ', WorkflowIOValueTypeEnum.object)).toEqual({ b: 2 });
    expect(valueTypeFormat('invalid', WorkflowIOValueTypeEnum.object)).toEqual({});
    expect(valueTypeFormat('true', WorkflowIOValueTypeEnum.object)).toEqual({});
    expect(valueTypeFormat('false', WorkflowIOValueTypeEnum.object)).toEqual({});
  });

  it('should convert to array type', () => {
    expect(valueTypeFormat('[1,2,3]', WorkflowIOValueTypeEnum.arrayNumber)).toEqual([1, 2, 3]);
    expect(valueTypeFormat('["a","b"]', WorkflowIOValueTypeEnum.arrayString)).toEqual(['a', 'b']);
    expect(valueTypeFormat('single', WorkflowIOValueTypeEnum.arrayString)).toEqual(['single']);
    expect(valueTypeFormat('invalid{', WorkflowIOValueTypeEnum.arrayString)).toEqual(['invalid{']);
  });

  it('should handle special types (datasetQuote, selectDataset, selectApp)', () => {
    expect(valueTypeFormat('[{"id":"1"}]', WorkflowIOValueTypeEnum.datasetQuote)).toEqual([
      { id: '1' }
    ]);
    expect(valueTypeFormat('invalid', WorkflowIOValueTypeEnum.datasetQuote)).toEqual([]);
    expect(valueTypeFormat('[{"datasetId":"1"}]', WorkflowIOValueTypeEnum.selectDataset)).toEqual([
      { datasetId: '1' }
    ]);
    expect(valueTypeFormat('invalid', WorkflowIOValueTypeEnum.selectDataset)).toEqual([]);
    expect(valueTypeFormat('{"appId":"1"}', WorkflowIOValueTypeEnum.selectApp)).toEqual({
      appId: '1'
    });
    expect(valueTypeFormat('invalid', WorkflowIOValueTypeEnum.selectApp)).toEqual([]);
  });

  it('should handle chatHistory conversion from string', () => {
    expect(
      valueTypeFormat('[{"obj":"Human","value":"hi"}]', WorkflowIOValueTypeEnum.chatHistory)
    ).toEqual([{ obj: 'Human', value: 'hi' }]);
    expect(valueTypeFormat('invalid', WorkflowIOValueTypeEnum.chatHistory)).toEqual([]);
  });
});

describe('getLastInteractiveValue', () => {
  it('should return undefined when no AI message', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'hello' } }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return undefined when AI message has no interactive', () => {
    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' } }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return interactive for childrenInteractive type', () => {
    const interactive = {
      type: 'childrenInteractive',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: { childrenResponse: {} }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return interactive for userSelect without selection', () => {
    const interactive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Choose one',
        userSelectOptions: [{ key: 'a', value: 'A' }]
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return undefined for userSelect with selection', () => {
    const interactive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Choose one',
        userSelectOptions: [{ key: 'a', value: 'A' }],
        userSelectedVal: 'A'
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return interactive for userInput without submission', () => {
    const interactive = {
      type: 'userInput',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Enter info',
        inputForm: []
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return undefined for userInput with submission', () => {
    const interactive = {
      type: 'userInput',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Enter info',
        inputForm: [],
        submitted: true
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return interactive for paymentPause without continue', () => {
    const interactive = {
      type: 'paymentPause',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Payment required'
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return undefined for paymentPause with continue', () => {
    const interactive = {
      type: 'paymentPause',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Payment required',
        continue: true
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return interactive for agentPlanCheck without confirmation', () => {
    const interactive = {
      type: 'agentPlanCheck',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {}
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return undefined for agentPlanCheck with confirmation', () => {
    const interactive = {
      type: 'agentPlanCheck',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: { confirmed: true }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBeUndefined();
  });

  it('should return interactive for agentPlanAskQuery', () => {
    const interactive = {
      type: 'agentPlanAskQuery',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: { content: 'What do you want?' }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return interactive for agentPlanAskUserSelect without selection', () => {
    const interactive = {
      type: 'agentPlanAskUserSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Choose',
        userSelectOptions: []
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });

  it('should return interactive for agentPlanAskUserForm without submission', () => {
    const interactive = {
      type: 'agentPlanAskUserForm',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Fill form',
        inputForm: []
      }
    } as WorkflowInteractiveResponseType;

    const histories: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'response' }, interactive }]
      }
    ];
    expect(getLastInteractiveValue(histories)).toBe(interactive);
  });
});

describe('storeEdges2RuntimeEdges', () => {
  it('should convert store edges to runtime edges with waiting status', () => {
    const edges: StoreEdgeItemType[] = [
      { source: 'node1', sourceHandle: 'out1', target: 'node2', targetHandle: 'in1' }
    ];
    const result = storeEdges2RuntimeEdges(edges);
    expect(result).toEqual([
      {
        source: 'node1',
        sourceHandle: 'out1',
        target: 'node2',
        targetHandle: 'in1',
        status: 'waiting'
      }
    ]);
  });

  it('should return memory edges from lastInteractive if available', () => {
    const edges: StoreEdgeItemType[] = [
      { source: 'node1', sourceHandle: 'out1', target: 'node2', targetHandle: 'in1' }
    ];
    const memoryEdges: RuntimeEdgeItemType[] = [
      {
        source: 'node3',
        sourceHandle: 'out3',
        target: 'node4',
        targetHandle: 'in4',
        status: 'active'
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node3'],
      memoryEdges,
      nodeOutputs: [],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = storeEdges2RuntimeEdges(edges, lastInteractive);
    expect(result).toBe(memoryEdges);
  });

  it('should return converted edges when lastInteractive has empty memoryEdges', () => {
    const edges: StoreEdgeItemType[] = [
      { source: 'node1', sourceHandle: 'out1', target: 'node2', targetHandle: 'in1' }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = storeEdges2RuntimeEdges(edges, lastInteractive);
    expect(result).toEqual([
      {
        source: 'node1',
        sourceHandle: 'out1',
        target: 'node2',
        targetHandle: 'in1',
        status: 'waiting'
      }
    ]);
  });

  it('should handle undefined edges', () => {
    const result = storeEdges2RuntimeEdges(undefined as any);
    expect(result).toEqual([]);
  });
});

describe('getWorkflowEntryNodeIds', () => {
  it('should return entry node ids from lastInteractive if available', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: []
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node2', 'node3'],
      memoryEdges: [],
      nodeOutputs: [],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = getWorkflowEntryNodeIds(nodes, lastInteractive);
    expect(result).toEqual(['node2', 'node3']);
  });

  it('should return systemConfig node ids', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'config1',
        name: 'config',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'chat1',
        name: 'chat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: []
      }
    ];
    const result = getWorkflowEntryNodeIds(nodes);
    expect(result).toEqual(['config1']);
  });

  it('should return workflowStart node ids', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'start1',
        name: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'chat1',
        name: 'chat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: []
      }
    ];
    const result = getWorkflowEntryNodeIds(nodes);
    expect(result).toEqual(['start1']);
  });

  it('should return pluginInput node ids', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'plugin1',
        name: 'plugin',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'chat1',
        name: 'chat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: []
      }
    ];
    const result = getWorkflowEntryNodeIds(nodes);
    expect(result).toEqual(['plugin1']);
  });

  it('should return tool node ids when no entry nodes exist', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'tool1',
        name: 'tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'chat1',
        name: 'chat',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: []
      }
    ];
    const result = getWorkflowEntryNodeIds(nodes);
    expect(result).toEqual(['tool1']);
  });

  it('should not return tool node when entry nodes exist', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'start1',
        name: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'tool1',
        name: 'tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        inputs: [],
        outputs: []
      }
    ];
    const result = getWorkflowEntryNodeIds(nodes);
    expect(result).toEqual(['start1']);
  });
});

describe('storeNodes2RuntimeNodes', () => {
  it('should convert store nodes to runtime nodes', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'Test Node',
        avatar: 'avatar.png',
        intro: 'Test intro',
        toolDescription: 'Tool desc',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        inputs: [{ key: 'input1', label: '', renderTypeList: [], value: 'val1' }],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'val2' }
        ],
        pluginId: 'plugin1',
        version: '1.0',
        toolConfig: { mcpTool: { toolId: 'test-tool' } },
        catchError: true,
        position: { x: 0, y: 0 }
      }
    ];
    const entryNodeIds = ['node1'];

    const result = storeNodes2RuntimeNodes(nodes, entryNodeIds);
    expect(result).toEqual([
      {
        nodeId: 'node1',
        name: 'Test Node',
        avatar: 'avatar.png',
        intro: 'Test intro',
        toolDescription: 'Tool desc',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showStatus: true,
        isEntry: true,
        inputs: [{ key: 'input1', label: '', renderTypeList: [], value: 'val1' }],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'val2' }
        ],
        pluginId: 'plugin1',
        version: '1.0',
        toolConfig: { mcpTool: { toolId: 'test-tool' } },
        catchError: true
      }
    ]);
  });

  it('should set isEntry false for non-entry nodes', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'Test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [],
        position: { x: 0, y: 0 }
      }
    ];
    const result = storeNodes2RuntimeNodes(nodes, ['other']);
    expect(result[0].isEntry).toBe(false);
  });
});

describe('filterWorkflowEdges', () => {
  it('should filter out edges with selectedTools handle', () => {
    const edges: RuntimeEdgeItemType[] = [
      { source: 'n1', sourceHandle: 'out1', target: 'n2', targetHandle: 'in1', status: 'waiting' },
      {
        source: 'n1',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        target: 'n2',
        targetHandle: 'in2',
        status: 'waiting'
      },
      {
        source: 'n1',
        sourceHandle: 'out2',
        target: 'n2',
        targetHandle: NodeOutputKeyEnum.selectedTools,
        status: 'waiting'
      }
    ];
    const result = filterWorkflowEdges(edges);
    expect(result).toEqual([
      { source: 'n1', sourceHandle: 'out1', target: 'n2', targetHandle: 'in1', status: 'waiting' }
    ]);
  });

  it('should return all edges when no selectedTools handles', () => {
    const edges: RuntimeEdgeItemType[] = [
      { source: 'n1', sourceHandle: 'out1', target: 'n2', targetHandle: 'in1', status: 'waiting' },
      { source: 'n2', sourceHandle: 'out2', target: 'n3', targetHandle: 'in2', status: 'active' }
    ];
    const result = filterWorkflowEdges(edges);
    expect(result).toEqual(edges);
  });
});

describe('checkNodeRunStatus', () => {
  const createNode = (nodeId: string, flowNodeType: string): RuntimeNodeItemType => ({
    nodeId,
    name: nodeId,
    flowNodeType: flowNodeType as any,
    inputs: [],
    outputs: []
  });

  it('should return run for entry node with no incoming edges', () => {
    const node = createNode('node1', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([['node1', node]]);
    const result = checkNodeRunStatus({ nodesMap, node, runtimeEdges: [] });
    expect(result).toBe('run');
  });

  it('should return run when common edges have active status and no waiting', () => {
    const startNode = createNode('start', FlowNodeTypeEnum.workflowStart);
    const targetNode = createNode('target', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([
      ['start', startNode],
      ['target', targetNode]
    ]);
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'start',
        sourceHandle: 'out',
        target: 'target',
        targetHandle: 'in',
        status: 'active'
      }
    ];
    const result = checkNodeRunStatus({ nodesMap, node: targetNode, runtimeEdges: edges });
    expect(result).toBe('run');
  });

  it('should return wait when edges are waiting', () => {
    const startNode = createNode('start', FlowNodeTypeEnum.workflowStart);
    const targetNode = createNode('target', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([
      ['start', startNode],
      ['target', targetNode]
    ]);
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'start',
        sourceHandle: 'out',
        target: 'target',
        targetHandle: 'in',
        status: 'waiting'
      }
    ];
    const result = checkNodeRunStatus({ nodesMap, node: targetNode, runtimeEdges: edges });
    expect(result).toBe('wait');
  });

  it('should return skip when all common edges are skipped', () => {
    const startNode = createNode('start', FlowNodeTypeEnum.workflowStart);
    const targetNode = createNode('target', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([
      ['start', startNode],
      ['target', targetNode]
    ]);
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'start',
        sourceHandle: 'out',
        target: 'target',
        targetHandle: 'in',
        status: 'skipped'
      }
    ];
    const result = checkNodeRunStatus({ nodesMap, node: targetNode, runtimeEdges: edges });
    expect(result).toBe('skip');
  });

  it('should handle selectedTools edge as common edge', () => {
    const startNode = createNode('start', FlowNodeTypeEnum.workflowStart);
    const targetNode = createNode('target', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([
      ['start', startNode],
      ['target', targetNode]
    ]);
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'start',
        sourceHandle: 'selectedTools',
        target: 'target',
        targetHandle: 'in',
        status: 'active'
      }
    ];
    const result = checkNodeRunStatus({ nodesMap, node: targetNode, runtimeEdges: edges });
    expect(result).toBe('run');
  });

  it('should handle recursive edges', () => {
    const loopStartNode = createNode('loopStart', FlowNodeTypeEnum.loopStart);
    const middleNode = createNode('middle', FlowNodeTypeEnum.chatNode);
    const targetNode = createNode('target', FlowNodeTypeEnum.chatNode);
    const nodesMap = new Map([
      ['loopStart', loopStartNode],
      ['middle', middleNode],
      ['target', targetNode]
    ]);
    const edges: RuntimeEdgeItemType[] = [
      {
        source: 'loopStart',
        sourceHandle: 'out',
        target: 'middle',
        targetHandle: 'in',
        status: 'active'
      },
      {
        source: 'middle',
        sourceHandle: 'out',
        target: 'target',
        targetHandle: 'in',
        status: 'active'
      },
      {
        source: 'target',
        sourceHandle: 'out',
        target: 'middle',
        targetHandle: 'in2',
        status: 'waiting'
      }
    ];
    const result = checkNodeRunStatus({ nodesMap, node: middleNode, runtimeEdges: edges });
    expect(result).toBe('run');
  });
});

describe('getReferenceVariableValue', () => {
  it('should return undefined for undefined value', () => {
    expect(
      getReferenceVariableValue({ value: undefined, nodes: [], variables: {} })
    ).toBeUndefined();
  });

  it('should return variable value for VARIABLE_NODE_ID reference', () => {
    const result = getReferenceVariableValue({
      value: [VARIABLE_NODE_ID, 'myVar'],
      nodes: [],
      variables: { myVar: 'hello' }
    });
    expect(result).toBe('hello');
  });

  it('should return undefined for VARIABLE_NODE_ID with empty outputId', () => {
    const result = getReferenceVariableValue({
      value: [VARIABLE_NODE_ID, ''],
      nodes: [],
      variables: { myVar: 'hello' }
    });
    expect(result).toBeUndefined();
  });

  it('should return node output value', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'outputValue' }
        ]
      }
    ];
    const result = getReferenceVariableValue({
      value: ['node1', 'out1'],
      nodes,
      variables: {}
    });
    expect(result).toBe('outputValue');
  });

  it('should return original value when node not found', () => {
    const result = getReferenceVariableValue({
      value: ['nonexistent', 'out1'],
      nodes: [],
      variables: {}
    });
    expect(result).toEqual(['nonexistent', 'out1']);
  });

  it('should handle array of references', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'value1' }
        ]
      },
      {
        nodeId: 'node2',
        name: 'test2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out2', key: 'output2', type: FlowNodeOutputTypeEnum.static, value: 'value2' }
        ]
      }
    ];
    const result = getReferenceVariableValue({
      value: [
        ['node1', 'out1'],
        ['node2', 'out2']
      ],
      nodes,
      variables: {}
    });
    expect(result).toEqual(['value1', 'value2']);
  });

  it('should filter undefined values from array result', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'value1' }
        ]
      }
    ];
    const result = getReferenceVariableValue({
      value: [
        ['node1', 'out1'],
        ['node1', 'nonexistent']
      ],
      nodes,
      variables: {}
    });
    expect(result).toEqual(['value1']);
  });
});

describe('formatVariableValByType', () => {
  it('should return value as is when no valueType', () => {
    expect(formatVariableValByType('test')).toBe('test');
  });

  it('should return undefined for null/undefined values', () => {
    expect(formatVariableValByType(null, WorkflowIOValueTypeEnum.string)).toBeUndefined();
    expect(formatVariableValByType(undefined, WorkflowIOValueTypeEnum.string)).toBeUndefined();
  });

  it('should return undefined for array type mismatch', () => {
    expect(
      formatVariableValByType('not array', WorkflowIOValueTypeEnum.arrayString)
    ).toBeUndefined();
  });

  it('should convert to boolean', () => {
    expect(formatVariableValByType(1, WorkflowIOValueTypeEnum.boolean)).toBe(true);
    expect(formatVariableValByType(0, WorkflowIOValueTypeEnum.boolean)).toBe(false);
    expect(formatVariableValByType('', WorkflowIOValueTypeEnum.boolean)).toBe(false);
  });

  it('should convert to number', () => {
    expect(formatVariableValByType('123', WorkflowIOValueTypeEnum.number)).toBe(123);
    expect(formatVariableValByType('3.14', WorkflowIOValueTypeEnum.number)).toBe(3.14);
  });

  it('should convert to string', () => {
    expect(formatVariableValByType(123, WorkflowIOValueTypeEnum.string)).toBe('123');
    expect(formatVariableValByType({ a: 1 }, WorkflowIOValueTypeEnum.string)).toBe('{"a":1}');
  });

  it('should return undefined for object type with non-object value', () => {
    expect(formatVariableValByType('string', WorkflowIOValueTypeEnum.object)).toBeUndefined();
    expect(formatVariableValByType('string', WorkflowIOValueTypeEnum.datasetQuote)).toBeUndefined();
    expect(formatVariableValByType('string', WorkflowIOValueTypeEnum.selectApp)).toBeUndefined();
    expect(
      formatVariableValByType('string', WorkflowIOValueTypeEnum.selectDataset)
    ).toBeUndefined();
  });

  it('should return object value as is for object types', () => {
    const obj = { a: 1 };
    expect(formatVariableValByType(obj, WorkflowIOValueTypeEnum.object)).toBe(obj);
    expect(formatVariableValByType(obj, WorkflowIOValueTypeEnum.datasetQuote)).toBe(obj);
  });
});

describe('replaceEditorVariable', () => {
  it('should return non-string values as is', () => {
    expect(replaceEditorVariable({ text: 123, nodes: [], variables: {} })).toBe(123);
    expect(replaceEditorVariable({ text: null, nodes: [], variables: {} })).toBe(null);
  });

  it('should return empty string as is', () => {
    expect(replaceEditorVariable({ text: '', nodes: [], variables: {} })).toBe('');
  });

  it('should replace global variables', () => {
    const result = replaceEditorVariable({
      text: 'Hello {{name}}',
      nodes: [],
      variables: { name: 'World' }
    });
    expect(result).toBe('Hello World');
  });

  it('should replace node output variables', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: 'outputValue',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    ];
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodes,
      variables: {}
    });
    expect(result).toBe('Result: outputValue');
  });

  it('should replace VARIABLE_NODE_ID variables', () => {
    const result = replaceEditorVariable({
      text: `Value: {{$${VARIABLE_NODE_ID}.myVar$}}`,
      nodes: [],
      variables: { myVar: 'varValue' }
    });
    expect(result).toBe('Value: varValue');
  });

  it('should handle nested variable replacement', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: '{{$node2.out2$}}',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      {
        nodeId: 'node2',
        name: 'test2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out2',
            key: 'output2',
            type: FlowNodeOutputTypeEnum.static,
            value: 'finalValue',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    ];
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodes,
      variables: {}
    });
    expect(result).toBe('Result: finalValue');
  });

  it('should handle circular reference protection', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: '{{$node1.out1$}}',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    ];
    const result = replaceEditorVariable({
      text: 'Result: {{$node1.out1$}}',
      nodes,
      variables: {}
    });
    expect(result).toBe('Result: {{$node1.out1$}}');
  });

  it('should handle max depth protection', () => {
    const result = replaceEditorVariable({
      text: 'test',
      nodes: [],
      variables: {},
      depth: 15
    });
    expect(result).toBe('test');
  });

  it('should handle node input as variable source', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [{ key: 'myInput', label: '', renderTypeList: [], value: 'inputValue' }],
        outputs: []
      }
    ];
    const result = replaceEditorVariable({
      text: 'Input: {{$node1.myInput$}}',
      nodes,
      variables: {}
    });
    expect(result).toBe('Input: inputValue');
  });

  it('should convert object values to string', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out1',
            key: 'output1',
            type: FlowNodeOutputTypeEnum.static,
            value: { a: 1 },
            valueType: WorkflowIOValueTypeEnum.object
          }
        ]
      }
    ];
    const result = replaceEditorVariable({
      text: 'Object: {{$node1.out1$}}',
      nodes,
      variables: {}
    });
    expect(result).toBe('Object: {"a":1}');
  });

  it('should keep original pattern when node not found', () => {
    const result = replaceEditorVariable({
      text: '{{$nonexistent.out$}}',
      nodes: [],
      variables: {}
    });
    // When node is not found, the pattern is not replaced
    expect(result).toBe('');
  });
});

describe('textAdaptGptResponse', () => {
  it('should create GPT response format with text', () => {
    const result = textAdaptGptResponse({ text: 'Hello' });
    expect(result).toEqual({
      id: '',
      object: '',
      created: 0,
      model: '',
      choices: [
        {
          delta: {
            role: 'assistant',
            content: 'Hello'
          },
          index: 0,
          finish_reason: null
        }
      ]
    });
  });

  it('should include reasoning_content when provided', () => {
    const result = textAdaptGptResponse({ text: 'Hello', reasoning_content: 'Thinking...' });
    expect(result.choices[0].delta.reasoning_content).toBe('Thinking...');
  });

  it('should include model when provided', () => {
    const result = textAdaptGptResponse({ text: 'Hello', model: 'gpt-4' });
    expect(result.model).toBe('gpt-4');
  });

  it('should include finish_reason when provided', () => {
    const result = textAdaptGptResponse({ text: 'Hello', finish_reason: 'stop' });
    expect(result.choices[0].finish_reason).toBe('stop');
  });

  it('should include extraData when provided', () => {
    const result = textAdaptGptResponse({ text: 'Hello', extraData: { custom: 'data' } });
    expect((result as any).custom).toBe('data');
  });

  it('should handle null text', () => {
    const result = textAdaptGptResponse({ text: null });
    expect(result.choices[0].delta.content).toBe(null);
  });

  it('should handle undefined text', () => {
    const result = textAdaptGptResponse({});
    expect(result.choices[0].delta.content).toBeUndefined();
  });
});

describe('rewriteNodeOutputByHistories', () => {
  it('should return nodes as is when no lastInteractive', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'original' }
        ]
      }
    ];
    const result = rewriteNodeOutputByHistories(nodes);
    expect(result).toBe(nodes);
  });

  it('should return nodes as is when lastInteractive has no nodeOutputs', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'original' }
        ]
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: undefined,
      params: { description: '', userSelectOptions: [] }
    } as unknown as WorkflowInteractiveResponseType;

    const result = rewriteNodeOutputByHistories(nodes, lastInteractive);
    expect(result).toBe(nodes);
  });

  it('should rewrite node outputs from lastInteractive', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'original' }
        ]
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [{ nodeId: 'node1', key: 'output1' as any, value: 'newValue' }],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = rewriteNodeOutputByHistories(nodes, lastInteractive);
    expect(result[0].outputs[0].value).toBe('newValue');
  });

  it('should keep original value when no matching nodeOutput', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'original' }
        ]
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [{ nodeId: 'node2', key: 'output2' as any, value: 'newValue' }],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = rewriteNodeOutputByHistories(nodes, lastInteractive);
    expect(result[0].outputs[0].value).toBe('original');
  });

  it('should handle multiple nodes and outputs', () => {
    const nodes: RuntimeNodeItemType[] = [
      {
        nodeId: 'node1',
        name: 'test1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out1', key: 'output1', type: FlowNodeOutputTypeEnum.static, value: 'original1' },
          { id: 'out2', key: 'output2', type: FlowNodeOutputTypeEnum.static, value: 'original2' }
        ]
      },
      {
        nodeId: 'node2',
        name: 'test2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          { id: 'out3', key: 'output3', type: FlowNodeOutputTypeEnum.static, value: 'original3' }
        ]
      }
    ];
    const lastInteractive = {
      type: 'userSelect',
      entryNodeIds: ['node1'],
      memoryEdges: [],
      nodeOutputs: [
        { nodeId: 'node1', key: 'output1' as any, value: 'new1' },
        { nodeId: 'node2', key: 'output3' as any, value: 'new3' }
      ],
      params: { description: '', userSelectOptions: [] }
    } as WorkflowInteractiveResponseType;

    const result = rewriteNodeOutputByHistories(nodes, lastInteractive);
    expect(result[0].outputs[0].value).toBe('new1');
    expect(result[0].outputs[1].value).toBe('original2');
    expect(result[1].outputs[0].value).toBe('new3');
  });
});

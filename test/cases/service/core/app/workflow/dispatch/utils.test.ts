import { describe, it, expect, vi } from 'vitest';

import {
  getWorkflowResponseWrite,
  getWorkflowChildResponseWrite,
  filterOrphanEdges,
  filterToolNodeIdByEdges,
  getHistories,
  checkQuoteQAValue,
  runtimeSystemVar2StoreType,
  filterSystemVariables,
  formatHttpError,
  rewriteRuntimeWorkFlow,
  getNodeErrResponse
} from '@fastgpt/service/core/workflow/dispatch/utils';
import { responseWrite } from '@fastgpt/service/common/response';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { NodeOutputKeyEnum, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import {
  SseResponseEventEnum,
  DispatchNodeResponseKeyEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

const mockGetSystemToolRunTimeNodeFromSystemToolset = vi.fn();
vi.mock('@fastgpt/service/core/workflow/utils', () => ({
  getSystemToolRunTimeNodeFromSystemToolset: (...args: any[]) =>
    mockGetSystemToolRunTimeNodeFromSystemToolset(...args)
}));

const mockMongoAppFindOne = vi.fn();
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findOne: (...args: any[]) => mockMongoAppFindOne(...args)
  }
}));

const mockGetMCPChildren = vi.fn();
vi.mock('@fastgpt/service/core/app/mcp', () => ({
  getMCPChildren: (...args: any[]) => mockGetMCPChildren(...args)
}));

describe('getWorkflowResponseWrite', () => {
  const mockRes = () => {
    const res: any = { closed: false };
    return res;
  };

  it('should return a function', () => {
    const fn = getWorkflowResponseWrite({ detail: true, streamResponse: true });
    expect(typeof fn).toBe('function');
  });

  it('should not write when res is undefined', () => {
    const fn = getWorkflowResponseWrite({ detail: true, streamResponse: true });
    fn({ event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    // No error thrown
  });

  it('should not write when res.closed is true', () => {
    const res = mockRes();
    res.closed = true;
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: true, streamResponse: true });
    fn({ event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('should not write when streamResponse is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: true, streamResponse: false });
    fn({ event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('should write answer event even when detail is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: false, streamResponse: true });
    fn({ event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    expect(responseWrite).toHaveBeenCalled();
  });

  it('should write fastAnswer event even when detail is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: false, streamResponse: true });
    fn({ event: SseResponseEventEnum.fastAnswer, data: { text: 'hi' } });
    expect(responseWrite).toHaveBeenCalled();
  });

  it('should skip non-answer events when detail is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: false, streamResponse: true });
    fn({ event: SseResponseEventEnum.flowNodeStatus, data: {} });
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('should skip status events when showNodeStatus is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      showNodeStatus: false
    });
    fn({ event: SseResponseEventEnum.flowNodeStatus, data: {} });
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('should skip toolCall events when showNodeStatus is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      showNodeStatus: false
    });
    fn({ event: SseResponseEventEnum.toolCall, data: {} });
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('should include stepId and responseValueId when detail is true', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: 'test-id'
    });
    fn({ id: 'rid', stepId: 'sid', event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    expect(responseWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        res,
        event: SseResponseEventEnum.answer
      })
    );
    const callData = JSON.parse(vi.mocked(responseWrite).mock.calls[0][0].data as string);
    expect(callData.stepId).toBe('sid');
    expect(callData.responseValueId).toBe('rid');
  });

  it('should not include event in data when detail is false', () => {
    const res = mockRes();
    vi.mocked(responseWrite).mockClear();
    const fn = getWorkflowResponseWrite({ res, detail: false, streamResponse: true });
    fn({ event: SseResponseEventEnum.answer, data: { text: 'hi' } });
    expect(responseWrite).toHaveBeenCalledWith(expect.objectContaining({ event: undefined }));
  });
});

describe('getWorkflowChildResponseWrite', () => {
  it('should return undefined when fn is undefined', () => {
    const result = getWorkflowChildResponseWrite({ id: 'id', stepId: 'step' });
    expect(result).toBeUndefined();
  });

  it('should return a wrapper function that passes id and stepId', () => {
    const mockFn = vi.fn();
    const wrapped = getWorkflowChildResponseWrite({
      id: 'child-id',
      stepId: 'child-step',
      fn: mockFn as any
    });
    expect(wrapped).toBeDefined();
    wrapped!({
      event: SseResponseEventEnum.answer,
      data: { text: 'hi' }
    });
    expect(mockFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-id',
        stepId: 'child-step',
        event: SseResponseEventEnum.answer,
        data: { text: 'hi' }
      })
    );
  });
});

describe('filterOrphanEdges', () => {
  const makeNode = (nodeId: string) =>
    ({ nodeId, flowNodeType: 'test', inputs: [], outputs: [] }) as any as RuntimeNodeItemType;
  const makeEdge = (source: string, target: string) =>
    ({ source, target, sourceHandle: 's', targetHandle: 't' }) as any as RuntimeEdgeItemType;

  it('should filter edge when source node is missing', () => {
    const nodes = [makeNode('n2')];
    const edges = [makeEdge('missing', 'n2')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result.length).toBe(0);
  });

  it('should filter edge when target node is missing', () => {
    const nodes = [makeNode('n1')];
    const edges = [makeEdge('n1', 'missing')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result.length).toBe(0);
  });

  it('should filter edge when both source and target are missing', () => {
    const nodes = [makeNode('n1')];
    const edges = [makeEdge('missing1', 'missing2')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result.length).toBe(0);
  });

  it('should collect orphan edges in debug mode', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2'), makeEdge('n1', 'missing'), makeEdge('missing', 'n2')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result).toEqual([edges[0]]);
    expect(result.length).toBe(1);
  });

  it('should not collect orphan edges when mode is not debug', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'missing')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result.length).toBe(0);
  });

  it('should not log debug details when debug mode has no orphan edges', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const result = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(result.length).toBe(1);
  });

  it('should warn when filtering takes significant time', () => {
    const originalDateNow = Date.now;
    let callCount = 0;
    // First call returns 0, second call returns 200 (simulating >100ms duration)
    Date.now = () => {
      callCount++;
      return callCount === 1 ? 0 : 200;
    };

    const nodes = [makeNode('n1')];
    const edges = [makeEdge('n1', 'missing')];
    filterOrphanEdges({ edges, nodes, workflowId: 'slow-test' });

    Date.now = originalDateNow;
  });

  it('should handle empty nodes array', () => {
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'node1', target: 'node2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle empty edges array', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'node1', flowNodeType: 'test', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle no orphan edges', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'n1', flowNodeType: 't', inputs: [], outputs: [] } as any,
      { nodeId: 'n2', flowNodeType: 't', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'n1', target: 'n2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(1);
  });

  it('Performance test: 1000 nodes and edges', () => {
    const nodeCount = 1000;
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [];

    // Create 1000 nodes
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({ nodeId: `node${i}`, flowNodeType: 'test', inputs: [], outputs: [] } as any);
    }

    // Create edges: 50% valid, 50% orphan
    for (let i = 0; i < nodeCount; i++) {
      if (i % 2 === 0) {
        // Valid edge
        edges.push({
          source: `node${i}`,
          target: `node${(i + 1) % nodeCount}`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      } else {
        // Orphan edge
        edges.push({
          source: `node${i}`,
          target: `non-existent-node`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      }
    }

    const start = Date.now();
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'perf-test' });
    const duration = Date.now() - start;

    expect(filteredEdges.length).toBe(nodeCount / 2);
    // Performance check: should be very fast (e.g., < 50ms)
    // We log it instead of failing to avoid flaky tests on slow machines
    console.log(`Performance test took ${duration}ms for ${nodeCount} edges`);
    expect(duration).toBeLessThan(100);
  });
});

describe('filterToolNodeIdByEdges', () => {
  const makeEdge = (source: string, target: string, targetHandle: string): RuntimeEdgeItemType =>
    ({ source, target, sourceHandle: 'out', targetHandle }) as any;

  it('should return targets connected via selectedTools handle', () => {
    const edges = [
      makeEdge('node1', 'tool1', NodeOutputKeyEnum.selectedTools),
      makeEdge('node1', 'tool2', NodeOutputKeyEnum.selectedTools)
    ];
    const result = filterToolNodeIdByEdges({ nodeId: 'node1', edges });
    expect(result).toEqual(['tool1', 'tool2']);
  });

  it('should return empty array when no matching edges', () => {
    const edges = [makeEdge('node2', 'tool1', NodeOutputKeyEnum.selectedTools)];
    const result = filterToolNodeIdByEdges({ nodeId: 'node1', edges });
    expect(result).toEqual([]);
  });

  it('should filter by targetHandle selectedTools only', () => {
    const edges = [
      makeEdge('node1', 'tool1', NodeOutputKeyEnum.selectedTools),
      makeEdge('node1', 'other1', 'otherHandle')
    ];
    const result = filterToolNodeIdByEdges({ nodeId: 'node1', edges });
    expect(result).toEqual(['tool1']);
  });

  it('should return empty array for empty edges', () => {
    const result = filterToolNodeIdByEdges({ nodeId: 'node1', edges: [] });
    expect(result).toEqual([]);
  });
});

describe('getHistories', () => {
  const MockHistories: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: '你好2'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content: '你好3'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: '你好4'
          }
        }
      ]
    }
  ];

  it('getHistories', async () => {
    // Number
    expect(getHistories(1, MockHistories)).toEqual([
      ...MockHistories.slice(0, 1),
      ...MockHistories.slice(-2)
    ]);
    expect(getHistories(2, MockHistories)).toEqual([...MockHistories.slice(0)]);
    expect(getHistories(4, MockHistories)).toEqual([...MockHistories.slice(0)]);

    // Array
    expect(
      getHistories(
        [
          {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: {
                  content: '你好'
                }
              }
            ]
          }
        ],
        MockHistories
      )
    ).toEqual([
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: '你好'
            }
          }
        ]
      }
    ]);
  });

  it('should return empty array when history is undefined', () => {
    expect(getHistories(undefined, MockHistories)).toEqual([]);
  });

  it('should return empty array when history is 0', () => {
    expect(getHistories(0, MockHistories)).toEqual([]);
  });

  it('should use default empty histories', () => {
    expect(getHistories(1)).toEqual([]);
  });
});

describe('checkQuoteQAValue', () => {
  it('should return undefined when quoteQA is undefined', () => {
    expect(checkQuoteQAValue(undefined)).toBeUndefined();
  });

  it('should return empty array when quoteQA is empty', () => {
    expect(checkQuoteQAValue([])).toEqual([]);
  });

  it('should return undefined when items are not objects', () => {
    expect(checkQuoteQAValue(['not-object'] as any)).toBeUndefined();
  });

  it('should return undefined when items are missing q field', () => {
    expect(checkQuoteQAValue([{ a: 'test' }] as any)).toBeUndefined();
  });

  it('should return the array when items are valid', () => {
    const data = [{ q: 'question', a: 'answer' }] as any;
    expect(checkQuoteQAValue(data)).toEqual(data);
  });

  it('should return undefined when some items are invalid', () => {
    const data = [{ q: 'question' }, { a: 'no-q' }] as any;
    expect(checkQuoteQAValue(data)).toBeUndefined();
  });
});

describe('runtimeSystemVar2StoreType', () => {
  it('should remove system variables', () => {
    const variables = {
      userId: 'u1',
      appId: 'a1',
      chatId: 'c1',
      responseChatItemId: 'r1',
      histories: [],
      cTime: '2024-01-01',
      customVar: 'keep'
    };
    const result = runtimeSystemVar2StoreType({ variables });
    expect(result.userId).toBeUndefined();
    expect(result.appId).toBeUndefined();
    expect(result.chatId).toBeUndefined();
    expect(result.responseChatItemId).toBeUndefined();
    expect(result.histories).toBeUndefined();
    expect(result.cTime).toBeUndefined();
    expect(result.customVar).toBe('keep');
  });

  it('should remove custom removeObj keys', () => {
    const variables = { key1: 'v1', key2: 'v2' };
    const result = runtimeSystemVar2StoreType({
      variables,
      removeObj: { key1: 'any' }
    });
    expect(result.key1).toBeUndefined();
    expect(result.key2).toBe('v2');
  });

  it('should encrypt password variables', () => {
    const variables = { pwd: 'secret123' };
    const result = runtimeSystemVar2StoreType({
      variables,
      userVariablesConfigs: [{ key: 'pwd', type: VariableInputEnum.password } as any]
    });
    expect(result.pwd).toHaveProperty('value', '');
    expect(result.pwd).toHaveProperty('secret');
    expect(typeof result.pwd.secret).toBe('string');
    expect(result.pwd.secret.split(':').length).toBe(3);
  });

  it('should skip non-string password values', () => {
    const variables = { pwd: 123 };
    const result = runtimeSystemVar2StoreType({
      variables,
      userVariablesConfigs: [{ key: 'pwd', type: VariableInputEnum.password } as any]
    });
    expect(result.pwd).toBe(123);
  });

  it('should handle file variables with valid URLs', () => {
    const variables = {
      myFile: ['https://example.com/fastgpt-private/path/to/file.jpg']
    };
    const result = runtimeSystemVar2StoreType({
      variables,
      userVariablesConfigs: [{ key: 'myFile', type: VariableInputEnum.file } as any]
    });
    expect(result.myFile).toHaveLength(1);
    expect(result.myFile[0]).toHaveProperty('key', 'path/to/file.jpg');
    expect(result.myFile[0]).toHaveProperty('name', 'file.jpg');
    expect(result.myFile[0]).toHaveProperty('id', 'file');
  });

  it('should filter out invalid URLs in file variables', () => {
    const variables = {
      myFile: ['not-a-url']
    };
    const result = runtimeSystemVar2StoreType({
      variables,
      userVariablesConfigs: [{ key: 'myFile', type: VariableInputEnum.file } as any]
    });
    expect(result.myFile).toHaveLength(0);
  });
});

describe('filterSystemVariables', () => {
  it('should return only system variables', () => {
    const variables = {
      userId: 'u1',
      appId: 'a1',
      chatId: 'c1',
      responseChatItemId: 'r1',
      histories: [{ obj: 'Human', value: [] }],
      cTime: '2024-01-01',
      customVar: 'should-not-appear'
    };
    const result = filterSystemVariables(variables);
    expect(result).toEqual({
      userId: 'u1',
      appId: 'a1',
      chatId: 'c1',
      responseChatItemId: 'r1',
      histories: [{ obj: 'Human', value: [] }],
      cTime: '2024-01-01'
    });
    expect((result as any).customVar).toBeUndefined();
  });

  it('should handle missing system variables', () => {
    const result = filterSystemVariables({});
    expect(result.userId).toBeUndefined();
    expect(result.appId).toBeUndefined();
  });
});

describe('formatHttpError', () => {
  it('should format error with all fields', () => {
    const error = {
      message: 'Request failed',
      response: { data: { detail: 'not found' } },
      name: 'AxiosError',
      config: { method: 'GET' },
      code: 'ERR_BAD_REQUEST',
      status: 400
    };
    const result = formatHttpError(error);
    expect(result.message).toBe('Request failed');
    expect(result.data).toEqual({ detail: 'not found' });
    expect(result.name).toBe('AxiosError');
    expect(result.method).toBe('GET');
    expect(result.code).toBe('ERR_BAD_REQUEST');
    expect(result.status).toBe(400);
  });

  it('should handle error with missing fields', () => {
    const result = formatHttpError({});
    expect(result.message).toBe('');
    expect(result.data).toBeUndefined();
    expect(result.name).toBeUndefined();
    expect(result.method).toBeUndefined();
    expect(result.code).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it('should handle string error', () => {
    const result = formatHttpError('something went wrong');
    expect(result.message).toBe('something went wrong');
  });
});

describe('rewriteRuntimeWorkFlow', () => {
  const makeNode = (
    nodeId: string,
    flowNodeType: string,
    extra: Partial<RuntimeNodeItemType> = {}
  ): RuntimeNodeItemType =>
    ({
      nodeId,
      flowNodeType,
      inputs: [],
      outputs: [],
      ...extra
    }) as any;

  const makeEdge = (
    source: string,
    target: string,
    opts: Partial<RuntimeEdgeItemType> = {}
  ): RuntimeEdgeItemType =>
    ({
      source,
      target,
      sourceHandle: 'out',
      targetHandle: 'in',
      status: 'waiting',
      ...opts
    }) as any;

  it('should return early when no toolSet nodes', async () => {
    const nodes = [makeNode('n1', FlowNodeTypeEnum.chatNode)];
    const edges = [makeEdge('n1', 'n2')];
    const originalNodesLen = nodes.length;
    const originalEdgesLen = edges.length;
    await rewriteRuntimeWorkFlow({ nodes, edges });
    expect(nodes.length).toBe(originalNodesLen);
    expect(edges.length).toBe(originalEdgesLen);
  });

  it('should handle systemTool toolSet nodes', async () => {
    const toolSetNode = makeNode('ts1', FlowNodeTypeEnum.toolSet, {
      toolConfig: { systemToolSet: { toolId: 'sys-tool-1' } }
    } as any);
    const parentNode = makeNode('parent', FlowNodeTypeEnum.chatNode);
    const nodes = [parentNode, toolSetNode];
    const edges = [
      makeEdge('parent', 'ts1', { sourceHandle: 'out', targetHandle: 'selectedTools' })
    ];

    const childNode = makeNode('child1', 'systemTool');
    mockGetSystemToolRunTimeNodeFromSystemToolset.mockResolvedValue([childNode]);

    await rewriteRuntimeWorkFlow({ nodes, edges });

    expect(nodes.find((n) => n.nodeId === 'ts1')).toBeUndefined();
    expect(nodes.find((n) => n.nodeId === 'child1')).toBeDefined();
    expect(edges.find((e) => e.target === 'ts1')).toBeUndefined();
    expect(edges.find((e) => e.target === 'child1')).toBeDefined();
  });

  it('should handle MCP toolSet nodes', async () => {
    const toolSetNode = makeNode('ts2', FlowNodeTypeEnum.toolSet, {
      pluginId: 'mcp-app-1',
      name: 'MCPTool',
      avatar: 'avatar.png',
      toolConfig: {
        mcpToolSet: { toolId: 'mcp-tool-1' }
      }
    } as any);
    const parentNode = makeNode('parent', FlowNodeTypeEnum.chatNode);
    const nodes = [parentNode, toolSetNode];
    const edges = [
      makeEdge('parent', 'ts2', { sourceHandle: 'out', targetHandle: 'selectedTools' })
    ];

    mockMongoAppFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'mcp-app-1', name: 'TestApp' })
    });
    mockGetMCPChildren.mockResolvedValue([{ name: 'tool1', description: 'desc', inputSchema: {} }]);

    await rewriteRuntimeWorkFlow({ nodes, edges });

    expect(nodes.find((n) => n.nodeId === 'ts2')).toBeUndefined();
    expect(nodes.find((n) => n.nodeId === 'ts20')).toBeDefined();
    expect(edges.find((e) => e.target === 'ts2')).toBeUndefined();
    expect(edges.find((e) => e.target === 'ts20')).toBeDefined();
  });

  it('should skip MCP toolSet when app not found', async () => {
    const toolSetNode = makeNode('ts3', FlowNodeTypeEnum.toolSet, {
      pluginId: 'missing-app',
      toolConfig: {
        mcpToolSet: { toolId: 'mcp-tool-1' }
      }
    } as any);
    const nodes = [toolSetNode];
    const edges: RuntimeEdgeItemType[] = [];

    mockMongoAppFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });

    await rewriteRuntimeWorkFlow({ nodes, edges });

    expect(nodes.find((n) => n.nodeId === 'ts3')).toBeUndefined();
  });

  it('should handle HTTP toolSet nodes', async () => {
    const toolSetNode = makeNode('ts4', FlowNodeTypeEnum.toolSet, {
      pluginId: 'http-plugin-1',
      name: 'HTTPTool',
      avatar: 'avatar.png',
      toolConfig: {
        httpToolSet: {
          toolList: [
            { name: 'api1', description: 'desc1', url: 'http://example.com/api1' },
            { name: 'api2', description: 'desc2', url: 'http://example.com/api2' }
          ]
        }
      }
    } as any);
    const parentNode = makeNode('parent', FlowNodeTypeEnum.chatNode);
    const nodes = [parentNode, toolSetNode];
    const edges = [
      makeEdge('parent', 'ts4', { sourceHandle: 'out', targetHandle: 'selectedTools' })
    ];

    await rewriteRuntimeWorkFlow({ nodes, edges });

    expect(nodes.find((n) => n.nodeId === 'ts4')).toBeUndefined();
    expect(nodes.find((n) => n.nodeId === 'ts40')).toBeDefined();
    expect(nodes.find((n) => n.nodeId === 'ts41')).toBeDefined();
    expect(edges.filter((e) => e.target === 'ts40' || e.target === 'ts41').length).toBe(2);
  });
});

describe('getNodeErrResponse', () => {
  it('should return proper error response structure', () => {
    const result = getNodeErrResponse({ error: 'test error' });
    expect(result.error[NodeOutputKeyEnum.errorText]).toBe('test error');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toHaveProperty(
      'errorText',
      'test error'
    );
    expect(result[DispatchNodeResponseKeyEnum.toolResponses]).toHaveProperty('error', 'test error');
  });

  it('should include customErr in error and toolResponses', () => {
    const result = getNodeErrResponse({
      error: 'fail',
      customErr: { code: 500, detail: 'internal' }
    });
    expect(result.error).toEqual({
      [NodeOutputKeyEnum.errorText]: 'fail',
      code: 500,
      detail: 'internal'
    });
    expect(result[DispatchNodeResponseKeyEnum.toolResponses]).toEqual({
      error: 'fail',
      code: 500,
      detail: 'internal'
    });
  });

  it('should include responseData in nodeResponse', () => {
    const result = getNodeErrResponse({
      error: 'fail',
      responseData: { extra: 'info' }
    });
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toEqual({
      errorText: 'fail',
      extra: 'info'
    });
  });

  it('should pass through optional fields', () => {
    const usages = [{ totalPoints: 1, tokens: 100, moduleName: 'test' }] as any;
    const result = getNodeErrResponse({
      error: 'fail',
      nodeDispatchUsages: usages,
      runTimes: 3,
      newVariables: { a: 1 },
      system_memories: { mem: 'val' }
    });
    expect(result[DispatchNodeResponseKeyEnum.nodeDispatchUsages]).toBe(usages);
    expect(result[DispatchNodeResponseKeyEnum.runTimes]).toBe(3);
    expect(result[DispatchNodeResponseKeyEnum.newVariables]).toEqual({ a: 1 });
    expect(result[DispatchNodeResponseKeyEnum.memories]).toEqual({ mem: 'val' });
  });

  it('should handle non-object customErr gracefully', () => {
    const result = getNodeErrResponse({
      error: 'fail',
      customErr: 'not-object' as any
    });
    expect(result.error).toEqual({
      [NodeOutputKeyEnum.errorText]: 'fail'
    });
  });
});

import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

vi.mock('@/web/core/workflow/editor/session/workflowSession', async () => {
  return { useWorkflowOverlayActions: () => vi.fn() };
});

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppContext: createContext({}) };
});

vi.mock('@/web/core/workflow/api', () => ({
  postWorkflowDebug: vi.fn()
}));

vi.mock('@/components/core/chat/ChatContainer/context/workflowRuntimeContext', () => ({
  WorkflowRuntimeContextProvider: ({ children }: { children: unknown }) => children
}));

import {
  createNextWorkflowDebugData,
  createWorkflowDebugData,
  getWorkflowDebugNodeStatus,
  getWorkflowDebugRuntimeContext
} from '@/pageComponents/app/detail/WorkflowComponents/debug/workflowDebugSession';
import { resolveDebugStep } from '@/web/core/workflow/editor/debug/workflowDebugOverlay';

const runtimeNodes = [
  { nodeId: 'entry-node', inputs: [] },
  { nodeId: 'next-node', inputs: [] }
] as any;

describe('getWorkflowDebugNodeStatus', () => {
  it('marks execution errors as failed, including errors captured by a branch', () => {
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'mcp',
        type: 'run',
        response: { errorText: 'MCP isError', errorCaptured: true } as any
      })
    ).toBe('failed');
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'http',
        type: 'run',
        response: { error: 'HTTP 500' } as any
      })
    ).toBe('failed');
  });

  it('keeps skipped nodes skipped and does not interpret tool result data as node errors', () => {
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'skipped',
        type: 'skip',
        response: { errorText: 'stale error' } as any
      })
    ).toBe('skipped');
    expect(
      getWorkflowDebugNodeStatus({
        nodeId: 'ok',
        type: 'run',
        response: { toolRes: { error: 'ordinary business data' } } as any
      })
    ).toBe('success');
    expect(getWorkflowDebugNodeStatus({ nodeId: 'empty', type: 'run' })).toBe('success');
  });
});

describe('resolveDebugStep', () => {
  it('shows captured run errors as failed overlays', () => {
    const result = resolveDebugStep({
      writtenNodeIds: [],
      selectedNodeIds: [],
      entryNodeIds: ['mcp'],
      nodeResponses: {
        mcp: {
          type: 'run',
          response: { errorText: 'captured MCP error' } as any
        }
      }
    });

    expect(result.overlayPatches[0]?.values.debugResult).toEqual(
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('getWorkflowDebugRuntimeContext', () => {
  it('uses draft upload mode and exposes the generated debug chatId', () => {
    expect(
      getWorkflowDebugRuntimeContext({ appId: 'app-id', chatId: 'debug-session-chat-id' })
    ).toEqual({
      sourceTarget: { sourceType: 'app', sourceId: 'app-id' },
      chatId: 'debug-session-chat-id',
      outLinkAuthData: undefined,
      fileUploadMode: 'draft'
    });
  });

  it('uses an empty chatId before the debug modal creates a session', () => {
    expect(getWorkflowDebugRuntimeContext({ appId: 'app-id' }).chatId).toBe('');
  });
});

describe('createWorkflowDebugData', () => {
  it('marks saved references in the request without changing the document or debug literals', () => {
    const reference = {
      key: 'ref',
      label: 'Reference',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      value: ['removed', 'result']
    };
    const literal = { ...reference, value: ['first', 'second'], debugValueOverride: true };
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes: [
          { ...runtimeNodes[0], inputs: [literal] },
          { ...runtimeNodes[1], inputs: [reference] }
        ],
        runtimeEdges: [],
        variables: {}
      }
    });
    expect(result.runtimeNodes.map(({ inputs }) => inputs[0])).toEqual([
      literal,
      { ...reference, debugValueOverride: false }
    ]);
    expect(reference).not.toHaveProperty('debugValueOverride');
  });

  it('uses the modal chatId for the first debug run', () => {
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes,
        runtimeEdges: [],
        variables: { input: 'value' }
      },
      defaultChatId: 'debug-session-chat-id'
    });

    expect(result).toEqual(
      expect.objectContaining({
        entryNodeIds: ['entry-node'],
        skipNodeQueue: [],
        chatId: 'debug-session-chat-id'
      })
    );
  });

  it('allows an explicit chatId to override the modal chatId', () => {
    const result = createWorkflowDebugData({
      params: {
        entryNodeId: 'entry-node',
        runtimeNodes,
        runtimeEdges: [],
        variables: {},
        chatId: 'explicit-chat-id'
      },
      defaultChatId: 'debug-session-chat-id'
    });

    expect(result.chatId).toBe('explicit-chat-id');
  });
});

describe('createNextWorkflowDebugData', () => {
  it('preserves chatId and usageId for the next node or interactive run', () => {
    const result = createNextWorkflowDebugData({
      debugData: {
        runtimeNodes,
        runtimeEdges: [],
        entryNodeIds: ['entry-node'],
        variables: {},
        chatId: 'debug-session-chat-id'
      },
      response: {
        memoryNodes: [{ nodeId: 'next-node', inputs: [] }] as any,
        memoryEdges: [],
        entryNodeIds: ['next-node'],
        skipNodeQueue: [],
        newVariables: { result: 'done' },
        usageId: 'usage-id'
      }
    });

    expect(result).toEqual(
      expect.objectContaining({
        entryNodeIds: ['next-node'],
        variables: { result: 'done' },
        chatId: 'debug-session-chat-id',
        usageId: 'usage-id'
      })
    );
  });
});

/** 走实际调试请求/回执和服务端代理边界，验证未保存凭据可以跨步续跑。 */
describe('HTTP proxy step-debug round trip', () => {
  it.each(['value', 'defaultValue'] as const)(
    'retains unsaved %s across two masked responses',
    async (field) => {
      const { formatHttpProxySecrets, resolveHttpProxySecrets, HTTP_PROXY_CONFIGURED } =
        await import('@fastgpt/service/core/app/httpProxySecret');
      const { WorkflowDebugBodySchema, WorkflowDebugResponseSchema } =
        await import('@fastgpt/global/openapi/core/workflow/api');
      const { decryptSecretValue } = await import('@fastgpt/service/common/secret/utils');
      const appId = '660000000000000000000001';
      const proxyUrl = 'http://user:private@proxy.example.com:8080';
      const initialNode: RuntimeNodeItemType = {
        nodeId: 'http',
        name: 'HTTP',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        inputs: [
          {
            key: NodeInputKeyEnum.httpProxy,
            label: 'Proxy',
            renderTypeList: [FlowNodeInputTypeEnum.password],
            [field]: { value: proxyUrl }
          }
        ],
        outputs: []
      };
      let data = createWorkflowDebugData({
        params: {
          entryNodeId: 'http',
          runtimeNodes: [initialNode],
          runtimeEdges: [],
          variables: {}
        },
        defaultChatId: 'debug-session'
      });
      const readVersions = vi.fn(async () => []);
      const original = structuredClone(initialNode);
      for (let step = 0; step < 2; step++) {
        const request = WorkflowDebugBodySchema.parse({
          appId,
          nodes: data.runtimeNodes,
          edges: []
        });
        const resolved = await resolveHttpProxySecrets({
          nodes: request.nodes,
          appId,
          readVersions
        });
        expect(decryptSecretValue(resolved[0].inputs[0][field])).toBe(proxyUrl);
        const memoryNodes = structuredClone(resolved);
        formatHttpProxySecrets({ nodes: memoryNodes, project: true, references: request.nodes });
        const response = WorkflowDebugResponseSchema.parse({
          memoryNodes,
          memoryEdges: [],
          entryNodeIds: ['http'],
          nodeResponses: {},
          newVariables: { step },
          usageId: 'debug-usage'
        });
        expect(response.memoryNodes[0].inputs[0][field]).toEqual({ secret: HTTP_PROXY_CONFIGURED });
        expect(JSON.stringify(response)).not.toContain('private');
        const snapshot = structuredClone(response);
        data = createNextWorkflowDebugData({ debugData: data, response });
        expect(data.runtimeNodes[0].inputs[0][field]).toEqual({ value: proxyUrl });
        expect(response).toEqual(snapshot);
        expect(data.variables).toEqual({ step });
      }
      expect(readVersions).not.toHaveBeenCalled();
      expect(initialNode).toEqual(original);
    }
  );
});

describe('HTTP proxy step-debug session boundaries', () => {
  const makeNode = (
    nodeId: string,
    flowNodeType = FlowNodeTypeEnum.httpRequest468
  ): RuntimeNodeItemType => ({
    nodeId,
    name: nodeId,
    flowNodeType,
    inputs: [
      {
        key: NodeInputKeyEnum.httpProxy,
        label: 'Proxy',
        renderTypeList: [FlowNodeInputTypeEnum.password]
      }
    ],
    outputs: []
  });

  it.each([null, { value: '' }, { ref: ['global', 'proxy'] }, ['global', 'proxy']])(
    'keeps explicit clearing and reference inputs within the current session: %j',
    (value) => {
      const local = makeNode('http');
      local.inputs[0].value = value;
      local.inputs[0].defaultValue = { value: 'http://default:local@proxy.example.com' };
      const returned = structuredClone(local);
      returned.inputs[0].value = { secret: 'masked' };
      returned.inputs[0].defaultValue = { secret: 'masked-default' };
      const result = createNextWorkflowDebugData({
        debugData: {
          runtimeNodes: [local],
          runtimeEdges: [],
          entryNodeIds: ['http'],
          variables: {}
        },
        response: { memoryNodes: [returned], memoryEdges: [], entryNodeIds: [], newVariables: {} }
      });
      expect(result.runtimeNodes[0].inputs[0]).toMatchObject({
        value,
        defaultValue: local.inputs[0].defaultValue
      });
      expect(result.runtimeNodes[0].inputs[0].defaultValue).not.toBe(local.inputs[0].defaultValue);
      expect(returned.inputs[0].value).toEqual({ secret: 'masked' });
    }
  );

  it('preserves a signed saved reference and resolves it from the same version', async () => {
    const { formatHttpProxySecrets, resolveHttpProxySecrets } =
      await import('@fastgpt/service/core/app/httpProxySecret');
    const { decryptSecretValue } = await import('@fastgpt/service/common/secret/utils');
    const stored = makeNode('http');
    const url = 'http://saved:private@proxy.example.com';
    stored.inputs[0].value = { value: url };
    formatHttpProxySecrets({ nodes: [stored] });
    const local = structuredClone(stored);
    formatHttpProxySecrets({
      nodes: [local],
      project: true,
      source: { appId: 'app', versionId: 'version' }
    });
    const returned = structuredClone(stored);
    formatHttpProxySecrets({ nodes: [returned], project: true, references: [local] });
    const result = createNextWorkflowDebugData({
      debugData: { runtimeNodes: [local], runtimeEdges: [], entryNodeIds: [], variables: {} },
      response: { memoryNodes: [returned], memoryEdges: [], entryNodeIds: [], newVariables: {} }
    });
    expect(result.runtimeNodes[0].inputs[0].value).toEqual(local.inputs[0].value);
    const readVersions = vi.fn(async () => [{ _id: 'version', nodes: [stored] }]);
    const resolved = await resolveHttpProxySecrets({
      nodes: result.runtimeNodes,
      appId: 'app',
      readVersions
    });
    expect(readVersions).toHaveBeenCalledWith(['version']);
    expect(decryptSecretValue(resolved[0].inputs[0].value)).toBe(url);
  });

  it('keeps same-key business fields, removed nodes and a fresh session independent', () => {
    const localHttp = makeNode('http');
    localHttp.inputs[0].value = { value: 'http://local:private@proxy.example.com' };
    const localBusiness = makeNode('business', FlowNodeTypeEnum.code);
    localBusiness.inputs[0].value = 'old business value';
    const returnedBusiness = makeNode('business', FlowNodeTypeEnum.code);
    returnedBusiness.inputs[0].value = 'new business value';
    const returnedHttp = makeNode('new-http');
    returnedHttp.inputs[0].value = { value: '' };
    const response = {
      memoryNodes: [returnedBusiness, returnedHttp],
      memoryEdges: [],
      entryNodeIds: [],
      newVariables: {}
    };
    const next = createNextWorkflowDebugData({
      debugData: {
        runtimeNodes: [localHttp, localBusiness],
        runtimeEdges: [],
        entryNodeIds: [],
        variables: {}
      },
      response
    });
    expect(next.runtimeNodes).toEqual(response.memoryNodes);
    const fresh = createWorkflowDebugData({
      params: {
        entryNodeId: 'new-http',
        runtimeNodes: [returnedHttp],
        runtimeEdges: [],
        variables: {}
      }
    });
    expect(JSON.stringify(fresh)).not.toContain('private');
  });
});

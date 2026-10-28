import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  dispatchWorkFlow,
  runWorkflow,
  WorkflowQueue
} from '@fastgpt/service/core/workflow/dispatch/index';
import { getWorkflowNodeRunParams } from '@fastgpt/service/core/workflow/dispatch/utils/runtime';
import { createClientAbortTracker } from '@fastgpt/service/core/workflow/dispatch/utils/clientAbort';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { createNode, createEdge } from '../utils';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/types/runtime';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { getNodeErrResponse } from '@fastgpt/service/core/workflow/dispatch/utils';

const waitWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const createWorkflowVariableState = (
  variables: Record<string, unknown> = {}
): WorkflowVariableStateLike => ({
  get: (key) => variables[key],
  set: async (key, value) => {
    variables[key] = value;
    return value;
  },
  getStoreValue: (key) => variables[key],
  getFileStoreValueByRuntimeUrl: () => undefined,
  toRuntimeRecord: () => ({ ...variables }),
  toStoreRecord: () => ({ ...variables }),
  clone: () => createWorkflowVariableState({ ...variables })
});

describe('dispatchWorkFlow SSE initialization guard', () => {
  it('rejects stream responses when SSE was not initialized before dispatch', async () => {
    const res = new EventEmitter() as any;
    Object.assign(res, {
      closed: false,
      destroyed: false,
      writableEnded: false,
      headersSent: false,
      setHeader: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      end: vi.fn()
    });
    const workflowStreamResponse = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true
    });

    await expect(
      dispatchWorkFlow({
        res,
        stream: true,
        workflowStreamResponse,
        responseChatItemId: 'response-id'
      } as any)
    ).rejects.toThrow('Workflow SSE response must be initialized before dispatchWorkFlow');
  });
});

describe('createClientAbortTracker', () => {
  const mockRes = (overrides: Record<string, any> = {}) => {
    const res = new EventEmitter() as any;
    Object.assign(res, {
      closed: false,
      destroyed: false,
      errored: null,
      writableAborted: false,
      writableEnded: false,
      writableFinished: false,
      ...overrides
    });
    return res;
  };

  const mockReq = () => {
    const req = new EventEmitter() as any;
    req.aborted = false;
    req.socket = new EventEmitter() as any;
    req.socket.destroyed = false;
    return req;
  };

  const mockSocketError = (code: string) => Object.assign(new Error(code), { code });

  it('响应正常结束后 close，不应判定为客户端 abort', () => {
    const req = mockReq();
    const res = mockRes({ writableEnded: true, writableFinished: true });
    const tracker = createClientAbortTracker({ req, res });

    res.closed = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('响应未正常结束且无服务端错误时 close，应作为客户端 abort fallback', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('响应未结束且连接已断开时 close，应作为客户端 abort fallback', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.socket.destroyed = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('响应 writableAborted 但没有 close，不应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.writableAborted = true;

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('socket 单独关闭不应判定为当前请求 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.socket.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('请求 aborted 时应判定为客户端 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('请求 aborted 后响应再 close，仍应保持用户主动 abort 状态', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.emit('aborted');
    res.destroyed = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('响应 destroyed 后再观察到请求 aborted，仍应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes({ destroyed: true });
    const tracker = createClientAbortTracker({ req, res });

    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('socket error 后触发请求 aborted，不应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.socket.emit('error', new Error('server socket error'));
    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('客户端 reset 类 socket error 后触发请求 aborted，应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.socket.emit('error', mockSocketError('ECONNRESET'));
    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('客户端 reset 类 socket error 后响应 close，应作为客户端 abort fallback', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    req.socket.emit('error', mockSocketError('EPIPE'));
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('响应 close 后再触发服务端 socket error，应回滚客户端 abort fallback', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('close');
    req.socket.emit('error', new Error('server socket error'));

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('响应错误触发请求 aborted，不应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('error', new Error('server response error'));
    req.emit('aborted');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('响应 close 后再触发响应 error，应回滚客户端 abort fallback', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('close');
    res.emit('error', new Error('server response error'));

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('响应错误后 close，不应判定为用户主动 abort', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('error', new Error('server response error'));
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('响应 finish 后 close，不应受 closed 状态误判', () => {
    const req = mockReq();
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    res.emit('finish');
    res.closed = true;
    res.emit('close');

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('创建 tracker 前只有 closed，不应通过快照判定为客户端 abort', () => {
    const req = mockReq();
    const res = mockRes({ closed: true });
    const tracker = createClientAbortTracker({ req, res });

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('创建 tracker 前连接已经断开，不应通过快照判定为用户主动 abort', () => {
    const req = mockReq();
    req.socket.destroyed = true;
    const res = mockRes({ closed: true });
    const tracker = createClientAbortTracker({ req, res });

    expect(tracker.isClientAborted()).toBe(false);
    tracker.cleanup();
  });

  it('创建 tracker 前请求已 aborted，应通过快照判定为用户主动 abort', () => {
    const req = mockReq();
    req.aborted = true;
    const res = mockRes();
    const tracker = createClientAbortTracker({ req, res });

    expect(tracker.isClientAborted()).toBe(true);
    tracker.cleanup();
  });

  it('fetch 使用 AbortController 中断 SSE 后，应让 checkIsStopping 变为 true', async () => {
    let resolveServerAbort!: (value: boolean) => void;
    const serverAbort = new Promise<boolean>((resolve) => {
      resolveServerAbort = resolve;
    });

    const server = createServer((req, res) => {
      const tracker = createClientAbortTracker({ req, res: res as any });
      const checkIsStopping = () => tracker.isClientAborted();

      res.writeHead(200, {
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream;charset=utf-8',
        'Cache-Control': 'no-cache, no-transform'
      });
      res.write('data: first\n\n');

      res.on('close', () => {
        const aborted = checkIsStopping();
        tracker.cleanup();
        resolveServerAbort(aborted);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/sse`, {
        signal: controller.signal
      });
      reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const firstChunk = await reader!.read();
      expect(firstChunk.done).toBe(false);

      controller.abort();
      await reader!.read().catch(() => undefined);

      expect(await waitWithTimeout(serverAbort, 3000, 'server abort signal')).toBe(true);
    } finally {
      await reader?.cancel().catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('服务端 socket 异常关闭长连接时，不应让 checkIsStopping 误判为 true', async () => {
    let resolveServerAbort!: (value: boolean) => void;
    const serverAbort = new Promise<boolean>((resolve) => {
      resolveServerAbort = resolve;
    });

    const server = createServer((req, res) => {
      const tracker = createClientAbortTracker({ req, res: res as any });
      const checkIsStopping = () => tracker.isClientAborted();

      res.writeHead(200, {
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream;charset=utf-8',
        'Cache-Control': 'no-cache, no-transform'
      });
      res.write('data: first\n\n');

      const destroyTimer = setTimeout(() => {
        req.socket.destroy(new Error('server socket unstable close'));
      }, 10);

      res.on('close', () => {
        clearTimeout(destroyTimer);
        const aborted = checkIsStopping();
        tracker.cleanup();
        resolveServerAbort(aborted);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/sse`);
      reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const firstChunk = await reader!.read();
      expect(firstChunk.done).toBe(false);
      await reader!.read().catch(() => undefined);

      expect(await waitWithTimeout(serverAbort, 3000, 'server abort signal')).toBe(false);
    } finally {
      await reader?.cancel().catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe('getWorkflowNodeRunParams', () => {
  const createVariableState = (variables: Record<string, unknown> = {}) => {
    let toRuntimeRecordCount = 0;
    const state: WorkflowVariableStateLike = {
      get: (key) => variables[key],
      set: async (key, value) => {
        variables[key] = value;
        return value;
      },
      getStoreValue: (key) => variables[key],
      getFileStoreValueByRuntimeUrl: () => undefined,
      toRuntimeRecord: () => {
        toRuntimeRecordCount += 1;
        return { ...variables };
      },
      toStoreRecord: () => ({ ...variables }),
      clone: () => createVariableState({ ...variables }).state
    };

    return {
      state,
      getToRuntimeRecordCount: () => toRuntimeRecordCount
    };
  };

  it('静态 input 不应构造 runtimeVariables', () => {
    const variableState = createVariableState({ name: 'Ada' });
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: NodeInputKeyEnum.textareaInput,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: 'plain text',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.textareaInput]).toBe('plain text');
    expect(variableState.getToRuntimeRecordCount()).toBe(0);
  });

  it('普通 value 对象转成 JSON，密码输入保留 secret wrapper', () => {
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: 'plainValue',
        label: 'Plain value',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: { value: 'hello' },
        valueType: WorkflowIOValueTypeEnum.string
      },
      {
        key: 'secretValue',
        label: 'Secret value',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { value: 'token' },
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: createVariableState().state
    });

    expect(params.plainValue).toBe('{"value":"hello"}');
    expect(params.secretValue).toEqual({ value: 'token' });
  });

  it('密码输入的 ref 会解析为节点输出或工作流变量值', () => {
    const variableState = createVariableState({ workflowToken: 'variable-token' });
    const node = createNode('target', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: 'nodeSecret',
        label: 'Node secret',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { ref: ['source', 'token'] },
        valueType: WorkflowIOValueTypeEnum.string
      },
      {
        key: 'variableSecret',
        label: 'Variable secret',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { ref: [VARIABLE_NODE_ID, 'workflowToken'] },
        valueType: WorkflowIOValueTypeEnum.string
      },
      {
        key: 'missingSecret',
        label: 'Missing secret',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { ref: ['missing-node', 'token'] },
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];
    const sourceNode = createNode('source', FlowNodeTypeEnum.textEditor);
    sourceNode.outputs = [
      {
        id: 'token',
        key: 'token',
        type: FlowNodeOutputTypeEnum.static,
        value: 'node-token',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map([['source', sourceNode]]),
      variableState: variableState.state
    });

    expect(params.nodeSecret).toBe('node-token');
    expect(params.variableSecret).toBe('variable-token');
    expect(params.missingSecret).toBeUndefined();
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('plugin input 密码 ref 也会解析为工作流变量值', () => {
    const variableState = createVariableState({ workflowToken: 'variable-token' });
    const node = createNode('plugin-input', FlowNodeTypeEnum.pluginInput);
    node.inputs = [
      {
        key: 'secret',
        label: 'Secret',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { ref: [VARIABLE_NODE_ID, 'workflowToken'] },
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.secret).toBe('variable-token');
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('普通变量模板按需构造 runtimeVariables 并完成替换', () => {
    const variableState = createVariableState({ name: 'Ada' });
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: NodeInputKeyEnum.textareaInput,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: 'Hello {{name}}',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.textareaInput]).toBe('Hello Ada');
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('节点输出模板按需构造 runtimeVariables 并完成替换', () => {
    const variableState = createVariableState({
      unused: {
        toJSON() {
          throw new Error('unused variable should not be stringified');
        }
      }
    });
    const node = createNode('target', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: NodeInputKeyEnum.textareaInput,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: 'Result: {{$source.output$}}',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];
    const sourceNode = createNode('source', FlowNodeTypeEnum.textEditor);
    sourceNode.outputs = [
      {
        id: 'output',
        key: 'output',
        type: FlowNodeOutputTypeEnum.static,
        value: 'done',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map([['source', sourceNode]]),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.textareaInput]).toBe('Result: done');
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('纯引用 input 直接解析原始对象', () => {
    const refValue = { nested: true };
    const variableState = createVariableState({ payload: refValue });
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: 'payload',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        value: [VARIABLE_NODE_ID, 'payload'],
        valueType: WorkflowIOValueTypeEnum.object
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.payload).toBe(refValue);
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('同节点引用工具参数时不读取 input value', () => {
    const variableState = createVariableState();
    const node = createNode('code', FlowNodeTypeEnum.code);
    node.inputs = [
      {
        key: 'customParam',
        label: '',
        canEdit: true,
        defaultToAgentGenerated: true,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
        value: 'agent value',
        valueType: WorkflowIOValueTypeEnum.string
      },
      {
        key: 'codeInput',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        value: ['code', 'customParam'],
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map([['code', node]]),
      variableState: variableState.state
    });

    expect(params.codeInput).toBeUndefined();
  });

  it('跨节点引用工具参数时不读取目标节点 input value', () => {
    const variableState = createVariableState();
    const node = createNode('code', FlowNodeTypeEnum.code);
    const sourceNode = createNode('source', FlowNodeTypeEnum.code);
    node.inputs = [
      {
        key: 'codeInput',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        value: ['source', 'customParam'],
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];
    sourceNode.inputs = [
      {
        key: 'customParam',
        label: '',
        canEdit: true,
        defaultToAgentGenerated: true,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
        value: 'agent value',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map([
        ['code', node],
        ['source', sourceNode]
      ]),
      variableState: variableState.state
    });

    expect(params.codeInput).toBeUndefined();
  });

  it('dynamic input 保持顶层和动态参数对象同步写入', () => {
    const variableState = createVariableState({ name: 'Ada' });
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: NodeInputKeyEnum.addInputParam,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
        value: undefined
      },
      {
        key: 'dynamicName',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: '{{name}}',
        valueType: WorkflowIOValueTypeEnum.string,
        canEdit: true
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.addInputParam]).toEqual({ dynamicName: 'Ada' });
    expect(params.dynamicName).toBe('Ada');
  });

  it('标签过滤条件行会解析行内引用并编成 tags JSON', () => {
    const variableState = createVariableState({ price: 18 });
    const node = createNode('search', FlowNodeTypeEnum.datasetSearchNode);
    node.inputs = [
      {
        key: NodeInputKeyEnum.collectionFilterMatch,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter, FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.string,
        value: {
          logic: 'AND',
          conditions: [
            {
              tag: 'price',
              tagType: 'number',
              op: '$gte',
              valueMode: 'reference',
              value: [VARIABLE_NODE_ID, 'price']
            }
          ]
        }
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.collectionFilterMatch]).toBe(
      JSON.stringify({ tags: { $and: [{ price: { $gte: 18 } }] } })
    );
    expect(variableState.getToRuntimeRecordCount()).toBe(1);
  });

  it('标签过滤关闭时，collectionFilterMatch 解析为 undefined', () => {
    const node = createNode('search', FlowNodeTypeEnum.datasetSearchNode);
    node.inputs = [
      {
        key: NodeInputKeyEnum.collectionFilterMatch,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
        valueType: WorkflowIOValueTypeEnum.string,
        value: {
          logic: 'AND',
          conditions: [{ tag: 'dept', op: '$eq', value: 'sales' }],
          open: false
        }
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: createVariableState({}).state
    });

    expect(params[NodeInputKeyEnum.collectionFilterMatch]).toBeUndefined();
  });

  it('Agent 嵌套 datasetParams 会解析标签过滤行内引用', () => {
    const variableState = createVariableState({ price: 18 });
    const node = createNode('agent', FlowNodeTypeEnum.agent);
    node.inputs = [
      {
        key: NodeInputKeyEnum.datasetParams,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.object,
        value: {
          datasets: [{ datasetId: 'dataset-1' }],
          collectionFilterMatch: {
            logic: 'AND',
            conditions: [
              {
                tag: 'price',
                tagType: 'number',
                op: '$gte',
                valueMode: 'reference',
                value: [VARIABLE_NODE_ID, 'price']
              }
            ]
          }
        }
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params[NodeInputKeyEnum.datasetParams]).toMatchObject({
      datasets: [{ datasetId: 'dataset-1' }],
      collectionFilterMatch: JSON.stringify({ tags: { $and: [{ price: { $gte: 18 } }] } })
    });
  });
});

describe('runWorkflow catchError', () => {
  it.each(['success', 'returned-error', 'thrown-error', 'returned-undefined'] as const)(
    'activates exactly one of the success and error routes for %s',
    async (outcome) => {
      const original = callbackMap[FlowNodeTypeEnum.textEditor];
      const called: string[] = [];
      callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async ({ node }) => {
        called.push(node.nodeId);
        if (node.nodeId === 'source') {
          if (outcome === 'thrown-error') throw new Error('failed');
          if (outcome === 'returned-error') return { error: new Error('failed'), data: {} };
          if (outcome === 'returned-undefined') return { error: undefined, data: {} };
        }
        return { data: {} };
      });
      const source = createNode('source', FlowNodeTypeEnum.textEditor);
      source.isEntry = true;
      source.catchError = true;
      source.outputs = [
        {
          id: 'successOutput',
          key: 'successOutput',
          type: FlowNodeOutputTypeEnum.static,
          label: '',
          valueType: WorkflowIOValueTypeEnum.string,
          required: true,
          defaultValue: 'default on success'
        }
      ];
      try {
        await runWorkflow({
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            id: '67e0d5535c02d1d5cdede721',
            name: 'branch routing',
            teamId: '654a4107c32f3bf5f998452f'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          uid: 'branch-routing-test',
          lang: 'zh-CN',
          histories: [],
          query: [],
          variables: {},
          chatConfig: {},
          runtimeNodes: [
            source,
            createNode('success', FlowNodeTypeEnum.textEditor),
            createNode('error', FlowNodeTypeEnum.textEditor)
          ],
          runtimeEdges: [
            createEdge('source', 'success', 'waiting', 'source-source-right'),
            createEdge('source', 'error', 'waiting', 'source-source_catch-right')
          ],
          variableState: createWorkflowVariableState(),
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          stream: false,
          responseDetail: true,
          responseAllData: true,
          checkIsStopping: () => false
        } as any);
        expect(called).toEqual(['source', outcome === 'success' ? 'success' : 'error']);
        expect(source.outputs[0].value).toBe(
          outcome === 'success' ? 'default on success' : undefined
        );
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = original;
      }
    }
  );

  it.each(['throw', 'return'] as const)(
    '捕获 %s 异常后，下游节点应能引用错误输出',
    async (mode) => {
      const originalTextEditorDispatch = callbackMap[FlowNodeTypeEnum.textEditor];
      const errorText = 'upstream failed';
      const appId = '67e0d5535c02d1d5cdede721';
      const teamId = '654a4107c32f3bf5f998452f';
      const tmbId = '65ab7007462ada7dbb899948';

      const error = new Error(errorText);
      callbackMap[FlowNodeTypeEnum.textEditor] = vi
        .fn()
        .mockImplementationOnce(async () => {
          if (mode === 'throw') throw error;
          return getNodeErrResponse({ error, customErr: { status: 429 } });
        })
        .mockImplementationOnce(async ({ params }) => {
          return {
            data: {
              [NodeOutputKeyEnum.text]: params[NodeInputKeyEnum.textareaInput]
            },
            [DispatchNodeResponseKeyEnum.nodeResponse]: {
              textOutput: params[NodeInputKeyEnum.textareaInput]
            }
          };
        });

      const sourceNode = createNode('source', FlowNodeTypeEnum.textEditor);
      sourceNode.isEntry = true;
      sourceNode.catchError = true;
      sourceNode.outputs = [
        {
          id: NodeOutputKeyEnum.errorText,
          key: NodeOutputKeyEnum.errorText,
          type: FlowNodeOutputTypeEnum.error,
          label: '',
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          id: 'status',
          key: 'status',
          type: FlowNodeOutputTypeEnum.error,
          label: '',
          valueType: WorkflowIOValueTypeEnum.number
        }
      ];

      const targetNode = createNode('target', FlowNodeTypeEnum.textEditor);
      targetNode.inputs = [
        {
          key: NodeInputKeyEnum.textareaInput,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          value: `caught: {{$source.${NodeOutputKeyEnum.errorText}$}}${mode === 'return' ? ' status={{$source.status$}}' : ''}`,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ];
      targetNode.outputs = [
        {
          id: NodeOutputKeyEnum.text,
          key: NodeOutputKeyEnum.text,
          type: FlowNodeOutputTypeEnum.static,
          label: '',
          valueType: WorkflowIOValueTypeEnum.string
        }
      ];

      try {
        const result = await runWorkflow({
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            id: appId,
            name: 'catch error test',
            teamId,
            tmbId
          },
          runningUserInfo: {
            teamId,
            tmbId,
            teamName: 'team',
            memberName: 'member',
            contact: '',
            username: 'user'
          },
          uid: 'user-catch-error-test',
          lang: 'zh-CN',
          histories: [],
          query: [],
          variables: {},
          chatConfig: {},
          runtimeNodes: [sourceNode, targetNode],
          runtimeEdges: [
            {
              source: 'source',
              target: 'target',
              sourceHandle: 'source-source_catch-right',
              targetHandle: 'target-target-left',
              status: 'waiting'
            }
          ],
          variableState: createWorkflowVariableState(),
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          stream: false,
          responseDetail: true,
          responseAllData: true,
          checkIsStopping: () => false
        } as any);

        expect(callbackMap[FlowNodeTypeEnum.textEditor]).toHaveBeenCalledTimes(2);
        expect(vi.mocked(callbackMap[FlowNodeTypeEnum.textEditor]).mock.calls[1][0].params).toEqual(
          expect.objectContaining({
            [NodeInputKeyEnum.textareaInput]: `caught: ${errorText}${mode === 'return' ? ' status=429' : ''}`
          })
        );
        expect(
          result.debugResponse.memoryNodes
            .find((node) => node.nodeId === 'source')
            ?.outputs.find((output) => output.key === NodeOutputKeyEnum.errorText)?.value
        ).toBe(errorText);
        expect(
          result.debugResponse.memoryNodes
            .find((node) => node.nodeId === 'target')
            ?.outputs.find((output) => output.key === NodeOutputKeyEnum.text)?.value
        ).toBe(`caught: ${errorText}${mode === 'return' ? ' status=429' : ''}`);
        expect(Object.hasOwn(result, 'error')).toBe(false);
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = originalTextEditorDispatch;
      }
    }
  );
});

describe('runWorkflow assistant response aggregation', () => {
  it('preserves reasoning when a stopped chat node has not produced answer text', async () => {
    const originalChatNodeDispatch = callbackMap[FlowNodeTypeEnum.chatNode];
    const reasoningText = 'Partial reasoning before the user stopped the workflow.';
    const chatNode = createNode('chat', FlowNodeTypeEnum.chatNode);
    chatNode.isEntry = true;

    callbackMap[FlowNodeTypeEnum.chatNode] = vi.fn().mockResolvedValue({
      data: {
        answerText: '',
        reasoningText
      },
      [DispatchNodeResponseKeyEnum.answerText]: '',
      [DispatchNodeResponseKeyEnum.reasoningText]: reasoningText
    });

    try {
      const result = await runWorkflow({
        apiVersion: 'v2',
        mode: 'chat',
        runningAppInfo: {
          id: '67e0d5535c02d1d5cdede721',
          name: 'reasoning persistence test',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        runningUserInfo: {
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948',
          teamName: 'team',
          memberName: 'member',
          contact: '',
          username: 'user'
        },
        uid: 'reasoning-persistence-test',
        lang: 'zh-CN',
        histories: [],
        query: [],
        variables: {},
        chatConfig: {},
        runtimeNodes: [chatNode],
        runtimeEdges: [],
        variableState: createWorkflowVariableState(),
        externalProvider: {},
        workflowDispatchDeep: 0,
        maxRunTimes: 10,
        stream: false,
        responseDetail: true,
        responseAllData: true,
        checkIsStopping: () => false
      } as any);

      expect(callbackMap[FlowNodeTypeEnum.chatNode]).toHaveBeenCalledTimes(1);
      expect(result[DispatchNodeResponseKeyEnum.assistantResponses]).toEqual([
        {
          reasoning: {
            content: reasoningText
          }
        }
      ]);
    } finally {
      callbackMap[FlowNodeTypeEnum.chatNode] = originalChatNodeDispatch;
    }
  });
});

describe('WorkflowQueue', () => {
  describe('WorkflowQueue utils', () => {
    // buildNodeEdgeGroupsMap 已经单独写了
    describe('buildEdgeIndex', () => {
      it('应该正确构建空边列表的索引', () => {
        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: [] });

        expect(result.bySource.size).toBe(0);
        expect(result.byTarget.size).toBe(0);
      });

      it('应该正确构建单条边的索引', () => {
        const edges = [createEdge('A', 'B', 'waiting')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('A')?.[0]).toEqual(edges[0]);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('B')?.[0]).toEqual(edges[0]);
      });

      it('应该正确构建多条边的索引 (A→B, B→C)', () => {
        const edges = [createEdge('A', 'B', 'waiting'), createEdge('B', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(1);
      });

      it('应该正确处理一个节点有多条输出边 (A→B, A→C)', () => {
        const edges = [createEdge('A', 'B', 'waiting'), createEdge('A', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(2);
        expect(result.byTarget.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(1);
      });

      it('应该正确处理一个节点有多条输入边 (A→C, B→C)', () => {
        const edges = [createEdge('A', 'C', 'waiting'), createEdge('B', 'C', 'active')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('C')).toHaveLength(2);
      });

      it('应该过滤掉 selectedTools 相关的边', () => {
        const edges = [
          createEdge('A', 'B', 'waiting'),
          createEdge('A', 'C', 'active', 'selectedTools', 'target-left'),
          createEdge('D', 'E', 'waiting', 'source-right', 'selectedTools')
        ];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        // 只有第一条边应该被索引
        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('A')?.[0].target).toBe('B');
        expect(result.bySource.has('D')).toBe(false);
        expect(result.byTarget.has('C')).toBe(false);
        expect(result.byTarget.has('E')).toBe(false);
      });

      it('应该正确处理循环边 (A→B→A)', () => {
        const edges = [createEdge('A', 'B', 'active'), createEdge('B', 'A', 'waiting')];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(1);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.byTarget.get('A')).toHaveLength(1);
        expect(result.byTarget.get('B')).toHaveLength(1);
      });

      it('应该正确处理复杂图结构', () => {
        const edges = [
          createEdge('A', 'B', 'active'),
          createEdge('A', 'C', 'active'),
          createEdge('B', 'D', 'waiting'),
          createEdge('C', 'D', 'waiting'),
          createEdge('D', 'E', 'skipped')
        ];

        const result = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });

        expect(result.bySource.get('A')).toHaveLength(2);
        expect(result.bySource.get('B')).toHaveLength(1);
        expect(result.bySource.get('C')).toHaveLength(1);
        expect(result.bySource.get('D')).toHaveLength(1);
        expect(result.byTarget.get('D')).toHaveLength(2);
      });
    });

    describe('getNodeRunStatus', () => {
      it('应该返回 run - 入口节点无输入边', () => {
        const node = createNode('A', FlowNodeTypeEnum.workflowStart);
        const nodeEdgeGroupsMap = new Map();

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 节点有空的边分组', () => {
        const node = createNode('A', FlowNodeTypeEnum.pluginInput);
        const nodeEdgeGroupsMap = new Map([['A', []]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有 active 且无 waiting', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'active')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有多个 active 且无 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'active')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 单组边中有 active 和 skipped，无 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 run - 多组边中任意一组满足条件（有 active 无 waiting）', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'active'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('run');
      });

      it('应该返回 skip - 单组边全部为 skipped', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('skip');
      });

      it('应该返回 skip - 单组边中多条边全部为 skipped', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'skipped'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('skip');
      });

      it('应该返回 skip - 多组边中任意一组全部为 skipped', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'skipped'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边全部为 waiting', () => {
        const node = createNode('B', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'B', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['B', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边中有 waiting 无 active', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'waiting'), createEdge('B', 'C', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 单组边中有 active 但也有 waiting', () => {
        const node = createNode('C', FlowNodeTypeEnum.pluginInput);
        const edges = [createEdge('A', 'C', 'active'), createEdge('B', 'C', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['C', [edges]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 多组边都不满足 run 或 skip 条件', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'waiting')];
        const group2 = [createEdge('B', 'D', 'waiting'), createEdge('C', 'D', 'skipped')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('应该返回 wait - 多组边中有 active+waiting 组合', () => {
        const node = createNode('D', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'D', 'active'), createEdge('B', 'D', 'waiting')];
        const group2 = [createEdge('C', 'D', 'waiting')];
        const nodeEdgeGroupsMap = new Map([['D', [group1, group2]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        expect(result).toBe('wait');
      });

      it('边界情况 - 空边组应该返回 skip（空数组的 every 返回 true）', () => {
        const node = createNode('A', FlowNodeTypeEnum.pluginInput);
        const nodeEdgeGroupsMap = new Map([['A', [[]]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        // 空数组的 every() 总是返回 true，所以 group.every(edge => edge.status === 'skipped') 为 true
        expect(result).toBe('skip');
      });

      it('复杂场景 - 三组边的优先级判断', () => {
        const node = createNode('E', FlowNodeTypeEnum.pluginInput);
        const group1 = [createEdge('A', 'E', 'waiting')]; // wait
        const group2 = [createEdge('B', 'E', 'skipped'), createEdge('C', 'E', 'skipped')]; // skip
        const group3 = [createEdge('D', 'E', 'active')]; // run
        const nodeEdgeGroupsMap = new Map([['E', [group1, group2, group3]]]);

        const result = WorkflowQueue.getNodeRunStatus({ node, nodeEdgeGroupsMap });

        // 任意一组满足 run 条件即返回 run
        expect(result).toBe('run');
      });
    });
  });
});

describe('Workflow runtime LLM token summary', () => {
  it.each(['return', 'throw', 'hidden'])(
    '保留 %s 节点的 token，并使用请求级 sink 统计 AppLog token',
    async (mode) => {
      const original = callbackMap[FlowNodeTypeEnum.textEditor];
      const publish = vi.fn(async (items: any[]) => items.map((item) => item.response));
      const node = createNode('summary-node', FlowNodeTypeEnum.textEditor);
      node.isEntry = true;
      callbackMap[FlowNodeTypeEnum.textEditor] = async ({ nodeSummary }) => {
        nodeSummary.mergeNodeSummary({
          llmInputTokens: mode === 'throw' ? 10 : 30,
          llmOutputTokens: mode === 'throw' ? 3 : 7
        });
        if (mode === 'throw') throw new Error('after LLM');
        return {
          ...(mode === 'hidden' ? {} : { responseData: { inputTokens: 900, outputTokens: 800 } })
        };
      };
      try {
        const result = await runWorkflow({
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            id: '67e0d5535c02d1d5cdede721',
            name: 'summary',
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: [node],
          runtimeEdges: [],
          variableState: createWorkflowVariableState(),
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          checkIsStopping: () => false,
          isToolCall: mode === 'throw',
          nodeResponseSink: {
            publish
          }
        } as any);
        const inputTokens = mode === 'throw' ? 10 : 30;
        const outputTokens = mode === 'throw' ? 3 : 7;
        expect(result.workflowRuntimeSummary).toMatchObject({
          llmInputTokens: mode === 'return' ? 930 : inputTokens,
          llmOutputTokens: mode === 'return' ? 807 : outputTokens
        });
        if (mode === 'throw') {
          expect(publish).toHaveBeenCalledWith([
            expect.objectContaining({
              response: expect.objectContaining({
                nodeId: 'summary-node',
                error: 'after LLM'
              }),
              emit: true
            })
          ]);
        }
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = original;
      }
    }
  );
});

describe('Workflow runtime error summary', () => {
  it('keeps container exceptions within the current run without changing its data route', async () => {
    const original = callbackMap[FlowNodeTypeEnum.parallelRun];
    const error = new UserConfigError('Invalid task key');
    const runRound = async (fails: boolean) => {
      const source = createNode('container', FlowNodeTypeEnum.parallelRun);
      source.isEntry = true;
      source.outputs = [
        {
          id: 'value',
          key: 'value',
          label: '',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ];
      const target = createNode('consumer', FlowNodeTypeEnum.textEditor);
      target.inputs = [
        {
          key: NodeInputKeyEnum.textareaInput,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: ['container', 'value'],
          valueType: WorkflowIOValueTypeEnum.string
        }
      ];
      target.outputs = [
        {
          id: NodeOutputKeyEnum.text,
          key: NodeOutputKeyEnum.text,
          label: '',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ];
      callbackMap[FlowNodeTypeEnum.parallelRun] = vi.fn(async ({ nodeSummary }) => {
        if (fails) nodeSummary.mergeNodeSummary({ error });
        return {
          data: { value: 'still returned' },
          responseData: {
            childrenResponses: fails
              ? [{ id: 'failed-task', moduleType: FlowNodeTypeEnum.chatNode, error: error.message }]
              : []
          }
        };
      });
      const result = await runWorkflow({
        apiVersion: 'v2',
        mode: 'chat',
        runningAppInfo: {
          id: '67e0d5535c02d1d5cdede721',
          name: 'container round',
          teamId: '654a4107c32f3bf5f998452f'
        },
        runningUserInfo: { teamId: '654a4107c32f3bf5f998452f', tmbId: '65ab7007462ada7dbb899948' },
        histories: [],
        query: [],
        chatConfig: {},
        runtimeNodes: [source, target],
        runtimeEdges: [createEdge('container', 'consumer')],
        variableState: createWorkflowVariableState(),
        externalProvider: {},
        workflowDispatchDeep: 0,
        maxRunTimes: 10,
        checkIsStopping: () => false
      } as any);
      expect(target.outputs[0].value).toBe('still returned');
      expect(Object.hasOwn(result, 'error')).toBe(fails);
      if (fails) expect(result.error).toBe(error);
      expect((result.workflowRuntimeSummary.errorCount ?? 0) > 0).toBe(fails);
      expect(result.workflowRuntimeSummary).not.toHaveProperty('error');
      expect(result.workflowRuntimeSummary).not.toHaveProperty('hasUserConfigError');
    };
    try {
      await runRound(true);
      await runRound(false);
    } finally {
      callbackMap[FlowNodeTypeEnum.parallelRun] = original;
    }
  });

  const configError = new UserConfigError('Invalid key', undefined, {
    cause: new Error('private-cause')
  });
  const systemError = new Error('Database unavailable', { cause: new Error('private-cause') });
  const textError = 'upstream request failed';
  const recordError = { message: 'upstream returned an error record' };
  const cases: { errors: unknown[]; expectedError: unknown; returnError?: boolean }[] = [
    { errors: [configError], expectedError: configError },
    { errors: [systemError], expectedError: systemError },
    { errors: [undefined], expectedError: undefined },
    { errors: [textError], expectedError: textError },
    { errors: [recordError], expectedError: recordError },
    { errors: [systemError], expectedError: systemError, returnError: true },
    { errors: [configError], expectedError: configError, returnError: true },
    { errors: [configError, systemError], expectedError: systemError },
    { errors: [systemError, configError], expectedError: systemError }
  ];
  it.each(cases)(
    'preserves the original uncaptured exception outside serialized node details: %j',
    async ({ errors, expectedError, returnError = false }) => {
      const original = callbackMap[FlowNodeTypeEnum.textEditor];
      const nodes = errors.map((_, index) => {
        const node = createNode(`raw-error-node-${index}`, FlowNodeTypeEnum.textEditor);
        node.isEntry = true;
        return node;
      });
      const publish = vi.fn(async (items: any[]) => items.map((item) => item.response));
      const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
      warn.mockClear();
      callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async ({ node }) => {
        const error = errors[nodes.findIndex((item) => item.nodeId === node.nodeId)];
        if (returnError) return getNodeErrResponse({ error, errorText: 'public failure text' });
        throw error;
      });

      try {
        const result = await runWorkflow({
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            id: '67e0d5535c02d1d5cdede721',
            name: 'raw error boundary',
            teamId: '654a4107c32f3bf5f998452f'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: nodes,
          runtimeEdges: [],
          variableState: createWorkflowVariableState(),
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          checkIsStopping: () => false,
          nodeResponseSink: { publish }
        } as any);

        expect(Object.hasOwn(result, 'error')).toBe(true);
        expect(result.error).toBe(expectedError);
        // 此处 logger 被 mock，只验证调度层提交原始 Error；日志降级由 logger 自身测例覆盖。
        const loggedErrors = errors.filter((error) => error instanceof Error);
        expect(warn).toHaveBeenCalledTimes(loggedErrors.length);
        for (const error of loggedErrors) {
          expect(warn).toHaveBeenCalledWith('Workflow node returned error', { error });
        }
        expect(result.workflowRuntimeSummary).toMatchObject({
          errorCount: errors.length
        });
        expect(result.workflowRuntimeSummary).not.toHaveProperty('error');
        expect(result.workflowRuntimeSummary).not.toHaveProperty('hasUserConfigError');
        for (const call of publish.mock.calls) {
          for (const { response } of call[0]) {
            expect(typeof response.error).toBe('string');
            expect(JSON.stringify(response)).not.toContain('private-cause');
          }
        }
        expect(JSON.stringify(result.debugResponse)).not.toContain('private-cause');
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = original;
        warn.mockRestore();
      }
    }
  );

  it.each(['error', 'errorText'] as const)(
    'does not log display-only responseData.%s',
    async (field) => {
      const original = callbackMap[FlowNodeTypeEnum.textEditor];
      const node = createNode('editor-node', FlowNodeTypeEnum.textEditor);
      node.isEntry = true;
      callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async () => ({
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          [field]: 'invalid API key'
        }
      }));
      const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
      const warn = vi.spyOn(logger, 'warn');
      const publish = vi.fn(async (items: any[]) => items.map((item) => item.response));
      warn.mockClear();

      try {
        const result = await runWorkflow({
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            id: '67e0d5535c02d1d5cdede721',
            name: 'node response error type',
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: [node],
          runtimeEdges: [],
          variableState: createWorkflowVariableState(),
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          checkIsStopping: () => false,
          nodeResponseSink: { publish }
        } as any);

        expect(result.workflowRuntimeSummary).toMatchObject({
          errorCount: 1,
          errorText: 'invalid API key'
        });
        expect(warn).not.toHaveBeenCalled();
        expect(Object.hasOwn(result, 'error')).toBe(false);
        expect(publish).toHaveBeenCalledWith([
          expect.objectContaining({
            response: expect.objectContaining({ [field]: 'invalid API key' })
          })
        ]);
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = original;
        warn.mockRestore();
      }
    }
  );

  it('工具执行错误只保留在节点详情中，不计入工作流失败', async () => {
    const original = callbackMap[FlowNodeTypeEnum.tool];
    const node = createNode('tool-node', FlowNodeTypeEnum.tool);
    node.isEntry = true;
    callbackMap[FlowNodeTypeEnum.tool] = vi.fn(async () => ({
      error: new UserConfigError('invalid API key'),
      data: { system_error_text: 'invalid API key' },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        error: 'invalid API key'
      }
    }));
    const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
    const warn = vi.spyOn(logger, 'warn');
    warn.mockClear();

    try {
      const result = await runWorkflow({
        apiVersion: 'v2',
        mode: 'chat',
        runningAppInfo: {
          id: '67e0d5535c02d1d5cdede721',
          name: 'tool error summary',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        runningUserInfo: {
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        histories: [],
        query: [],
        chatConfig: {},
        runtimeNodes: [node],
        runtimeEdges: [],
        variableState: createWorkflowVariableState(),
        externalProvider: {},
        workflowDispatchDeep: 0,
        maxRunTimes: 10,
        checkIsStopping: () => false
      } as any);

      expect(result.workflowRuntimeSummary).toMatchObject({
        errorCount: 0
      });
      expect(result.workflowRuntimeSummary.errorText).toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Workflow node returned error', {
        error: expect.objectContaining({ name: 'UserConfigError' })
      });
    } finally {
      callbackMap[FlowNodeTypeEnum.tool] = original;
    }
  });
});

describe('Workflow raw error logging', () => {
  it.each([
    { error: new Error('nested failure'), forwardError: false, logsPerRound: 1 },
    { error: new Error('nested failure'), forwardError: true, logsPerRound: 2 },
    { error: 'nested primitive failure', forwardError: true, logsPerRound: 0 }
  ])(
    'logs only raw Error instances without deduplicating layers: forward=$forwardError, logs=$logsPerRound',
    async ({ error, forwardError, logsPerRound }) => {
      const original = callbackMap[FlowNodeTypeEnum.textEditor];
      const logger = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);
      const warn = vi.spyOn(logger, 'warn');
      const diagnosticLog = vi.spyOn(logger, 'error');
      diagnosticLog.mockClear();
      warn.mockClear();
      let round = 0;
      callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async (props) => {
        if (props.node.nodeId === 'leaf') {
          logger.error('Feature diagnostic', { error });
          throw error;
        }

        const leaf = createNode('leaf', FlowNodeTypeEnum.textEditor);
        leaf.isEntry = true;
        const child = await runWorkflow({ ...props, runtimeNodes: [leaf], runtimeEdges: [] });
        // 子流程结束时已经完成上报，不依赖父节点处理返回值。
        expect(warn).toHaveBeenCalledTimes(
          (round - 1) * logsPerRound + (error instanceof Error ? 1 : 0)
        );
        expect(diagnosticLog).toHaveBeenCalledTimes(round);
        expect(child.error).toBe(error);
        return forwardError
          ? getNodeErrResponse({ error: child.error })
          : { responseData: { errorText: child.workflowRuntimeSummary.errorText } };
      });
      try {
        for (round = 1; round <= 2; round += 1) {
          const parent = createNode('parent', FlowNodeTypeEnum.textEditor);
          parent.isEntry = true;
          const result = await runWorkflow({
            apiVersion: 'v2',
            mode: 'chat',
            runningAppInfo: {
              id: '67e0d5535c02d1d5cdede721',
              sourceId: '67e0d5535c02d1d5cdede721',
              name: 'nested reporting',
              teamId: '654a4107c32f3bf5f998452f'
            },
            runningUserInfo: {
              teamId: '654a4107c32f3bf5f998452f',
              tmbId: '65ab7007462ada7dbb899948'
            },
            histories: [],
            query: [],
            chatConfig: {},
            runtimeNodes: [parent],
            runtimeEdges: [],
            variableState: createWorkflowVariableState(),
            externalProvider: {},
            workflowDispatchDeep: 0,
            maxRunTimes: 10,
            checkIsStopping: () => false
          } as any);
          if (forwardError) expect(result.error).toBe(error);
          else expect(result.workflowRuntimeSummary.errorText).toBe((error as Error).message);
          expect(result.workflowRuntimeSummary.errorCount).toBeGreaterThan(0);
          expect(result.workflowRuntimeSummary).not.toHaveProperty('hasError');
          expect(warn).toHaveBeenCalledTimes(round * logsPerRound);
          expect(diagnosticLog).toHaveBeenCalledTimes(round);
          if (logsPerRound > 0) {
            expect(warn).toHaveBeenLastCalledWith('Workflow node returned error', { error });
          }
        }
      } finally {
        callbackMap[FlowNodeTypeEnum.textEditor] = original;
        warn.mockRestore();
        diagnosticLog.mockRestore();
      }
    }
  );
});

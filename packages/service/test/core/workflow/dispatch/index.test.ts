import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowQueue,
  mergeAssistantResponseAnswerText
} from '@fastgpt/service/core/workflow/dispatch/index';
import { createClientAbortTracker } from '@fastgpt/service/core/workflow/dispatch/utils/clientAbort';
import { createNode, createEdge } from '../utils';

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

describe('mergeAssistantResponseAnswerText', () => {
  it('should merge consecutive plain text assistant values', () => {
    expect(
      mergeAssistantResponseAnswerText([
        { text: { content: 'first' } },
        { text: { content: ' second' } }
      ])
    ).toEqual([{ text: { content: 'first second' } }]);
  });

  it('should preserve reasoning boundaries for consecutive AI chat nodes', () => {
    expect(
      mergeAssistantResponseAnswerText([
        {
          reasoning: { content: 'think 1' },
          text: { content: 'answer 1' }
        },
        {
          reasoning: { content: 'think 2' },
          text: { content: 'answer 2' }
        }
      ])
    ).toEqual([
      {
        reasoning: { content: 'think 1' },
        text: { content: 'answer 1' }
      },
      {
        reasoning: { content: 'think 2' },
        text: { content: 'answer 2' }
      }
    ]);
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

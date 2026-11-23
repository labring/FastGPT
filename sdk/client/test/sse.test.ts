import { describe, expect, it } from 'vitest';
import { FastGptError, FastGptNetworkError, FastGptServerError } from '../src/core/errors';
import { ChatStream } from '../src/core/sse';

const createByteStreamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]!));
        idx += 1;
      } else {
        controller.close();
      }
    }
  });
};

const mockResponseInfo = {
  status: 200,
  headers: new Headers({ 'content-type': 'text/event-stream', 'x-request-id': 'sse-req-1' }),
  requestId: 'sse-req-1',
  url: 'https://api.example.com/api/v2/chat/completions'
};

describe('ChatStream & Multi-Event SSE Parser', () => {
  it('parses chunked CRLF/LF OpenAI deltas, FastGPT detail=true events, quotes, variables, and interactive prompts', async () => {
    // 故意在半个 UTF-8 多字节字符或半行边界切分分片，验证流式帧拼装稳健性
    const rawChunks = [
      ': heartbeat\r\n\r\n',
      'event: flowNodeStatus\r\ndata: {"status":"running","name":"知识库检索"}\r\n\r\n',
      'event: answer\ndata: {"choices":[{"delta":{"reasoning_content":"先分析"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"你好，"}}]}\n\n',
      'event: fastAnswer\ndata: {"choices":[{"delta":{"content":"FastGPT"}}]}\n\n',
      'event: flowNodeResponse\ndata: {"moduleName":"KB","quoteList":[{"id":"q1","q":"FAQ"}]}\n\n',
      'event: updateVariables\ndata: {"lang":"zh-CN"}\n\n',
      'event: interactive\ndata: {"type":"userSelect","params":{"userSelectOptions":["A","B"]}}\n\n',
      'event: chatTitle\ndata: {"title":"SDK 测试会话"}\n\n',
      'event: workflowDuration\ndata: {"durationSeconds":1.42}\n\n',
      'data: [DONE]\n\n'
    ];

    const stream = new ChatStream({
      body: createByteStreamFromChunks(rawChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const result = await stream.finalResult();
    expect(result.text).toBe('你好，FastGPT');
    expect(result.reasoningText).toBe('先分析');
    expect(result.chatTitle).toBe('SDK 测试会话');
    expect(result.durationSeconds).toBe(1.42);
    expect(result.variables).toEqual({ lang: 'zh-CN' });
    expect(result.quotes).toEqual([{ id: 'q1', q: 'FAQ' }]);
    expect(result.interactive).toEqual({
      type: 'userSelect',
      params: { userSelectOptions: ['A', 'B'] }
    });
    expect(result.nodeResponses).toHaveLength(1);
  });

  it('handles /core/chat/resume plain-text resumePhase frames and event: done gracefully', async () => {
    const rawChunks = [
      'event: resumePhase\ndata: catchup\n\n',
      'event: resumePhase\ndata: live\n\n',
      'event: answer\ndata: {"choices":[{"delta":{"content":"恢复后的内容"}}]}\n\n',
      'event: done\ndata: [DONE]\n\n'
    ];

    const stream = new ChatStream({
      body: createByteStreamFromChunks(rawChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const events = [];
    for await (const ev of stream) {
      events.push(ev);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'resumePhase', phase: 'catchup', raw: 'catchup' });
    expect(events[1]).toEqual({ type: 'resumePhase', phase: 'live', raw: 'live' });
    expect(events[2]?.type).toBe('answer');

    // 二次迭代同一流实例应显式报错防止静默空数据
    await expect(async () => {
      for await (const _ of stream) {
        // unreachable
      }
    }).rejects.toThrow(FastGptError);
  });

  it('throws mapped FastGptError in finalText() when an SSE error event arrives mid-stream', async () => {
    const rawChunks = [
      'data: {"choices":[{"delta":{"content":"部分输出"}}]}\n\n',
      'event: error\ndata: {"code":500,"statusText":"workflowError","message":"Node execution failed"}\n\n'
    ];

    const stream = new ChatStream({
      body: createByteStreamFromChunks(rawChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    await expect(stream.finalText()).rejects.toThrow(FastGptServerError);
  });

  it('triggers AbortController when abort() is called', () => {
    const controller = new AbortController();
    const stream = new ChatStream({
      body: createByteStreamFromChunks([]),
      response: mockResponseInfo,
      controller
    });

    expect(controller.signal.aborted).toBe(false);
    stream.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('allows calling finalResult() and finalText() after completing for-await iteration', async () => {
    const rawChunks = [
      'event: answer\ndata: {"choices":[{"delta":{"reasoning_content":"思考中","content":"第一段"}}]}\n\n',
      'event: answer\ndata: {"choices":[{"delta":{"content":"第二段"}}]}\n\n',
      'event: flowNodeResponse\ndata: {"moduleName":"Search","quoteList":[{"id":"q99"}]}\n\n',
      'event: chatTitle\ndata: "流式后聚合"\n\n',
      'data: [DONE]\n\n'
    ];

    const stream = new ChatStream({
      body: createByteStreamFromChunks(rawChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const deltas: string[] = [];
    for await (const event of stream) {
      if (event.type === 'answer') {
        deltas.push(event.textDelta);
      }
    }

    expect(deltas).toEqual(['第一段', '第二段']);

    const summary = await stream.finalResult();
    expect(summary.text).toBe('第一段第二段');
    expect(summary.reasoningText).toBe('思考中');
    expect(summary.chatTitle).toBe('流式后聚合');
    expect(summary.quotes).toEqual([{ id: 'q99' }]);
    await expect(stream.finalText()).resolves.toBe('第一段第二段');
  });

  it('supports awaiting finalResult() concurrently with for-await and returns partial snapshot after early break', async () => {
    const stream1 = new ChatStream({
      body: createByteStreamFromChunks([
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
        'data: [DONE]\n\n'
      ]),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const seen: string[] = [];
    const iter = stream1[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    if (!first.done && first.value.type === 'answer') {
      seen.push(first.value.textDelta);
    }

    // 在迭代进行中提前挂载 finalResult() Promise
    const concurrentFinal = stream1.finalResult();
    const second = await iter.next();
    if (!second.done && second.value.type === 'answer') {
      seen.push(second.value.textDelta);
    }
    const end = await iter.next();
    expect(end.done).toBe(true);

    expect(seen).toEqual(['A', 'B']);
    expect((await concurrentFinal).text).toBe('AB');

    // 提前 break 中断遍历后，finalResult() 返回已接收到的部分聚合结果
    const stream2 = new ChatStream({
      body: createByteStreamFromChunks([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"World"}}]}\n\n',
        'data: [DONE]\n\n'
      ]),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    for await (const event of stream2) {
      if (event.type === 'answer') {
        break;
      }
    }
    expect(stream2.state).toBe('closed');
    await expect(stream2.finalText()).resolves.toBe('Hello');
  });

  it('propagates mid-stream transport failure to finalText()/finalResult() instead of returning partial text', async () => {
    const encoder = new TextEncoder();
    let chunkCount = 0;
    const failingBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunkCount += 1;
        if (chunkCount === 1) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"首段"}}]}\n\n')
          );
          return;
        }
        controller.error(new Error('socket hang up'));
      }
    });

    const stream = new ChatStream({
      body: failingBody,
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const deltas: string[] = [];
    let iterError: unknown;
    try {
      for await (const ev of stream) {
        if (ev.type === 'answer') {
          deltas.push(ev.textDelta);
        }
      }
    } catch (err) {
      iterError = err;
    }

    expect(deltas).toEqual(['首段']);
    expect(iterError).toBeInstanceOf(Error);
    expect((iterError as Error).message).toBe('socket hang up');
    expect(stream.state).toBe('failed');

    // 迭代失败后调用 finalText()/finalResult() 必须共享失败终态并拒绝，绝不返回截断的首段文本
    await expect(stream.finalText()).rejects.toThrow('socket hang up');
    await expect(stream.finalResult()).rejects.toThrow('socket hang up');
  });

  it('rejects iteration and aggregation with aborted state when aborted mid-stream and invokes onDispose once', async () => {
    const encoder = new TextEncoder();
    let disposeCount = 0;
    let firstSent = false;
    const slowBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!firstSent) {
          firstSent = true;
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"进行中"}}]}\n\n')
          );
          return;
        }
        // 后续 chunk 永远挂起，直到收到 abort 取消信号
        return new Promise<void>(() => {});
      }
    });

    const controller = new AbortController();
    const stream = new ChatStream({
      body: slowBody,
      response: mockResponseInfo,
      controller,
      onDispose: () => {
        disposeCount += 1;
      }
    });

    const deltas: string[] = [];
    let iterErr: unknown;
    try {
      for await (const ev of stream) {
        if (ev.type === 'answer') {
          deltas.push(ev.textDelta);
          stream.abort();
        }
      }
    } catch (err) {
      iterErr = err;
    }

    expect(deltas).toEqual(['进行中']);
    expect(iterErr).toBeInstanceOf(FastGptError);
    expect(stream.state).toBe('aborted');
    expect(disposeCount).toBe(1);
    await expect(stream.finalText()).rejects.toThrow(FastGptError);
    await expect(stream.finalResult()).rejects.toThrow(FastGptError);
    expect(disposeCount).toBe(1);
  });

  it('parses real FastGPT server chatTitle object wire format { title } without stringifying to [object Object]', async () => {
    const stream = new ChatStream({
      body: createByteStreamFromChunks([
        'event: chatTitle\ndata: {"title":"服务端生成的标题"}\n\n',
        'data: {"choices":[{"delta":{"content":"内容"}}]}\n\n',
        'data: [DONE]\n\n'
      ]),
      response: mockResponseInfo,
      controller: new AbortController()
    });

    const titleEvents: string[] = [];
    for await (const ev of stream) {
      if (ev.type === 'chatTitle') {
        titleEvents.push(ev.title);
      }
    }

    expect(titleEvents).toEqual(['服务端生成的标题']);
    const result = await stream.finalResult();
    expect(result.chatTitle).toBe('服务端生成的标题');
    expect(stream.state).toBe('completed');
  });

  it('immediately settles aborted state and cancels underlying reader when aborted while iterator is paused at yield', async () => {
    const encoder = new TextEncoder();
    let cancelCount = 0;
    let disposeCount = 0;
    let chunkSent = false;

    const pausableBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!chunkSent) {
          chunkSent = true;
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n')
          );
          return;
        }
        return new Promise<void>(() => {});
      },
      cancel() {
        cancelCount += 1;
      }
    });

    const controller = new AbortController();
    const stream = new ChatStream({
      body: pausableBody,
      response: mockResponseInfo,
      controller,
      onDispose: () => {
        disposeCount += 1;
      }
    });

    const iter = stream[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    if (!first.done && first.value.type === 'answer') {
      expect(first.value.textDelta).toBe('第一段');
    }

    // 消费者暂停在 yield 后不再主动调用 iter.next()，此时挂载 finalText() 并触发 abort()
    const pendingFinal = stream.finalText();
    stream.abort(new Error('user cancelled'));

    // 必须立即结算为 aborted 并取消底层 reader，绝不能依赖消费者再次拉取 iter.next() 才解除挂起
    expect(stream.state).toBe('aborted');
    expect(disposeCount).toBe(1);
    await expect(pendingFinal).rejects.toThrow(FastGptError);
    expect(cancelCount).toBe(1);

    // 之后若消费者恢复推进 iter.next()，必须立即抛出同一中止异常
    await expect(iter.next()).rejects.toThrow(FastGptError);
    expect(disposeCount).toBe(1);

    // 同样验证外部 AbortController.abort() 在暂停期触发时的独立结算行为
    let externalCancelCount = 0;
    let externalSent = false;
    const externalController = new AbortController();
    const externalStream = new ChatStream({
      body: new ReadableStream<Uint8Array>({
        pull(ctrl) {
          if (!externalSent) {
            externalSent = true;
            ctrl.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"片段"}}]}\n\n'));
            return;
          }
          return new Promise<void>(() => {});
        },
        cancel() {
          externalCancelCount += 1;
        }
      }),
      response: mockResponseInfo,
      controller: externalController
    });

    const externalIter = externalStream[Symbol.asyncIterator]();
    await externalIter.next();
    const externalFinal = externalStream.finalResult();
    externalController.abort(new Error('external timeout'));

    expect(externalStream.state).toBe('aborted');
    await expect(externalFinal).rejects.toThrow(FastGptError);
    expect(externalCancelCount).toBe(1);
  });

  it('rejects with FastGptNetworkError and marks state=failed when EOF arrives before [DONE] termination frame', async () => {
    const truncatedChunks = ['data: {"choices":[{"delta":{"content":"未写完的回复"}}]}\n\n'];

    // 1. 直接调用 finalText() / finalResult() 必须识别截断并失败
    const stream1 = new ChatStream({
      body: createByteStreamFromChunks(truncatedChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });
    await expect(stream1.finalText()).rejects.toThrow(FastGptNetworkError);
    expect(stream1.state).toBe('failed');
    await expect(stream1.finalResult()).rejects.toThrow(FastGptNetworkError);

    // 2. for await 消费完毕但未收到 [DONE] 时同样必须抛错，避免误判 completed
    const stream2 = new ChatStream({
      body: createByteStreamFromChunks(truncatedChunks),
      response: mockResponseInfo,
      controller: new AbortController()
    });
    const deltas: string[] = [];
    let caught: unknown;
    try {
      for await (const ev of stream2) {
        if (ev.type === 'answer') {
          deltas.push(ev.textDelta);
        }
      }
    } catch (err) {
      caught = err;
    }

    expect(deltas).toEqual(['未写完的回复']);
    expect(caught).toBeInstanceOf(FastGptNetworkError);
    expect(stream2.state).toBe('failed');
    await expect(stream2.finalText()).rejects.toThrow(FastGptNetworkError);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createChatService, type ChatOperation } from '../../src/domain/chat/chat-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

const APP_ID = '68ad85a7463006c963799a05';
const OTHER_APP_ID = '68ad85a7463006c963799a06';
const service = createChatService();

function makeClient(response: unknown = null): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn().mockResolvedValue(response),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('createChatService', () => {
  it('uses API defaults, returns structured App replies, and generates IDs for a new conversation', async () => {
    const response = {
      id: 'new-chat',
      choices: [{ message: { content: [{ interactive: { title: 'Continue?' } }] } }],
      newVariables: { step: 1 }
    };
    const client = makeClient(response);
    const result = await service.execute({
      operation: 'run',
      client,
      credential: { kind: 'token' },
      input: {
        appId: APP_ID,
        chatId: '',
        messages: [{ role: 'user', content: 'Hello' }],
        detail: true,
        metadata: { request: 'r1' }
      }
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v2/chat/completions',
        timeoutMs: 300000,
        body: expect.objectContaining({
          appId: APP_ID,
          chatId: expect.stringMatching(/^.{24}$/),
          responseChatItemId: expect.any(String),
          stream: false,
          variables: {},
          detail: true,
          retainDatasetCite: false,
          showSkillReferences: false,
          metadata: { request: 'r1' }
        })
      })
    );
    expect(result).toMatchObject({ changed: true, data: response });
  });

  it('supports variable-only App requests and an explicit timeout', async () => {
    const client = makeClient();
    await service.execute({
      operation: 'run',
      client,
      input: { appId: APP_ID, variables: { topic: 'x' } },
      timeoutMs: '600000'
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 600000,
        body: expect.objectContaining({ messages: [], variables: { topic: 'x' } })
      })
    );
  });

  it.each(['token', 'personalKey'] as const)('requires appId for %s credentials', async (kind) => {
    const client = makeClient();
    await expect(
      service.execute({ operation: 'history list', client, credential: { kind }, input: {} })
    ).rejects.toThrow('--appId');
    expect(client.request).not.toHaveBeenCalled();
  });

  it('lets App Keys infer their bound App and rejects a conflicting explicit App', async () => {
    const client = makeClient({ list: [], total: 0 });
    const credential = { kind: 'appKey' as const, boundAppId: APP_ID };
    await service.execute({ operation: 'history list', client, credential, input: {} });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.not.objectContaining({ appId: expect.anything() }) })
    );
    await service.execute({
      operation: 'history list',
      client,
      credential,
      input: { appId: APP_ID }
    });
    await expect(
      service.execute({
        operation: 'history list',
        client,
        credential,
        input: { appId: OTHER_APP_ID }
      })
    ).rejects.toThrow('does not match');
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it('defers target inference for an unclassified raw API Key to server authentication', async () => {
    const client = makeClient({ list: [], total: 0 });
    await service.execute({
      operation: 'history list',
      client,
      credential: { kind: 'unknownApiKey' },
      input: {}
    });
    expect(client.request).toHaveBeenCalledOnce();
  });

  it.each(['skillId', 'sourceType', 'sourceId', 'shareId', 'outLinkUid', 'outLinkAuthData'])(
    'rejects unsupported target field %s before sending HTTP',
    async (key) => {
      const client = makeClient();
      await expect(
        service.execute({
          operation: 'run',
          client,
          input: { appId: APP_ID, [key]: 'other-target' }
        })
      ).rejects.toThrow('only accept App');
      expect(client.request).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['token', 'customUid'],
    ['token', 'authProxy'],
    ['appKey', 'authProxy']
  ] as const)('rejects %s with incompatible identity field %s locally', async (kind, field) => {
    const client = makeClient();
    await expect(
      service.execute({
        operation: 'init',
        client,
        credential: { kind },
        input: {
          appId: APP_ID,
          chatId: 'chat',
          [field]: field === 'customUid' ? 'user' : { username: 'alice' }
        }
      })
    ).rejects.toThrow('requires');
    expect(client.request).not.toHaveBeenCalled();
  });

  it('sends proxy identity as JSON in Query and as an object in Body without internal source fields', async () => {
    const client = makeClient();
    const input = { appId: APP_ID, chatId: 'chat /?&', authProxy: { username: 'alice' } };
    for (const operation of ['init', 'history delete', 'stop'] as const) {
      await service.execute({ operation, client, input, credential: { kind: 'personalKey' } });
    }
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/core/chat/init',
      query: { ...input, authProxy: '{"username":"alice"}' }
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'DELETE',
      path: '/core/chat/history/delHistory',
      query: { ...input, authProxy: '{"username":"alice"}' }
    });
    expect(client.request).toHaveBeenNthCalledWith(3, {
      method: 'POST',
      path: '/v2/chat/stop',
      body: input
    });
  });

  it('preserves false and empty strings in updates and requires at least one change', async () => {
    const client = makeClient();
    const input = { appId: APP_ID, chatId: 'chat', top: false, customTitle: '', title: '' };
    await service.execute({ operation: 'history update', client, input });
    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/core/chat/history/updateHistory',
      body: input
    });
    await expect(
      service.execute({
        operation: 'history update',
        client,
        input: { appId: APP_ID, chatId: 'chat' }
      })
    ).rejects.toThrow('Provide');
  });

  it('keeps offset precedence, shared page-size caps, filters, and pagination metadata', async () => {
    const client = makeClient({ list: [{ chatId: 'a' }, { chatId: 'b' }], total: 503 });
    const result = await service.execute({
      operation: 'history list',
      client,
      input: {
        appId: APP_ID,
        offset: '500',
        pageNum: 'invalid-but-ignored',
        pageSize: '1000',
        source: 'api',
        startCreateTime: '2026-11-01'
      }
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          appId: APP_ID,
          offset: 500,
          pageSize: 500,
          source: 'api',
          startCreateTime: '2026-11-01'
        }
      })
    );
    expect(result.meta).toMatchObject({
      total: 503,
      pageSize: 500,
      offset: 500,
      count: 2,
      hasMore: true
    });
    const page = await service.execute({
      operation: 'history list',
      client,
      input: { appId: APP_ID, pageNum: 2, pageSize: 5 }
    });
    expect(page.meta).toMatchObject({ page: 2, offset: 5, pageSize: 5 });
  });

  it('forwards server cursors without rebuilding them from the list, including empty pages', async () => {
    const client = makeClient({
      list: [
        { dataId: 'shared-round-id', obj: 'Human' },
        { dataId: 'shared-round-id', obj: 'AI' }
      ],
      total: 99,
      hasMorePrev: true,
      hasMoreNext: true,
      prevCursor: 'server-prev-anchor',
      nextCursor: 'server-next-anchor'
    });
    const result = await service.execute({
      operation: 'record list',
      client,
      input: {
        appId: APP_ID,
        chatId: 'chat',
        prevId: 'anchor',
        includeDeleted: true,
        loadCustomFeedbacks: true
      }
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/core/chat/record/getRecords_v2',
        body: {
          appId: APP_ID,
          chatId: 'chat',
          pageSize: 20,
          prevId: 'anchor',
          includeDeleted: true,
          loadCustomFeedbacks: true
        }
      })
    );
    expect(result.meta).toMatchObject({
      prevCursor: 'server-prev-anchor',
      nextCursor: 'server-next-anchor',
      pageSize: 20,
      count: 2,
      total: 99
    });
    const empty = await service.execute({
      operation: 'record list',
      client: makeClient({
        list: [],
        total: 0,
        hasMorePrev: false,
        hasMoreNext: false,
        prevCursor: null,
        nextCursor: null
      }),
      input: { appId: APP_ID, chatId: 'chat' }
    });
    expect(empty.meta).toMatchObject({ count: 0, prevCursor: null, nextCursor: null });
  });

  it.each([
    ['record list', { prevId: 'a', nextId: 'b' }],
    ['record list', { initialId: 'a', prevId: 'b' }],
    ['record list', { nextId: '' }],
    ['record list', { nextId: 'round', role: 'assistant' }],
    ['record list', { role: 'AI' }],
    ['record list', { type: 'home' }],
    ['record list', { chatId: '' }],
    ['record detail', { chatId: undefined, dataId: 'x' }],
    ['record detail', { dataId: '' }],
    ['history status', { chatIds: [] }],
    ['history status', { chatIds: Array.from({ length: 201 }, () => 'x') }],
    ['stop', { customUid: 'u', authProxy: { username: 'alice' } }],
    ['run', { stream: true }]
  ] satisfies [ChatOperation, Record<string, unknown>][])(
    'rejects invalid %s input %j',
    async (operation, extra) => {
      const client = makeClient();
      await expect(
        service.execute({ operation, client, input: { appId: APP_ID, chatId: 'chat', ...extra } })
      ).rejects.toThrow();
      expect(client.request).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, 'oops', '1.5', 2147483648])(
    'rejects invalid run timeout %s',
    async (timeoutMs) => {
      const client = makeClient();
      await expect(
        service.execute({ operation: 'run', client, input: { appId: APP_ID }, timeoutMs })
      ).rejects.toThrow();
      expect(client.request).not.toHaveBeenCalled();
    }
  );

  it.each(['run', 'stop', 'history mark-read', 'history update', 'history delete'] as const)(
    'previews %s locally and redacts nested credentials',
    async (operation) => {
      const client = makeClient();
      const result = await service.execute({
        operation,
        client,
        dryRun: true,
        input: {
          appId: APP_ID,
          chatId: 'chat',
          top: false,
          metadata: { password: 'sensitive-password' }
        }
      });
      expect(result).toMatchObject({
        changed: false,
        data: { dryRun: true, operation: `chat ${operation}` }
      });
      expect(JSON.stringify(result)).not.toContain('sensitive-password');
      expect(client.request).not.toHaveBeenCalled();
    }
  );

  it('reports a written stop signal without claiming background execution has completed', async () => {
    const client = makeClient({ success: true, completed: false });
    const result = await service.execute({
      operation: 'stop',
      client,
      input: { appId: APP_ID, chatId: 'chat' }
    });
    expect(result).toMatchObject({
      changed: true,
      data: { success: true, completed: false },
      message: expect.stringContaining('may still be finishing')
    });
  });

  it('propagates generation errors with no retry', async () => {
    const client = makeClient();
    const error = new Error('busy');
    vi.mocked(client.request).mockRejectedValue(error);
    await expect(
      service.execute({ operation: 'run', client, input: { appId: APP_ID } })
    ).rejects.toBe(error);
    expect(client.request).toHaveBeenCalledOnce();
  });
});

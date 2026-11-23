import { describe, expect, it, vi } from 'vitest';
import { createChatFeedbackService } from '../../src/domain/chat/chat-feedback-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../src/shared/errors';

const APP_ID = '68ad85a7463006c963799a05';
const OTHER_APP_ID = '68ad85a7463006c963799a06';
const service = createChatFeedbackService();

function makeClient(response: unknown = null): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn().mockResolvedValue(response),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('createChatFeedbackService', () => {
  it('submits good, bad, and clear feedback without sending internal source fields', async () => {
    const client = makeClient(null);

    const goodRes = await service.update({
      client,
      credential: { kind: 'token' },
      input: {
        appId: APP_ID,
        chatId: 'chat-1',
        dataId: 'data-1',
        userGoodFeedback: 'Accurate summary'
      }
    });
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/core/chat/feedback/updateUserFeedback',
      body: {
        appId: APP_ID,
        chatId: 'chat-1',
        dataId: 'data-1',
        userGoodFeedback: 'Accurate summary'
      }
    });
    expect(goodRes).toMatchObject({ changed: true, data: null });

    await service.update({
      client,
      credential: { kind: 'personalKey' },
      input: {
        appId: APP_ID,
        chatId: 'chat-1',
        dataId: 'data-1',
        userBadFeedback: 'Missing citations',
        authProxy: { username: 'alice' }
      }
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/core/chat/feedback/updateUserFeedback',
      body: {
        appId: APP_ID,
        chatId: 'chat-1',
        dataId: 'data-1',
        userBadFeedback: 'Missing citations',
        authProxy: { username: 'alice' }
      }
    });

    await service.update({
      client,
      credential: { kind: 'appKey', boundAppId: APP_ID },
      input: {
        chatId: 'chat-1',
        dataId: 'data-1',
        customUid: 'visitor-1',
        clear: true
      }
    });
    const thirdCallBody = vi.mocked(client.request).mock.calls[2][0].body as Record<
      string,
      unknown
    >;
    expect(thirdCallBody).toEqual({
      chatId: 'chat-1',
      dataId: 'data-1',
      customUid: 'visitor-1'
    });
    expect(thirdCallBody).not.toHaveProperty('appId');
    expect(thirdCallBody).not.toHaveProperty('userGoodFeedback');
    expect(thirdCallBody).not.toHaveProperty('userBadFeedback');
    expect(thirdCallBody).not.toHaveProperty('clear');
  });

  it('rejects --clear combined with --good/--bad and rejects missing feedback action', async () => {
    const client = makeClient();

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: { appId: APP_ID, chatId: 'chat-1', dataId: 'data-1' }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: {
          appId: APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          userGoodFeedback: 'nice',
          clear: true
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: {
          appId: APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          userBadFeedback: 'bad',
          clear: true
        }
      })
    ).rejects.toBeInstanceOf(CliArgumentError);

    expect(client.request).not.toHaveBeenCalled();
  });

  it('enforces App-only targets and credential/identity guards matching chat-service', async () => {
    const client = makeClient();

    for (const key of [
      'skillId',
      'sourceType',
      'sourceId',
      'shareId',
      'outLinkUid',
      'outLinkAuthData'
    ]) {
      await expect(
        service.update({
          client,
          credential: { kind: 'token' },
          input: {
            appId: APP_ID,
            chatId: 'chat-1',
            dataId: 'data-1',
            userGoodFeedback: 'ok',
            [key]: 'other'
          }
        })
      ).rejects.toThrow('only accept App');
    }

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: { chatId: 'chat-1', dataId: 'data-1', userGoodFeedback: 'ok' }
      })
    ).rejects.toThrow('--appId');

    await expect(
      service.update({
        client,
        credential: { kind: 'personalKey' },
        input: { chatId: 'chat-1', dataId: 'data-1', userGoodFeedback: 'ok' }
      })
    ).rejects.toThrow('--appId');

    await expect(
      service.update({
        client,
        credential: { kind: 'appKey', boundAppId: APP_ID },
        input: {
          appId: OTHER_APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('does not match');

    await expect(
      service.update({
        client,
        credential: { kind: 'personalKey' },
        input: {
          appId: APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          customUid: 'u1',
          authProxy: { username: 'alice' },
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('mutually exclusive');

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: {
          appId: APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          customUid: 'u1',
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('API Key');

    await expect(
      service.update({
        client,
        credential: { kind: 'token' },
        input: {
          appId: APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          authProxy: { username: 'alice' },
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('personal API Key');

    await expect(
      service.update({
        client,
        credential: { kind: 'appKey', boundAppId: APP_ID },
        input: {
          chatId: 'chat-1',
          dataId: 'data-1',
          authProxy: { username: 'alice' },
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('personal API Key');

    await expect(
      service.update({
        client,
        credential: { kind: 'unknownApiKey', boundAppId: APP_ID },
        input: {
          appId: OTHER_APP_ID,
          chatId: 'chat-1',
          dataId: 'data-1',
          userGoodFeedback: 'ok'
        }
      })
    ).rejects.toThrow('does not match');

    expect(client.request).not.toHaveBeenCalled();
  });

  it('supports dryRun preview with secret redaction and without HTTP calls', async () => {
    const client = makeClient();
    const res = await service.update({
      client,
      credential: { kind: 'token' },
      dryRun: true,
      input: {
        appId: APP_ID,
        chatId: 'chat-1',
        dataId: 'data-1',
        userGoodFeedback: 'Bearer fastgpt-secret-token-12345678901234567890'
      }
    });

    expect(res).toMatchObject({
      changed: false,
      data: {
        dryRun: true,
        operation: 'chat feedback update',
        risk: 'write',
        method: 'POST',
        path: '/core/chat/feedback/updateUserFeedback'
      }
    });
    expect(JSON.stringify(res)).not.toContain('fastgpt-secret-token-12345678901234567890');
    expect(client.request).not.toHaveBeenCalled();
  });
});

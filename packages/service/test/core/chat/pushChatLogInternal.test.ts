import http from 'http';
import os from 'os';
import { Types } from '@fastgpt/service/common/mongo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { pushChatLog } from '@fastgpt/service/core/chat/pushChatLog';
import { serviceEnv } from '@fastgpt/service/env';

const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy'
] as const;

/**
 * CHAT_LOG_URL 由部署方配置，常见部署为内网日志服务。
 * 打开 CHECK_INTERNAL_IP 后，聊天日志推送仍然必须可达，否则日志整体丢失。
 */
describe('pushChatLog 访问内网日志服务', () => {
  const mutableServiceEnv = serviceEnv as {
    CHECK_INTERNAL_IP: boolean;
    CHAT_LOG_URL?: string;
    CHAT_LOG_INTERVAL?: number;
    CHAT_LOG_SOURCE_ID_PREFIX?: string;
  };
  const originalEnv = {
    CHECK_INTERNAL_IP: serviceEnv.CHECK_INTERNAL_IP,
    CHAT_LOG_URL: serviceEnv.CHAT_LOG_URL,
    CHAT_LOG_INTERVAL: serviceEnv.CHAT_LOG_INTERVAL,
    CHAT_LOG_SOURCE_ID_PREFIX: serviceEnv.CHAT_LOG_SOURCE_ID_PREFIX
  };
  const originalProxyEnv = proxyEnvKeys.map((key) => process.env[key]);

  afterEach(() => {
    Object.assign(mutableServiceEnv, originalEnv);
    proxyEnvKeys.forEach((key, index) => {
      const value = originalProxyEnv[index];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('CHECK_INTERNAL_IP=true 时仍然推送聊天日志到私网服务', async () => {
    proxyEnvKeys.forEach((key) => delete process.env[key]);

    // 取一个非 loopback 的本机地址：loopback/metadata 在开关关闭时也会被拦截，无法验证私网放行行为。
    const privateHost = Object.values(os.networkInterfaces())
      .flatMap((items) => items ?? [])
      .find((item) => item.family === 'IPv4' && !item.internal)?.address;
    if (!privateHost) return;

    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        received.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Invalid test server address');
    }

    const appId = String(new Types.ObjectId());
    const chatId = 'push-chat-log-internal-chat';
    const teamId = String(new Types.ObjectId());
    const tmbId = String(new Types.ObjectId());
    const [humanItem, aiItem] = await MongoChatItem.create([
      {
        teamId,
        tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId,
        chatId,
        dataId: 'push-chat-log-human',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'question' } }]
      },
      {
        teamId,
        tmbId,
        sourceType: ChatSourceTypeEnum.app,
        appId,
        chatId,
        dataId: 'push-chat-log-ai',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'answer' } }]
      }
    ]);
    await MongoChat.create({
      appId,
      chatId,
      teamId,
      tmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: 'test',
      title: 'internal chat log'
    });

    try {
      mutableServiceEnv.CHECK_INTERNAL_IP = true;
      mutableServiceEnv.CHAT_LOG_URL = `http://${privateHost}:${address.port}`;
      mutableServiceEnv.CHAT_LOG_INTERVAL = 10;
      mutableServiceEnv.CHAT_LOG_SOURCE_ID_PREFIX = 'test-';

      pushChatLog({
        chatId,
        chatItemIdHuman: String(humanItem._id),
        chatItemIdAi: String(aiItem._id),
        appId
      });

      await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 5000 });
      expect(received[0]).toMatchObject({
        url: '/api/chat/push',
        body: {
          chatId,
          question: 'question',
          answer: 'answer',
          sourceId: `test-${appId}`
        }
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});

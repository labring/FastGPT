import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import OpenAI from '@fastgpt/global/core/ai';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getLegacyOpenAIRequestOptions
} from '@fastgpt/service/core/ai/legacy/requestUrl';

/**
 * 自定义端点的鉴权回归测试。
 * 直接走真实 OpenAI SDK + 本地 HTTP 服务，防止"请求级 headers 看似正确、
 * 但客户端默认 Authorization 仍被带出"的问题回归。
 */
describe('legacy endpoint wire-level auth', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  const startServer = async () => {
    const seen: Array<string | undefined> = [];
    server = http.createServer((req, res) => {
      seen.push(req.headers.authorization);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: '1',
          object: 'chat.completion',
          created: 0,
          model: 'x',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }
          ]
        })
      );
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { port, seen };
  };

  const requestWith = async ({
    port,
    requestAuth
  }: {
    port: number;
    requestAuth?: string;
  }) => {
    const model = {
      scope: ModelScopeEnum.team,
      tmbId: 'tmb-123',
      requestUrl: `http://127.0.0.1:${port}/v1/chat/completions`,
      requestAuth
    };
    // 模拟 getAIApi 在无用户 Key 时的客户端：默认 apiKey 是代理令牌。
    const ai = new OpenAI({ apiKey: 'proxy-secret-token', baseURL: 'http://127.0.0.1:1/v1' });

    await ai.chat.completions.create(
      { model: 'x', messages: [{ role: 'user', content: 'hi' }] },
      getLegacyOpenAIRequestOptions({
        model,
        usedUserOpenAIKey: false,
        headers: {},
        scopeHeaders: { 'X-Aiproxy-Group': 'group-a' }
      })
    );
  };

  it('never sends the proxy token when requestAuth is empty', async () => {
    const { port, seen } = await startServer();

    await requestWith({ port });

    expect(seen).toEqual([undefined]);
  });

  it('sends the configured requestAuth instead of the proxy token', async () => {
    const { port, seen } = await startServer();

    await requestWith({ port, requestAuth: 'team-secret' });

    expect(seen).toEqual(['Bearer team-secret']);
  });
});

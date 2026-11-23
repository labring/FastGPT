import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AIProxyClient } from '../../../thirdProvider/aiproxy/client';
import { GetChannelDashboardResponseSchema } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';

let server: Server;
let client: AIProxyClient;
let usage: { cached_tokens?: number; cache_creation_tokens?: number };
let requests: { url: string; authorization?: string }[];

beforeEach(async () => {
  requests = [];
  usage = { cached_tokens: 6000, cache_creation_tokens: 1000 };
  server = createServer((req, res) => {
    requests.push({ url: req.url!, authorization: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: [
          {
            timestamp: 1000,
            summary: [
              {
                model: 'cache-model',
                ...(req.url!.includes('/group/') ? { group_channel_id: 12 } : { channel_id: 12 }),
                input_tokens: 10000,
                output_tokens: 2000,
                ...usage
              }
            ]
          }
        ]
      })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  client = new AIProxyClient(() => ({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: 'local-test'
  }));
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

describe('channel dashboard cache pricing over real HTTP', () => {
  it.each(['system', 'group'] as const)(
    'preserves cache counts through the %s API contract',
    async (scope) => {
      const dashboard =
        scope === 'system' ? client.system.dashboard : client.group('member-1').dashboard;
      const raw = await dashboard.get({ channelId: 12, timezone: 'UTC', timespan: 'hour' });
      // 与生产路由相同的响应边界，防止 Zod 清除上游已提供的缓存统计。
      const [point] = GetChannelDashboardResponseSchema.parse(raw);
      const [summary] = point.summary;
      expect(summary).toMatchObject({ channel_id: 12, ...usage });
      expect(requests[0].authorization).toBe('Bearer local-test');
      expect(requests[0].url).toContain(
        scope === 'system'
          ? '/api/dashboardv2/?channel=12'
          : '/api/group/member-1/channel-dashboardv2?group_channel=12'
      );
      expect(
        calculateModelPrice({
          config: {
            type: ModelTypeEnum.llm,
            scope: ModelScopeEnum.system,
            pricing: {
              tiers: [
                {
                  inputPrice: 2000,
                  outputPrice: 4000,
                  cacheReadPrice: 200,
                  cacheCreationPrice: 2500
                }
              ]
            }
          },
          inputTokens: summary.input_tokens,
          outputTokens: summary.output_tokens,
          cacheReadTokens: summary.cached_tokens,
          cacheCreationTokens: summary.cache_creation_tokens
        }).totalPoints
      ).toBeCloseTo(17.7);
    }
  );

  it('keeps older responses compatible and explicit zero cache counts intact', async () => {
    for (const cacheUsage of [{}, { cached_tokens: 0, cache_creation_tokens: 0 }]) {
      usage = cacheUsage;
      const raw = await client.system.dashboard.get();
      expect(raw[0].summary[0]).toMatchObject({ cached_tokens: 0, cache_creation_tokens: 0 });
      const [point] = GetChannelDashboardResponseSchema.parse(raw);
      expect(point.summary[0]).toMatchObject({ cached_tokens: 0, cache_creation_tokens: 0 });
    }
  });
});

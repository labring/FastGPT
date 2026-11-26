import { describe, expect, it } from 'vitest';
import { FastGptAuthError } from '../src/core/errors';
import { FastGPT } from '../src/index';

/**
 * 真实 FastGPT 后端端到端联调 Smoke 测试套件（仅覆盖 System OpenAPI 开放接口）。
 *
 * 默认离线执行单元测试时自动跳过；配置以下环境变量后运行：
 *   FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
 *   FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
 *   FASTGPT_SMOKE_APP_ID=<optional-app-id> \
 *   pnpm --filter @fastgpt/sdk test:smoke
 */
const smokeBaseUrl = process.env.FASTGPT_SMOKE_BASE_URL?.trim();
const smokeApiKey = process.env.FASTGPT_SMOKE_API_KEY?.trim();
const smokeAppId = process.env.FASTGPT_SMOKE_APP_ID?.trim();
const shouldRunSmoke = Boolean(smokeBaseUrl && smokeApiKey);

const describeSmoke = shouldRunSmoke ? describe : describe.skip;

describeSmoke('FastGPT SDK Live Integration Smoke Tests', () => {
  const client = new FastGPT({
    baseUrl: smokeBaseUrl,
    apiKey: smokeApiKey,
    ...(smokeAppId ? { defaultAppId: smokeAppId } : {})
  });

  it('verifies public models.list and authenticated models.catalog against live server', async () => {
    const publicModels = await client.models.list().withRawResponse();
    expect(publicModels.response.status).toBe(200);
    expect(Array.isArray(publicModels.data.models)).toBe(true);
    expect(Array.isArray(publicModels.data.providers)).toBe(true);

    const catalog = await client.models.catalog();
    expect(typeof catalog.version).toBe('string');
    expect(Array.isArray(catalog.data?.models)).toBe(true);
  });

  it('lists datasets when using a personal API key', async () => {
    try {
      const res = await client.datasets.list({ pageSize: 5 });
      expect(typeof res.total).toBe('number');
      expect(Array.isArray(res.list)).toBe(true);
    } catch (err) {
      // 应用级别 API Key 不具备个人密钥的知识库列表权限时允许鉴权拒绝
      if (err instanceof FastGptAuthError) {
        return;
      }
      throw err;
    }
  });

  it('streams completionsV2Stream, aggregates finalResult(), and cursor-searches app logs when defaultAppId is provided', async () => {
    if (!smokeAppId) {
      return;
    }

    const stream = await client.chat.completionsV2Stream({
      messages: [{ role: 'user', content: '请只回复 OK' }],
      detail: true
    });

    let chunkCount = 0;
    for await (const event of stream) {
      if (event.type === 'answer' && event.textDelta.length > 0) {
        chunkCount += 1;
      }
    }

    const summary = await stream.finalResult();
    expect(chunkCount).toBeGreaterThan(0);
    expect(summary.text.trim().length).toBeGreaterThan(0);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const logs = await client.apps.logs.search({
      dateStart: weekAgo.toISOString(),
      dateEnd: now.toISOString()
    });
    expect(Array.isArray(logs.list)).toBe(true);

    const pagedLogs = await client.apps.logs
      .searchAutoPaging(
        {
          dateStart: weekAgo.toISOString(),
          dateEnd: now.toISOString()
        },
        { maxPages: 1, maxItems: 10 }
      )
      .toArray();
    expect(Array.isArray(pagedLogs)).toBe(true);
  }, 30_000);
});

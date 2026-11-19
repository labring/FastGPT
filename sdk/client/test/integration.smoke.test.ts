import { describe, expect, it } from 'vitest';
import { FastGPT } from '../src/index';

/**
 * 真实 FastGPT 后端端到端联调 Smoke 测试套件。
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

  it('verifies system.health, system.whoami, and public models.list against live server', async () => {
    const health = await client.system.health().withRawResponse();
    expect(health.response.status).toBe(200);

    const whoami = await client.system.whoami();
    expect(whoami).toBeDefined();

    const publicModels = await client.models.list();
    expect(Array.isArray(publicModels)).toBe(true);
  });

  it('lists datasets when using a personal API key', async () => {
    const whoami = await client.system.whoami();
    if (whoami.authType === 'apikey' && whoami.apiKeyType === 'app') {
      return;
    }

    const res = await client.datasets.list({ pageSize: 5 });
    expect(typeof res.total).toBe('number');
    expect(Array.isArray(res.list)).toBe(true);
  });

  it('streams completionsV2Stream and aggregates finalResult() when defaultAppId or app API key is available', async () => {
    const whoami = await client.system.whoami();
    const isAppKey = whoami.authType === 'apikey' && whoami.apiKeyType === 'app';
    if (!isAppKey && !smokeAppId) {
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
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/sandbox/internal/heartbeat';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';

describe('sandbox internal/heartbeat', () => {
  const originalSandboxProxySecret = serviceEnv.SANDBOX_PROXY_SECRET;

  beforeEach(() => {
    serviceEnv.SANDBOX_PROXY_SECRET = 'test-sandbox-proxy-secret';
  });

  afterEach(() => {
    serviceEnv.SANDBOX_PROXY_SECRET = originalSandboxProxySecret;
  });

  it('refreshes a running sandbox active time', async () => {
    const sandboxId = getNanoid();
    const lastActiveAt = new Date(Date.now() - 60_000);

    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId,
      appId: getNanoid(),
      userId: getNanoid(),
      chatId: getNanoid(),
      status: SandboxStatusEnum.running,
      lastActiveAt,
      createdAt: new Date(),
      metadata: {
        sandboxType: SandboxTypeEnum.editDebug,
        teamId: getNanoid(),
        tmbId: getNanoid(),
        skillId: getNanoid(),
        provider: 'opensandbox',
        image: { repository: 'test-image' },
        initializing: false
      }
    });

    const res = await Call(handler, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-sandbox-proxy-secret'
      },
      body: { sandboxId }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({ success: true });

    const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(sandbox?.lastActiveAt.getTime()).toBeGreaterThan(lastActiveAt.getTime());
  });
});

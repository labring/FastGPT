import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/sandbox/internal/heartbeat';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';

vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>();
  return {
    ...actual,
    getSandboxProviderConfig: vi.fn(() => ({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    }))
  };
});

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
      provider: 'sealosdevbox',
      sandboxId,
      appId: getNanoid(),
      userId: getNanoid(),
      chatId: getNanoid(),
      type: SandboxTypeEnum.editDebug,
      status: SandboxStatusEnum.running,
      lastActiveAt,
      createdAt: new Date(),
      metadata: {
        teamId: getNanoid(),
        tmbId: getNanoid(),
        skillId: getNanoid(),
        provider: 'sealosdevbox',
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

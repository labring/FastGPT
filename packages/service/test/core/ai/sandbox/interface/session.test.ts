import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSandboxInstanceBySandboxId: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  touchRunningSandboxInstance: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  existsSandboxInstanceBySandboxId: mocks.existsSandboxInstanceBySandboxId,
  touchRunningSandboxInstance: mocks.touchRunningSandboxInstance
}));

import {
  checkSandboxSessionExist,
  keepaliveSandboxSession
} from '@fastgpt/service/core/ai/sandbox/interface/session';

const query = {
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  chatId: 'chat-1'
};

describe('sandbox session interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSandboxInstanceBySandboxId.mockResolvedValue(true);
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.touchRunningSandboxInstance.mockResolvedValue({ sandboxId: query.sandboxId });
  });

  it('checks local session existence without touching runtime active timestamp', async () => {
    await expect(checkSandboxSessionExist(query)).resolves.toBe(true);

    expect(mocks.existsSandboxInstanceBySandboxId).toHaveBeenCalledWith({
      sandboxId: query.sandboxId
    });
    expect(mocks.touchRunningSandboxInstance).not.toHaveBeenCalled();
  });

  it('refreshes lastActiveAt in Mongo when source is active without opening remote connections', async () => {
    await expect(keepaliveSandboxSession(query)).resolves.toBeUndefined();

    expect(mocks.assertSandboxSourceActive).toHaveBeenCalledWith({
      sourceType: query.sourceType,
      sourceId: query.sourceId
    });
    expect(mocks.touchRunningSandboxInstance).toHaveBeenCalledWith({
      sandboxId: query.sandboxId,
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      userId: query.userId
    });
  });

  it('returns cleanly as a no-op when the sandbox record is not running (stopped/archived)', async () => {
    mocks.touchRunningSandboxInstance.mockResolvedValueOnce(null);

    await expect(keepaliveSandboxSession(query)).resolves.toBeUndefined();
  });

  it('propagates missing source and database errors', async () => {
    mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));

    await expect(keepaliveSandboxSession(query)).rejects.toThrow('source deleted');
    expect(mocks.touchRunningSandboxInstance).not.toHaveBeenCalled();
  });
});

import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSandboxRuntimeInstanceExists: vi.fn(),
  getRunningSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  checkSandboxRuntimeInstanceExists: mocks.checkSandboxRuntimeInstanceExists,
  getRunningSandboxClient: mocks.getRunningSandboxClient
}));

import { SandboxLifecycleStateError } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/error';
import { SandboxRuntimeNotRunningError } from '@fastgpt/service/core/ai/sandbox/error';
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
    mocks.checkSandboxRuntimeInstanceExists.mockResolvedValue(true);
    mocks.getRunningSandboxClient.mockResolvedValue({
      provider: { close: vi.fn(async () => undefined) }
    });
  });

  it('checks local session existence without constructing a runtime client', async () => {
    await expect(checkSandboxSessionExist(query)).resolves.toBe(true);

    expect(mocks.checkSandboxRuntimeInstanceExists).toHaveBeenCalledWith(query);
    expect(mocks.getRunningSandboxClient).not.toHaveBeenCalled();
  });

  it('keeps a running sandbox alive without allowing archived restore', async () => {
    await expect(keepaliveSandboxSession(query)).resolves.toBeUndefined();

    expect(mocks.getRunningSandboxClient).toHaveBeenCalledWith(query);
  });

  it.each([
    new SandboxRuntimeNotRunningError(query.sandboxId),
    new SandboxLifecycleStateError('stopping'),
    new SandboxLifecycleStateError('stopped')
  ])('treats a non-running lifecycle state as an idempotent keepalive no-op', async (error) => {
    mocks.getRunningSandboxClient.mockRejectedValueOnce(error);

    await expect(keepaliveSandboxSession(query)).resolves.toBeUndefined();
  });

  it('propagates unexpected provider failures', async () => {
    mocks.getRunningSandboxClient.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(keepaliveSandboxSession(query)).rejects.toThrow('provider unavailable');
  });
});

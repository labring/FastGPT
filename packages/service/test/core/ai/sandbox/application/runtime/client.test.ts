import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  delete: vi.fn(),
  log: { error: vi.fn() }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/service', () => ({
  ensureSandboxRuntime: mocks.ensure
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteSandboxResource: mocks.delete
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox'
  })
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.log,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

const query = {
  sandboxId: 'sandbox',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app',
  userId: 'user',
  chatId: 'chat'
};
const makeRuntime = () => ({
  resource: { ...query, status: 'running', teamId: 'team' },
  opensandbox: {
    close: vi.fn(async () => undefined),
    createDirectories: vi.fn(async () => undefined),
    execute: vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }))
  }
});
let runtime: ReturnType<typeof makeRuntime>;
beforeEach(() => {
  vi.clearAllMocks();
  runtime = makeRuntime();
  mocks.ensure.mockResolvedValue(runtime);
  mocks.delete.mockResolvedValue(undefined);
});

describe('SandboxClient', () => {
  it.each([ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder])(
    'coalesces concurrent preparation and prepares the %s chat directory once',
    async (sourceType) => {
      const client = await getSandboxClient({ ...query, sourceType });
      let resolve!: (value: typeof runtime) => void;
      mocks.ensure.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        })
      );
      const first = client.exec('first');
      const second = client.exec('second');
      expect(mocks.ensure).toHaveBeenCalledTimes(2);
      resolve(runtime);
      await Promise.all([first, second]);
      expect(runtime.opensandbox.createDirectories).toHaveBeenCalledTimes(1);
      expect(runtime.opensandbox.execute).toHaveBeenCalledTimes(2);
      expect(runtime.opensandbox.execute).toHaveBeenCalledWith(
        'first',
        expect.objectContaining({ workingDirectory: client.getRuntimePaths().sessionWorkDirectory })
      );
    }
  );
  it('updates paths and directory preparation together when rebinding OpenSandboxClient', async () => {
    const client = await getSandboxClient(query);
    await client.exec('first');
    const next = makeRuntime();
    mocks.ensure.mockResolvedValue(next);
    await client.exec('second', 3);
    expect(runtime.opensandbox.close).toHaveBeenCalledTimes(1);
    expect(client.getRuntimePaths().sessionWorkDirectory).toContain('/workspace');
    expect(next.opensandbox.execute).toHaveBeenCalledWith('second', {
      timeoutMs: 3000,
      workingDirectory: client.getRuntimePaths().sessionWorkDirectory
    });
    expect(next.opensandbox.createDirectories).toHaveBeenCalledTimes(1);
    expect(client.resolveRuntimePath('file.txt')).toContain('/workspace');
  });
  it('retries failed directory creation on the next command', async () => {
    const client = await getSandboxClient(query);
    runtime.opensandbox.createDirectories.mockRejectedValueOnce(new Error('mkdir failed'));
    expect(await client.exec('first')).toMatchObject({ exitCode: -1 });
    expect(await client.exec('second')).toMatchObject({ exitCode: 0 });
    expect(runtime.opensandbox.createDirectories).toHaveBeenCalledTimes(2);
  });
  it('recovers and retries once when execution fails with ENOTCONN', async () => {
    const client = await getSandboxClient(query);
    const recovered = makeRuntime();
    mocks.ensure.mockResolvedValueOnce(runtime).mockResolvedValueOnce(recovered);
    runtime.opensandbox.execute.mockRejectedValueOnce(
      new Error('ENOTCONN: Transport endpoint is not connected')
    );

    const res = await client.exec('ls');
    expect(res).toMatchObject({ exitCode: 0, stdout: 'ok' });
    expect(mocks.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ verifyHealth: true }));
    expect(recovered.opensandbox.execute).toHaveBeenCalledOnce();
  });
  it('recovers and retries once inside runWithRecovery for recoverable errors only', async () => {
    const client = await getSandboxClient(query);
    const recovered = makeRuntime();
    mocks.ensure.mockResolvedValueOnce(runtime).mockResolvedValueOnce(recovered);

    let attempts = 0;
    const result = await client.runWithRecovery(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('ENOTCONN: Transport endpoint is not connected');
      }
      return 'recovered-value';
    });
    expect(result).toBe('recovered-value');
    expect(attempts).toBe(2);
    expect(mocks.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ verifyHealth: true }));

    await expect(
      client.runWithRecovery(async () => {
        throw new Error('Permission denied');
      })
    ).rejects.toThrow('Permission denied');
    expect(mocks.ensure).toHaveBeenCalledTimes(4);
    expect(mocks.ensure).toHaveBeenLastCalledWith(
      expect.objectContaining({ verifyHealth: undefined })
    );
  });
  it('returns command failures in tool output and preserves identity context', async () => {
    const client = await getSandboxClient(query);
    runtime.opensandbox.execute.mockRejectedValueOnce(new Error('transport failed'));
    expect(await client.exec('first')).toMatchObject({
      exitCode: -1,
      stderr: expect.stringContaining('transport failed')
    });
    expect(client.getSandboxId()).toBe(query.sandboxId);
    expect(client.getContext()).toMatchObject({ sourceId: query.sourceId, chatId: query.chatId });
  });
  it('does not create chat directories for Skill Edit', async () => {
    const client = await getSandboxClient({ ...query, sourceType: ChatSourceTypeEnum.skillEdit });
    await client.exec('echo skill');
    expect(runtime.opensandbox.createDirectories).not.toHaveBeenCalled();
    expect(runtime.opensandbox.execute).toHaveBeenCalledWith('echo skill', {
      timeoutMs: undefined
    });
  });
  it('closes the connection before delete and lets cleanup proceed', async () => {
    const client = await getSandboxClient(query);
    runtime.opensandbox.close.mockRejectedValueOnce(new Error('close failed'));
    await client.delete();
    expect(mocks.delete).toHaveBeenCalledWith({
      sandboxId: query.sandboxId
    });
    expect(runtime.opensandbox.close.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.delete.mock.invocationCallOrder[0]
    );
  });
});

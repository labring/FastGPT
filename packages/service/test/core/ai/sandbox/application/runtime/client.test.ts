import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSandboxClient,
  getRunningSandboxClient,
  checkSandboxRuntimeInstanceExists
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  connect: vi.fn(),
  stop: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  log: { error: vi.fn() }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/service', () => ({
  ensureSandboxRuntime: mocks.ensure,
  connectRunningSandbox: mocks.connect
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResource: mocks.stop,
  deleteSandboxResource: mocks.delete
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  existsSandboxInstanceBySandboxId: mocks.exists
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getConfiguredSandboxProvider: () => 'opensandbox'
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: (provider: string) => ({
    workDirectory: provider === 'opensandbox' ? '/workspace' : '/home/devbox/workspace'
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
const makeRuntime = (provider = 'opensandbox') => ({
  resource: { ...query, provider, status: 'running', teamId: 'team' },
  adapter: {
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
  mocks.connect.mockResolvedValue(runtime);
  mocks.stop.mockResolvedValue(undefined);
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
      expect(runtime.adapter.createDirectories).toHaveBeenCalledTimes(1);
      expect(runtime.adapter.execute).toHaveBeenCalledTimes(2);
      expect(runtime.adapter.execute).toHaveBeenCalledWith(
        'first',
        expect.objectContaining({ workingDirectory: client.getRuntimePaths().sessionWorkDirectory })
      );
    }
  );
  it('keeps connect-only semantics for every subsequent use', async () => {
    const client = await getRunningSandboxClient(query);
    mocks.connect.mockRejectedValueOnce(new Error('stopped'));
    expect(await client.exec('echo forbidden')).toMatchObject({
      exitCode: -1,
      stderr: expect.stringContaining('stopped')
    });
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(runtime.adapter.execute).not.toHaveBeenCalled();
  });
  it('updates paths and directory preparation together when switching provider', async () => {
    const client = await getSandboxClient(query);
    await client.exec('first');
    const next = makeRuntime('sealosdevbox');
    mocks.ensure.mockResolvedValue(next);
    await client.exec('second', 3);
    expect(runtime.adapter.close).toHaveBeenCalledTimes(1);
    expect(client.getRuntimePaths().sessionWorkDirectory).toContain('/home/devbox/workspace');
    expect(next.adapter.execute).toHaveBeenCalledWith('second', {
      timeoutMs: 3000,
      workingDirectory: client.getRuntimePaths().sessionWorkDirectory
    });
    expect(next.adapter.createDirectories).toHaveBeenCalledTimes(1);
    expect(client.resolveRuntimePath('file.txt')).toContain('/home/devbox/workspace');
  });
  it('retries failed directory creation on the next command', async () => {
    const client = await getSandboxClient(query);
    runtime.adapter.createDirectories.mockRejectedValueOnce(new Error('mkdir failed'));
    expect(await client.exec('first')).toMatchObject({ exitCode: -1 });
    expect(await client.exec('second')).toMatchObject({ exitCode: 0 });
    expect(runtime.adapter.createDirectories).toHaveBeenCalledTimes(2);
  });
  it('returns command failures in tool output and preserves identity context', async () => {
    const client = await getSandboxClient(query);
    runtime.adapter.execute.mockRejectedValueOnce(new Error('transport failed'));
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
    expect(runtime.adapter.createDirectories).not.toHaveBeenCalled();
    expect(runtime.adapter.execute).toHaveBeenCalledWith('echo skill', { timeoutMs: undefined });
  });
  it.each(['stop', 'delete'] as const)(
    'closes the connection before %s and lets cleanup failure proceed',
    async (action) => {
      const client = await getSandboxClient(query);
      runtime.adapter.close.mockRejectedValueOnce(new Error('close failed'));
      await client[action]();
      const operation = action === 'stop' ? mocks.stop : mocks.delete;
      expect(operation).toHaveBeenCalledWith({
        provider: 'opensandbox',
        sandboxId: query.sandboxId
      });
      expect(runtime.adapter.close.mock.invocationCallOrder[0]).toBeLessThan(
        operation.mock.invocationCallOrder[0]
      );
    }
  );
});
describe('checkSandboxRuntimeInstanceExists', () => {
  it('queries the requested provider without preparing a runtime', async () => {
    mocks.exists.mockResolvedValue(true);
    expect(await checkSandboxRuntimeInstanceExists(query, { providerName: 'sealosdevbox' })).toBe(
      true
    );
    expect(mocks.exists).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      sandboxId: query.sandboxId
    });
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

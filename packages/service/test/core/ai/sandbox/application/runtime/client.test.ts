import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxApiException } from '@alibaba-group/opensandbox';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  isRecoverableSandboxError,
  SandboxNotFoundError
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  stop: vi.fn(),
  delete: vi.fn(),
  disconnectSandbox: vi.fn(),
  log: { error: vi.fn() }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/service', () => ({
  ensureSandboxRuntime: mocks.ensure
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResource: mocks.stop,
  deleteSandboxResource: mocks.delete
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  disconnectSandbox: mocks.disconnectSandbox
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxStaticRuntimePaths: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox',
    skillsRootPath: '/workspace/skills',
    builtinSkillsRootPath: '/var/lib/fastgpt-runtime/skills'
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
  resource: { ...query, provider: 'opensandbox', status: 'running', teamId: 'team' },
  opensandbox: {
    id: 'remote-1',
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
  mocks.stop.mockResolvedValue(undefined);
  mocks.delete.mockResolvedValue(undefined);
  mocks.disconnectSandbox.mockResolvedValue(undefined);
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

  it('disconnects old handle and re-prepares chat directory when opensandbox handle changes', async () => {
    const client = await getSandboxClient(query);
    await client.exec('first');
    const next = makeRuntime();
    mocks.ensure.mockResolvedValue(next);

    await client.exec('second', 3);

    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(runtime.opensandbox);
    expect(next.opensandbox.execute).toHaveBeenCalledWith('second', {
      timeoutMs: 3000,
      workingDirectory: client.getRuntimePaths().sessionWorkDirectory
    });
    expect(next.opensandbox.createDirectories).toHaveBeenCalledTimes(1);
    expect(client.resolveRuntimePath('file.txt')).toBe('/workspace/sessions/chat/file.txt');
  });

  it('recovers and retries once on recoverable sandbox errors during exec', async () => {
    const client = await getSandboxClient(query);
    const recovered = makeRuntime();
    mocks.ensure.mockResolvedValueOnce(runtime).mockResolvedValueOnce(recovered);
    runtime.opensandbox.execute.mockRejectedValueOnce(new SandboxNotFoundError('gone'));

    const res = await client.exec('retry-me');

    expect(res).toMatchObject({ exitCode: 0, stdout: 'ok' });
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(runtime.opensandbox);
    expect(mocks.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ verifyHealth: true }));
    expect(recovered.opensandbox.execute).toHaveBeenCalledTimes(1);
  });

  it('retries failed directory creation on the next command', async () => {
    const client = await getSandboxClient(query);
    runtime.opensandbox.createDirectories.mockRejectedValueOnce(new Error('mkdir failed'));
    expect(await client.exec('first')).toMatchObject({ exitCode: -1 });
    expect(await client.exec('second')).toMatchObject({ exitCode: 0 });
    expect(runtime.opensandbox.createDirectories).toHaveBeenCalledTimes(2);
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
  it.each(['stop', 'delete'] as const)('closes the connection before %s', async (action) => {
    const client = await getSandboxClient(query);
    await client[action]();
    const operation = action === 'stop' ? mocks.stop : mocks.delete;
    expect(operation).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: query.sandboxId
    });
    expect(mocks.disconnectSandbox.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]
    );
  });

  it('recovers wrapped SandboxNotFoundError / 404 container errors in runWithRecovery but not FILE_NOT_FOUND', async () => {
    const client = await getSandboxClient(query);
    const recovered = makeRuntime();
    mocks.ensure.mockResolvedValueOnce(runtime).mockResolvedValueOnce(recovered);

    const retried = await client.runWithRecovery(async () => {
      if (client.opensandbox === runtime.opensandbox) {
        throw new Error('Workflow Builder document is missing', {
          cause: new SandboxNotFoundError('gone')
        });
      }
      return 'ok';
    });
    expect(retried).toBe('ok');
    expect(mocks.ensure).toHaveBeenCalledTimes(3);
    expect(mocks.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ verifyHealth: true }));

    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(runtime);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    const container404Client = await getSandboxClient(query);
    const recovered2 = makeRuntime();
    mocks.ensure.mockResolvedValueOnce(runtime).mockResolvedValueOnce(recovered2);
    const container404Retried = await container404Client.runWithRecovery(async () => {
      if (container404Client.opensandbox === runtime.opensandbox) {
        throw new SandboxApiException({
          message: 'sandbox missing',
          statusCode: 404,
          rawBody: '{"code":"SANDBOX_NOT_FOUND"}'
        });
      }
      return 'recovered-404';
    });
    expect(container404Retried).toBe('recovered-404');
    expect(mocks.ensure).toHaveBeenCalledTimes(3);
    expect(mocks.ensure).toHaveBeenLastCalledWith(expect.objectContaining({ verifyHealth: true }));

    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(runtime);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    const fileMissingClient = await getSandboxClient(query);
    await expect(
      fileMissingClient.runWithRecovery(async () => {
        throw new Error('Workflow Builder document is missing', {
          cause: new SandboxApiException({
            message: 'file missing',
            statusCode: 404,
            rawBody: '{"code":"FILE_NOT_FOUND"}'
          })
        });
      })
    ).rejects.toThrow('Workflow Builder document is missing');
    expect(mocks.ensure).toHaveBeenCalledTimes(2);
    expect(mocks.ensure).not.toHaveBeenCalledWith(expect.objectContaining({ verifyHealth: true }));
    expect(mocks.disconnectSandbox).not.toHaveBeenCalled();
  });
});

describe('isRecoverableSandboxError', () => {
  it('handles cyclic and overly deep cause chains without overflowing while excluding FILE_NOT_FOUND', () => {
    const errA = new Error('cycle A') as Error & { cause?: unknown };
    const errB = new Error('cycle B', { cause: errA });
    errA.cause = errB;
    expect(isRecoverableSandboxError(errA)).toBe(false);

    let withinDepth: Error = new SandboxNotFoundError('gone');
    for (let i = 0; i < 7; i++) {
      withinDepth = new Error(`wrap-${i}`, { cause: withinDepth });
    }
    expect(isRecoverableSandboxError(withinDepth)).toBe(true);

    const beyondDepth = new Error('wrap-8', { cause: withinDepth });
    expect(isRecoverableSandboxError(beyondDepth)).toBe(false);

    const wrappedFileMissing = new Error('wrapped file not found', {
      cause: new SandboxApiException({
        message: 'missing',
        statusCode: 404,
        rawBody: '{"code":"FILE_NOT_FOUND"}'
      })
    });
    expect(isRecoverableSandboxError(wrappedFileMissing)).toBe(false);
  });
});

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSandboxDiskQuotaStatus: vi.fn(),
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  execute: vi.fn(),
  getSandboxClient: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/quota', () => ({
  getSandboxDiskQuotaStatus: mocks.getSandboxDiskQuotaStatus
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

import apiHandler from '@/pages/api/core/ai/sandbox/extractZip';

const handler = apiHandler as (
  req: Parameters<typeof apiHandler>[0]
) => ReturnType<typeof apiHandler>;

const createReq = (path: string) =>
  ({
    body: {
      appId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      path
    },
    headers: {}
  }) as any;

describe('sandbox extractZip API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxDiskQuotaStatus.mockResolvedValue({
      enabled: false,
      exceeded: false,
      usedBytes: 0,
      limitBytes: 0
    });
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.execute.mockResolvedValue({
      exitCode: 0,
      stdout: 'uploads/archive\n',
      stderr: ''
    });
    mocks.getSandboxClient.mockResolvedValue({
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      }),
      runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      opensandbox: {
        execute: mocks.execute
      }
    });
  });

  it('requires write permission and extracts a zip via OpenSandbox execd in sessionWorkDirectory', async () => {
    const result = await handler(createReq('uploads/archive.zip'));

    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        per: WritePermissionVal
      })
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('unzip -oq "$zip_path" -d "$target_dir" </dev/null'),
      expect.objectContaining({
        workingDirectory: '/workspace/sessions/chat-1',
        timeoutMs: 30_000
      })
    );
    const script = mocks.execute.mock.calls[0][0] as string;
    expect(script).toContain("zip_path='./uploads/archive.zip'");
    expect(script).toContain("parent_dir='./uploads'");
    expect(script).toContain("base_name='archive'");
    expect(result).toEqual({ targetDirPath: 'uploads/archive' });
  });

  it('guards Docker extractions with prlimit --fsize inside runWithRecovery', async () => {
    mocks.getSandboxDiskQuotaStatus.mockResolvedValueOnce({
      enabled: true,
      exceeded: false,
      usedBytes: 128,
      limitBytes: 1024 * 1024
    });

    await handler(createReq('uploads/archive.zip'));

    const script = mocks.execute.mock.calls[0][0] as string;
    expect(script).toContain('prlimit --fsize=1048576:1048576 -- unzip -oq "$zip_path"');
  });

  it('preserves leading whitespace in valid relative zip paths without silent trimming', async () => {
    mocks.execute.mockResolvedValueOnce({
      exitCode: 0,
      stdout: ' uploads/archive\n',
      stderr: ''
    });

    const result = await handler(createReq(' uploads/archive.zip'));
    const script = mocks.execute.mock.calls[0][0] as string;
    expect(script).toContain("zip_path='./ uploads/archive.zip'");
    expect(script).toContain("parent_dir='./ uploads'");
    expect(result).toEqual({ targetDirPath: ' uploads/archive' });
  });

  it('rejects whitespace-only zip paths with ApiRequestInputParseError', async () => {
    await expect(handler(createReq('   '))).rejects.toBeInstanceOf(ApiRequestInputParseError);
    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
  });

  it.each(['../a.zip', '/abs.zip', 'notes.txt', '.zip', '..zip', '...zip', '.'])(
    'rejects invalid zip path %s at schema boundary before auth',
    async (badPath) => {
      await expect(handler(createReq(badPath))).rejects.toBeInstanceOf(ApiRequestInputParseError);
      expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
      expect(mocks.getSandboxClient).not.toHaveBeenCalled();
    }
  );

  it('surfaces unzip stderr via UserError when extraction fails inside sandbox', async () => {
    mocks.execute.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'End-of-central-directory signature not found'
    });

    await expect(handler(createReq('broken.zip'))).rejects.toMatchObject({
      name: 'UserError',
      message: SkillErrEnum.archiveExtractionFailed,
      displayMessage: 'End-of-central-directory signature not found'
    });
    expect(UserError).toBeDefined();
  });

  it('executes the generated script with real shell/unzip, preserves non-zero exit code & diagnostics, and isolates concurrent extractions', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'fastgpt-extract-zip-'));
    const runRealShell = async (script: string) => {
      try {
        const { stdout, stderr } = await promisify(execFile)('/bin/sh', ['-c', script], {
          cwd: workDir
        });
        return { exitCode: 0, stdout, stderr };
      } catch (err: any) {
        return {
          exitCode: typeof err?.code === 'number' ? err.code : 1,
          stdout: err?.stdout ?? '',
          stderr: err?.stderr ?? String(err)
        };
      }
    };

    try {
      writeFileSync(join(workDir, 'broken.zip'), 'not-a-valid-zip');
      let observed: { exitCode: number; stdout: string; stderr: string } | undefined;
      mocks.execute.mockImplementationOnce(async (script: string) => {
        observed = await runRealShell(script);
        return observed;
      });

      await expect(handler(createReq('broken.zip'))).rejects.toMatchObject({
        name: 'UserError',
        message: SkillErrEnum.archiveExtractionFailed,
        displayMessage: expect.stringMatching(/End-of-central-directory|zipfile/i)
      });
      expect(observed?.exitCode).toBeGreaterThan(0);
      expect(observed?.stdout).toBe('');
      expect(observed?.stderr.trim().length).toBeGreaterThan(0);
      expect(existsSync(join(workDir, 'broken'))).toBe(false);

      // 已有目标目录存在且兄弟并发失败时，原子分配唯一后缀，不覆盖或误删既有目录。
      const existingTarget = join(workDir, 'shared');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(existingTarget);
      writeFileSync(join(existingTarget, 'keep.txt'), 'keep-me');
      writeFileSync(join(workDir, 'shared.zip'), 'corrupt-concurrent-zip');
      mocks.execute.mockImplementationOnce(async (script: string) => runRealShell(script));

      await expect(handler(createReq('shared.zip'))).rejects.toMatchObject({
        name: 'UserError',
        message: SkillErrEnum.archiveExtractionFailed
      });
      expect(existsSync(join(existingTarget, 'keep.txt'))).toBe(true);
      expect(existsSync(join(workDir, 'shared-1'))).toBe(false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('rejects extraction before invoking execd when sandbox disk quota is exceeded', async () => {
    mocks.getSandboxDiskQuotaStatus.mockResolvedValueOnce({
      enabled: true,
      exceeded: true,
      usedBytes: 2048,
      limitBytes: 1024
    });

    await expect(handler(createReq('bundle.zip'))).rejects.toThrowError(
      new UserError(SandboxErrEnum.agentSandboxDiskQuotaExceeded)
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

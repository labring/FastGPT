import { describe, expect, it, vi } from 'vitest';
import { S3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';

const createSourceWithoutStorageClient = (exists: boolean) => ({
  removeObject: vi.fn().mockResolvedValue(undefined),
  isObjectExists: vi.fn().mockResolvedValue(exists)
});

describe('S3SandboxSource migration helpers', () => {
  it('synchronously deletes the canonical workspace archive and verifies removal', async () => {
    const source = createSourceWithoutStorageClient(false);

    await S3SandboxSource.prototype.deleteWorkspaceArchiveNow.call(source, {
      sandboxId: 'sandbox-2'
    });

    expect(source.removeObject).toHaveBeenCalledWith('agent-sandbox/sandbox-2/package.zip');
    expect(source.isObjectExists).toHaveBeenCalledWith('agent-sandbox/sandbox-2/package.zip');
  });

  it('fails when the archive still exists after deletion', async () => {
    const source = createSourceWithoutStorageClient(true);

    await expect(
      S3SandboxSource.prototype.deleteWorkspaceArchiveNow.call(source, {
        sandboxId: 'sandbox-3'
      })
    ).rejects.toThrow('Failed to delete sandbox archive: sandbox-3');
  });
});

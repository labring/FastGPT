import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { S3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';

const createSourceWithoutConstructor = (exists: boolean) => {
  const source = Object.create(S3SandboxSource.prototype);
  Object.defineProperty(source, 'client', {
    value: {
      uploadObject: vi.fn().mockResolvedValue(undefined),
      downloadObject: vi.fn().mockResolvedValue({ body: Readable.from(Buffer.from('zip')) })
    }
  });
  source.removeObject = vi.fn().mockResolvedValue(undefined);
  source.isObjectExists = vi.fn().mockResolvedValue(exists);
  source.addDeleteJob = vi.fn().mockResolvedValue(undefined);
  return source;
};

describe('S3SandboxSource migration helpers', () => {
  it('stores v2 archives under sandbox/archive', async () => {
    const source = createSourceWithoutConstructor(false);

    await S3SandboxSource.prototype.uploadWorkspaceArchive.call(source, {
      sandboxId: 'sandbox-1',
      body: Buffer.from('zip')
    });
    await S3SandboxSource.prototype.downloadWorkspaceArchive.call(source, {
      sandboxId: 'sandbox-1'
    });

    await S3SandboxSource.prototype.deleteWorkspaceArchiveNow.call(source, {
      sandboxId: 'sandbox-2'
    });

    expect(source.client.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'sandbox/archive/sandbox-1/package.zip' })
    );
    expect(source.client.downloadObject).toHaveBeenCalledWith({
      key: 'sandbox/archive/sandbox-1/package.zip'
    });
    expect(source.removeObject).toHaveBeenCalledWith('sandbox/archive/sandbox-2/package.zip');
    expect(source.isObjectExists).toHaveBeenCalledWith('sandbox/archive/sandbox-2/package.zip');
  });

  it('keeps Legacy archives under agent-sandbox', async () => {
    const source = createSourceWithoutConstructor(false);

    await S3SandboxSource.prototype.uploadLegacyWorkspaceArchive.call(source, {
      sandboxId: 'legacy-1',
      body: Buffer.from('zip')
    });
    await S3SandboxSource.prototype.deleteLegacyWorkspaceArchiveNow.call(source, {
      sandboxId: 'legacy-1'
    });

    expect(source.client.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'agent-sandbox/legacy-1/package.zip' })
    );
    expect(source.removeObject).toHaveBeenCalledWith('agent-sandbox/legacy-1/package.zip');
    expect(source.isObjectExists).toHaveBeenCalledWith('agent-sandbox/legacy-1/package.zip');
  });

  it('fails when the archive still exists after deletion', async () => {
    const source = createSourceWithoutConstructor(true);

    await expect(
      S3SandboxSource.prototype.deleteWorkspaceArchiveNow.call(source, {
        sandboxId: 'sandbox-3'
      })
    ).rejects.toThrow('Failed to delete sandbox archive: sandbox-3');
  });
});

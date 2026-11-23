import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import JSZip from 'jszip';
import { createTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { readTarZstEntries } from '@test/utils/tarZst';

const mocks = vi.hoisted(() => ({
  downloadObject: vi.fn(),
  getObjectMetadata: vi.fn(),
  extractToSandboxDirectory: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/skill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/s3/sources/skill')>()),
  getS3SkillSource: () => ({
    client: {
      getObjectMetadata: mocks.getObjectMetadata,
      downloadObject: mocks.downloadObject
    }
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/ideAgent', () => ({
  extractToSandboxDirectory: mocks.extractToSandboxDirectory
}));

import { deploySkillPackage } from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/prepare';
import { openSkillPackageTarZstStream } from '@fastgpt/service/core/ai/skill/package/storage';

/** 让 S3 mock 同时支持整包下载与 HTTP Range 读取。 */
const stubS3Object = (data: Buffer) => {
  mocks.getObjectMetadata.mockResolvedValue({ contentLength: data.length });
  mocks.downloadObject.mockImplementation(
    async ({ range }: { range?: { start: number; end: number } }) => ({
      body: Readable.from([range ? data.subarray(range.start, range.end + 1) : data])
    })
  );
};

const createSandbox = () => ({
  createDirectories: vi.fn().mockResolvedValue(undefined),
  getFileInfo: vi.fn(async () => new Map()),
  writeFiles: vi.fn(async (entries: Array<{ path: string }>) =>
    entries.map((entry) => ({ path: entry.path, error: null }))
  )
});

describe('deploySkillPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractToSandboxDirectory.mockImplementation(async ({ openBody }) => {
      await buffer(await openBody());
    });
  });

  it('streams the package into the work directory and writes a default .gitignore', async () => {
    const tarZst = await buffer(
      createTarZstStream([
        { path: 'skills/demo/SKILL.md', type: 'file', mode: 0o644, content: Buffer.from('# demo') }
      ])
    );
    stubS3Object(tarZst);
    let streamed: Buffer | undefined;
    mocks.extractToSandboxDirectory.mockImplementationOnce(async ({ openBody }) => {
      streamed = await buffer(await openBody());
    });
    const sandbox = createSandbox();
    const phases: string[] = [];

    await deploySkillPackage({
      storageKey: 'agent-skills/t1/s1/v1.tar.zst',
      skillsRootPath: '/workspace/skills',
      onProgress: (phase) => phases.push(phase)
    })({ sandbox: sandbox as any, workDirectory: '/workspace' });

    expect(phases).toEqual(['downloadingPackage', 'extractingPackage']);
    expect(mocks.extractToSandboxDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ sandbox, targetDirectory: '/workspace' })
    );
    expect(streamed).toEqual(tarZst);
    expect(sandbox.createDirectories).toHaveBeenCalledWith(['/workspace/skills']);
    expect(sandbox.writeFiles.mock.calls[0]?.[0]?.[0]?.path).toBe('/workspace/.gitignore');
  });
});

describe('openSkillPackageTarZstStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transcodes imported .zip packages via HTTP Range, keeping modes and symlinks', async () => {
    const zip = new JSZip();
    zip.file('SKILL.md', '# Root skill', { unixPermissions: 0o100644 });
    zip.file('nested/run.sh', '#!/bin/sh\n', { unixPermissions: 0o100755 });
    zip.file('nested/lib', '../shared', { unixPermissions: 0o120777 });
    stubS3Object(await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }));

    const entries = await readTarZstEntries(
      await openSkillPackageTarZstStream({ storageKey: 'agent-skills/t1/s1/version.zip' })
    );

    expect(mocks.downloadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'agent-skills/t1/s1/version.zip', range: expect.any(Object) })
    );
    expect(entries.find((entry) => entry.path === 'SKILL.md')?.content.toString()).toBe(
      '# Root skill'
    );
    expect(entries.find((entry) => entry.path === 'nested/run.sh')?.mode).toBe(0o755);
    expect(entries.find((entry) => entry.path === 'nested/lib')).toMatchObject({
      type: 'symlink',
      linkname: '../shared'
    });
  });

  it('fails the stream on traversal entries and enforces compressed/uncompressed limits', async () => {
    const zip = new JSZip();
    zip.file('safe_place_holder.txt', 'pwnd');
    const rawZip = await zip.generateAsync({ type: 'nodebuffer' });
    // 保持字节长度不变，同时篡改 Central Directory 与 Local Header 中的路径。
    stubS3Object(
      Buffer.from(
        rawZip.toString('latin1').replaceAll('safe_place_holder.txt', '../evil_place_hold.tx'),
        'latin1'
      )
    );
    await expect(
      buffer(await openSkillPackageTarZstStream({ storageKey: 'evil.zip' }))
    ).rejects.toThrow(/invalid relative path|traversal/);

    const bomb = new JSZip();
    bomb.file('large.txt', 'a'.repeat(1024));
    const deflated = await bomb.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    stubS3Object(deflated);
    await expect(
      buffer(await openSkillPackageTarZstStream({ storageKey: 'bomb.zip', maxBytes: 512 }))
    ).rejects.toThrow(/uncompressed size exceeds/);
    await expect(
      openSkillPackageTarZstStream({ storageKey: 'big.zip', maxBytes: deflated.length - 1 })
    ).rejects.toThrow(/exceeds maximum allowed bytes/);
  });
});

import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  uploadSkillPackage,
  uploadSkillPackageStream,
  copySkillPackage,
  downloadSkillPackageStream,
  deleteSkillPackage
} from '@fastgpt/service/core/ai/skill/package/storage';
import { getS3SkillSource } from '@fastgpt/service/common/s3/sources/skill';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

import { Readable } from 'node:stream';

const s3SkillSourceMocks = vi.hoisted(() => {
  const getSkillPackageKey = ({
    teamId,
    skillId,
    packageObjectId,
    extension = 'tar.zst'
  }: {
    teamId: string;
    skillId: string;
    packageObjectId: string;
    extension?: string;
  }) => `agent-skills/${teamId}/${skillId}/${packageObjectId}.${extension}`;

  return {
    uploadPackageMock: vi.fn().mockImplementation((params) =>
      Promise.resolve({
        key: getSkillPackageKey(params),
        accessUrl: { url: 'mock-url' }
      })
    ),
    uploadPackageStreamMock: vi.fn().mockImplementation(async (params) => {
      for await (const _chunk of params.body) {
        // consume stream
      }
      return {
        key: getSkillPackageKey(params),
        sizeBytes: 12
      };
    }),
    getObjectMetadataMock: vi.fn().mockResolvedValue({
      contentLength: Buffer.from('mock zip content').length
    }),
    downloadObjectMock: vi.fn().mockResolvedValue({
      // body must be async-iterable; an array satisfies for-await-of
      body: [Buffer.from('mock zip content')]
    }),
    deleteObjectMock: vi.fn().mockResolvedValue(undefined),
    checkObjectExistsMock: vi.fn().mockResolvedValue({ exists: true }),
    listObjectsMock: vi.fn().mockResolvedValue({ keys: [] }),
    deleteObjectsByPrefixMock: vi.fn().mockResolvedValue({ keys: [] }),
    removePackageTTLMock: vi.fn().mockResolvedValue(undefined),
    deleteSkillPackagesByPrefixMock: vi.fn().mockResolvedValue(undefined),
    copyMock: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('@fastgpt/service/common/s3/sources/skill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/s3/sources/skill')>();
  return {
    ...actual,
    getS3SkillSource: vi.fn(() => ({
      bucketName: 'fastgpt-private',
      client: {
        getObjectMetadata: s3SkillSourceMocks.getObjectMetadataMock,
        downloadObject: s3SkillSourceMocks.downloadObjectMock,
        deleteObject: s3SkillSourceMocks.deleteObjectMock,
        checkObjectExists: s3SkillSourceMocks.checkObjectExistsMock,
        listObjects: s3SkillSourceMocks.listObjectsMock,
        deleteObjectsByPrefix: s3SkillSourceMocks.deleteObjectsByPrefixMock
      },
      uploadPackage: s3SkillSourceMocks.uploadPackageMock,
      uploadPackageStream: s3SkillSourceMocks.uploadPackageStreamMock,
      copy: s3SkillSourceMocks.copyMock,
      removePackageTTL: s3SkillSourceMocks.removePackageTTLMock,
      deleteSkillPackagesByPrefix: s3SkillSourceMocks.deleteSkillPackagesByPrefixMock
    }))
  };
});

describe('storage', () => {
  const mockTeamId = 'team-abc123';
  const mockSkillId = 'skill-def456';
  const mockVersionId = '665f1f77bcf86cd799439011';
  const mockZipBuffer = Buffer.from('mock zip content');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const consumeStream = async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  // ==================== uploadSkillPackage ====================
  describe('uploadSkillPackage', () => {
    it('should upload skill package successfully', async () => {
      const result = await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        packageBuffer: mockZipBuffer
      });

      expect(result).toEqual({
        key: `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.tar.zst`
      });
      expect(s3SkillSourceMocks.uploadPackageMock).toHaveBeenCalledWith({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        body: mockZipBuffer,
        contentLength: mockZipBuffer.length,
        extension: undefined
      });
    });

    it('should reject buffers larger than the upload limit before uploading to S3', async () => {
      const originalAgentSandboxStorageSize =
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi;
      getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 0.001;

      try {
        const tooLargeBuffer = Buffer.alloc(2 * 1024 * 1024 + 1);

        await expect(
          uploadSkillPackage({
            teamId: mockTeamId,
            skillId: mockSkillId,
            packageObjectId: mockVersionId,
            packageBuffer: tooLargeBuffer
          })
        ).rejects.toThrow(SkillErrEnum.archiveTooLarge);

        expect(getS3SkillSource).not.toHaveBeenCalled();
        expect(s3SkillSourceMocks.uploadPackageMock).not.toHaveBeenCalled();
      } finally {
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
          originalAgentSandboxStorageSize;
      }
    });
  });

  describe('uploadSkillPackageStream', () => {
    it('streams chunks to S3 without joining them into a package buffer', async () => {
      let uploadedBody: Buffer | undefined;
      s3SkillSourceMocks.uploadPackageMock.mockImplementationOnce(async (params) => {
        expect(params.body).toBeInstanceOf(Readable);
        uploadedBody = await consumeStream(params.body);
        return {
          key: `agent-skills/${params.teamId}/${params.skillId}/${params.packageObjectId}.${params.extension ?? 'tar.zst'}`
        };
      });
      const packageStream = Readable.from([Buffer.from('chunk-1'), Buffer.from('chunk-2')]);

      const result = await uploadSkillPackageStream({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        packageStream,
        contentLength: 14
      });

      expect(result.key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.tar.zst`);
      expect(uploadedBody?.toString()).toBe('chunk-1chunk-2');
      expect(s3SkillSourceMocks.uploadPackageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contentLength: 14,
          body: expect.any(Readable)
        })
      );
    });

    it('aborts a stream whose actual bytes exceed the package limit', async () => {
      const originalAgentSandboxStorageSize =
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi;
      getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 0.001;
      s3SkillSourceMocks.uploadPackageStreamMock.mockImplementationOnce(async (params) => {
        await consumeStream(params.body);
        return { key: 'should-not-complete' };
      });

      try {
        await expect(
          uploadSkillPackageStream({
            teamId: mockTeamId,
            skillId: mockSkillId,
            packageObjectId: mockVersionId,
            packageStream: Readable.from([Buffer.alloc(2 * 1024 * 1024), Buffer.from('x')])
          })
        ).rejects.toThrow(SkillErrEnum.archiveTooLarge);
      } finally {
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
          originalAgentSandboxStorageSize;
      }
    });
  });

  describe('downloadSkillPackageStream', () => {
    it('returns the S3 object as a bounded Readable', async () => {
      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      const stream = await downloadSkillPackageStream({ storageKey });

      expect(stream).toBeInstanceOf(Readable);
      await expect(consumeStream(stream)).resolves.toEqual(Buffer.from('mock zip content'));
    });

    it('throws when download response has no body', async () => {
      s3SkillSourceMocks.downloadObjectMock.mockResolvedValueOnce({ body: null });

      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      await expect(downloadSkillPackageStream({ storageKey })).rejects.toThrow(
        'Failed to download skill package'
      );
    });

    it('fails while consuming an object larger than the package limit', async () => {
      const originalAgentSandboxStorageSize =
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi;
      getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 0.001;
      s3SkillSourceMocks.downloadObjectMock.mockResolvedValueOnce({
        body: Readable.from([Buffer.alloc(2 * 1024 * 1024), Buffer.from('x')])
      });

      try {
        const stream = await downloadSkillPackageStream({ storageKey: 'too-large.zip' });
        await expect(consumeStream(stream)).rejects.toThrow(
          'Skill package exceeds maximum allowed size'
        );
      } finally {
        getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
          originalAgentSandboxStorageSize;
      }
    });
  });

  // ==================== deleteSkillPackage ====================
  describe('deleteSkillPackage', () => {
    it('should delete skill package successfully', async () => {
      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.tar.zst`;

      await expect(deleteSkillPackage(storageKey)).resolves.not.toThrow();
      expect(getS3SkillSource).toHaveBeenCalled();
      expect(s3SkillSourceMocks.deleteObjectMock).toHaveBeenCalledWith({ key: storageKey });
    });
  });

  describe('copySkillPackage', () => {
    it('copies .zip skill package via S3 server-side copyObject with .zip extension and temporary TTL', async () => {
      const sourceKey = `agent-skills/${mockTeamId}/${mockSkillId}/legacy.zip`;
      const expectedTargetKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      const copied = await copySkillPackage(sourceKey, {
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId
      });

      expect(copied.key).toBe(expectedTargetKey);
      expect(s3SkillSourceMocks.copyMock).toHaveBeenCalledWith({
        from: sourceKey,
        to: expectedTargetKey,
        options: { temporary: true }
      });
      expect(s3SkillSourceMocks.downloadObjectMock).not.toHaveBeenCalled();
      expect(s3SkillSourceMocks.uploadPackageStreamMock).not.toHaveBeenCalled();
    });

    it('copies .tar.zst skill package via S3 server-side copyObject with .tar.zst extension', async () => {
      const sourceKey = `agent-skills/${mockTeamId}/${mockSkillId}/source.tar.zst`;
      const expectedTargetKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.tar.zst`;

      const copied = await copySkillPackage(sourceKey, {
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId
      });

      expect(copied.key).toBe(expectedTargetKey);
      expect(s3SkillSourceMocks.copyMock).toHaveBeenCalledWith({
        from: sourceKey,
        to: expectedTargetKey,
        options: { temporary: true }
      });
      expect(s3SkillSourceMocks.downloadObjectMock).not.toHaveBeenCalled();
      expect(s3SkillSourceMocks.uploadPackageStreamMock).not.toHaveBeenCalled();
    });
  });
});

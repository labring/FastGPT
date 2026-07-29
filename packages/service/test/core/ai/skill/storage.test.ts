import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  uploadSkillPackage,
  uploadSkillPackageStream,
  downloadSkillPackage,
  downloadSkillPackageStream,
  deleteSkillPackage
} from '@fastgpt/service/core/ai/skill/package';
import { getS3SkillSource } from '@fastgpt/service/common/s3/sources/skill';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { serviceEnv } from '@fastgpt/service/env';
import { Readable } from 'node:stream';

const s3SkillSourceMocks = vi.hoisted(() => {
  const getSkillPackageKey = ({
    teamId,
    skillId,
    packageObjectId
  }: {
    teamId: string;
    skillId: string;
    packageObjectId: string;
  }) => `agent-skills/${teamId}/${skillId}/${packageObjectId}.zip`;

  return {
    uploadPackageMock: vi.fn().mockImplementation((params) =>
      Promise.resolve({
        key: getSkillPackageKey(params),
        accessUrl: { url: 'mock-url' }
      })
    ),
    downloadObjectMock: vi.fn().mockResolvedValue({
      // body must be async-iterable; an array satisfies for-await-of
      body: [Buffer.from('mock zip content')]
    }),
    deleteObjectMock: vi.fn().mockResolvedValue(undefined),
    checkObjectExistsMock: vi.fn().mockResolvedValue({ exists: true }),
    listObjectsMock: vi.fn().mockResolvedValue({ keys: [] }),
    deleteObjectsByPrefixMock: vi.fn().mockResolvedValue({ keys: [] }),
    removePackageTTLMock: vi.fn().mockResolvedValue(undefined),
    deleteSkillPackagesByPrefixMock: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('@fastgpt/service/common/s3/sources/skill', () => ({
  getS3SkillSource: vi.fn(() => ({
    bucketName: 'fastgpt-private',
    client: {
      downloadObject: s3SkillSourceMocks.downloadObjectMock,
      deleteObject: s3SkillSourceMocks.deleteObjectMock,
      checkObjectExists: s3SkillSourceMocks.checkObjectExistsMock,
      listObjects: s3SkillSourceMocks.listObjectsMock,
      deleteObjectsByPrefix: s3SkillSourceMocks.deleteObjectsByPrefixMock
    },
    uploadPackage: s3SkillSourceMocks.uploadPackageMock,
    removePackageTTL: s3SkillSourceMocks.removePackageTTLMock,
    deleteSkillPackagesByPrefix: s3SkillSourceMocks.deleteSkillPackagesByPrefixMock
  }))
}));

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
        zipBuffer: mockZipBuffer
      });

      expect(result).toEqual({
        key: `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`
      });
      expect(s3SkillSourceMocks.uploadPackageMock).toHaveBeenCalledWith({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        body: mockZipBuffer
      });
    });

    it('should reject zip buffers larger than the upload limit before uploading to S3', async () => {
      const originalAgentSandboxDiskMB = serviceEnv.AGENT_SANDBOX_DISK_MB;
      serviceEnv.AGENT_SANDBOX_DISK_MB = 2;

      try {
        const tooLargeBuffer = Buffer.alloc(1024 * 1024 + 1);

        await expect(
          uploadSkillPackage({
            teamId: mockTeamId,
            skillId: mockSkillId,
            packageObjectId: mockVersionId,
            zipBuffer: tooLargeBuffer
          })
        ).rejects.toThrow(SkillErrEnum.archiveTooLarge);

        expect(getS3SkillSource).not.toHaveBeenCalled();
        expect(s3SkillSourceMocks.uploadPackageMock).not.toHaveBeenCalled();
      } finally {
        serviceEnv.AGENT_SANDBOX_DISK_MB = originalAgentSandboxDiskMB;
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
          key: `agent-skills/${params.teamId}/${params.skillId}/${params.packageObjectId}.zip`
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

      expect(result.key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`);
      expect(uploadedBody?.toString()).toBe('chunk-1chunk-2');
      expect(s3SkillSourceMocks.uploadPackageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contentLength: 14,
          body: expect.any(Readable)
        })
      );
    });

    it('aborts a stream whose actual bytes exceed the package limit', async () => {
      const originalAgentSandboxDiskMB = serviceEnv.AGENT_SANDBOX_DISK_MB;
      serviceEnv.AGENT_SANDBOX_DISK_MB = 2;
      s3SkillSourceMocks.uploadPackageMock.mockImplementationOnce(async (params) => {
        await consumeStream(params.body);
        return { key: 'should-not-complete' };
      });

      try {
        await expect(
          uploadSkillPackageStream({
            teamId: mockTeamId,
            skillId: mockSkillId,
            packageObjectId: mockVersionId,
            packageStream: Readable.from([Buffer.alloc(1024 * 1024), Buffer.from('x')])
          })
        ).rejects.toThrow(SkillErrEnum.archiveTooLarge);
      } finally {
        serviceEnv.AGENT_SANDBOX_DISK_MB = originalAgentSandboxDiskMB;
      }
    });
  });

  // ==================== downloadSkillPackage ====================
  describe('downloadSkillPackage', () => {
    it('should download skill package successfully', async () => {
      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      const result = await downloadSkillPackage({ storageKey });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('mock zip content');
      expect(getS3SkillSource).toHaveBeenCalled();
      expect(s3SkillSourceMocks.downloadObjectMock).toHaveBeenCalledWith({ key: storageKey });
    });

    it('should throw when download response has no body', async () => {
      s3SkillSourceMocks.downloadObjectMock.mockResolvedValueOnce({ body: null });

      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      await expect(downloadSkillPackage({ storageKey })).rejects.toThrow(
        'Failed to download skill package'
      );
    });
  });

  describe('downloadSkillPackageStream', () => {
    it('returns the S3 object as a bounded Readable', async () => {
      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      const stream = await downloadSkillPackageStream({ storageKey });

      expect(stream).toBeInstanceOf(Readable);
      await expect(consumeStream(stream)).resolves.toEqual(Buffer.from('mock zip content'));
    });

    it('fails while consuming an object larger than the package limit', async () => {
      const originalAgentSandboxDiskMB = serviceEnv.AGENT_SANDBOX_DISK_MB;
      serviceEnv.AGENT_SANDBOX_DISK_MB = 2;
      s3SkillSourceMocks.downloadObjectMock.mockResolvedValueOnce({
        body: Readable.from([Buffer.alloc(1024 * 1024), Buffer.from('x')])
      });

      try {
        const stream = await downloadSkillPackageStream({ storageKey: 'too-large.zip' });
        await expect(consumeStream(stream)).rejects.toThrow(
          'Skill package exceeds maximum allowed size'
        );
      } finally {
        serviceEnv.AGENT_SANDBOX_DISK_MB = originalAgentSandboxDiskMB;
      }
    });
  });

  // ==================== deleteSkillPackage ====================
  describe('deleteSkillPackage', () => {
    it('should delete skill package successfully', async () => {
      const storageKey = `agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`;

      await expect(deleteSkillPackage(storageKey)).resolves.not.toThrow();
      expect(getS3SkillSource).toHaveBeenCalled();
      expect(s3SkillSourceMocks.deleteObjectMock).toHaveBeenCalledWith({ key: storageKey });
    });
  });
});

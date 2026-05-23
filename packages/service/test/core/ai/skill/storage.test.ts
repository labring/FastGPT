import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  uploadSkillPackage,
  downloadSkillPackage,
  deleteSkillPackage
} from '@fastgpt/service/core/ai/skill/package';
import { getS3SkillSource } from '@fastgpt/service/common/s3/sources/skill';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getSkillSizeLimits } from '@fastgpt/service/core/ai/skill/sandbox/config';
import { serviceEnv } from '@fastgpt/service/env';

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

  describe('getSkillSizeLimits', () => {
    it('should derive all skill size limits from the upload env value in MB', () => {
      const originalMaxUploadSize = serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE;

      serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE = 1;

      try {
        expect(getSkillSizeLimits()).toEqual({
          maxUploadBytes: 1 * 1024 * 1024,
          maxUncompressedBytes: 1 * 1024 * 1024,
          maxDownloadBytes: 1 * 1024 * 1024,
          maxSandboxPackageBytes: 1 * 1024 * 1024
        });
      } finally {
        serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE = originalMaxUploadSize;
      }
    });
  });

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

    it('should use S3SkillSource for upload', async () => {
      await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        zipBuffer: mockZipBuffer
      });

      expect(getS3SkillSource).toHaveBeenCalled();
    });

    it('should generate correct key for different version objects', async () => {
      const versions = [0, 1, 5, 10];

      for (const version of versions) {
        const versionId = `version-object-${version}`;
        const result = await uploadSkillPackage({
          teamId: mockTeamId,
          skillId: mockSkillId,
          packageObjectId: versionId,
          zipBuffer: mockZipBuffer
        });

        expect(result.key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/${versionId}.zip`);
      }
    });

    it('should handle large zip buffers', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB

      const result = await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        packageObjectId: mockVersionId,
        zipBuffer: largeBuffer
      });

      expect(result.key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/${mockVersionId}.zip`);
    });

    it('should reject zip buffers larger than the upload limit before uploading to S3', async () => {
      const originalMaxUploadSize = serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE;
      serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE = 1;

      try {
        const { maxUploadBytes } = getSkillSizeLimits();
        const tooLargeBuffer = Buffer.alloc(maxUploadBytes + 1);

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
        serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE = originalMaxUploadSize;
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

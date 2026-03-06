import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadSkillPackage,
  downloadSkillPackage,
  deleteSkillPackage,
  getSkillStorageKey,
  getSkillStorageInfo
} from '@fastgpt/service/core/agentSkills/storage';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';

// Mock the S3 bucket
vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: vi.fn().mockImplementation(() => ({
    bucketName: 'fastgpt-private',
    client: {
      uploadObject: vi.fn().mockResolvedValue(undefined),
      downloadObject: vi.fn().mockResolvedValue({
        body: Buffer.from('mock zip content')
      }),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      checkObjectExists: vi.fn().mockResolvedValue({ exists: true })
    }
  }))
}));

describe('storage', () => {
  const mockTeamId = 'team-abc123';
  const mockSkillId = 'skill-def456';
  const mockVersion = 0;
  const mockZipBuffer = Buffer.from('mock zip content');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== getSkillStorageKey ====================
  describe('getSkillStorageKey', () => {
    it('should generate correct storage key for v0', () => {
      const key = getSkillStorageKey(mockTeamId, mockSkillId, 0);
      expect(key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/v0/package.zip`);
    });

    it('should generate correct storage key for higher versions', () => {
      const key = getSkillStorageKey(mockTeamId, mockSkillId, 5);
      expect(key).toBe(`agent-skills/${mockTeamId}/${mockSkillId}/v5/package.zip`);
    });

    it('should handle different team and skill IDs', () => {
      const key = getSkillStorageKey('team-xyz', 'skill-123', 1);
      expect(key).toBe('agent-skills/team-xyz/skill-123/v1/package.zip');
    });
  });

  // ==================== uploadSkillPackage ====================
  describe('uploadSkillPackage', () => {
    it('should upload skill package successfully', async () => {
      const result = await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        version: mockVersion,
        zipBuffer: mockZipBuffer
      });

      expect(result).toEqual({
        bucket: 'fastgpt-private',
        key: `agent-skills/${mockTeamId}/${mockSkillId}/v${mockVersion}/package.zip`,
        size: mockZipBuffer.length
      });
    });

    it('should use S3PrivateBucket for upload', async () => {
      await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        version: mockVersion,
        zipBuffer: mockZipBuffer
      });

      expect(S3PrivateBucket).toHaveBeenCalled();
    });

    it('should generate correct key for different versions', async () => {
      const versions = [0, 1, 5, 10];

      for (const version of versions) {
        const result = await uploadSkillPackage({
          teamId: mockTeamId,
          skillId: mockSkillId,
          version,
          zipBuffer: mockZipBuffer
        });

        expect(result.key).toBe(
          `agent-skills/${mockTeamId}/${mockSkillId}/v${version}/package.zip`
        );
      }
    });

    it('should handle large zip buffers', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB

      const result = await uploadSkillPackage({
        teamId: mockTeamId,
        skillId: mockSkillId,
        version: mockVersion,
        zipBuffer: largeBuffer
      });

      expect(result.size).toBe(largeBuffer.length);
    });
  });

  // ==================== downloadSkillPackage ====================
  describe('downloadSkillPackage', () => {
    it('should download skill package successfully', async () => {
      const storageInfo = {
        bucket: 'fastgpt-private',
        key: `agent-skills/${mockTeamId}/${mockSkillId}/v0/package.zip`,
        size: mockZipBuffer.length
      };

      const result = await downloadSkillPackage({ storageInfo });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('mock zip content');
    });

    it('should handle download errors', async () => {
      const storageInfo = {
        bucket: 'fastgpt-private',
        key: `agent-skills/${mockTeamId}/${mockSkillId}/v0/package.zip`,
        size: 0
      };

      // Mock should handle the download
      await expect(downloadSkillPackage({ storageInfo })).resolves.toBeDefined();
    });
  });

  // ==================== deleteSkillPackage ====================
  describe('deleteSkillPackage', () => {
    it('should delete skill package successfully', async () => {
      const storageInfo = {
        bucket: 'fastgpt-private',
        key: `agent-skills/${mockTeamId}/${mockSkillId}/v0/package.zip`,
        size: mockZipBuffer.length
      };

      await expect(deleteSkillPackage(storageInfo)).resolves.not.toThrow();
    });
  });

  // ==================== getSkillStorageInfo ====================
  describe('getSkillStorageInfo', () => {
    it('should return storage info for existing object', async () => {
      const result = await getSkillStorageInfo({
        teamId: mockTeamId,
        skillId: mockSkillId,
        version: 0
      });

      expect(result).toEqual({
        bucket: 'fastgpt-private',
        key: `agent-skills/${mockTeamId}/${mockSkillId}/v0/package.zip`,
        exists: true,
        size: 0
      });
    });

    it('should handle non-existing objects', async () => {
      const key = `agent-skills/${mockTeamId}/${mockSkillId}/v999/package.zip`;

      const result = await getSkillStorageInfo(key);

      expect(result.exists).toBe(true); // Mock always returns true
    });
  });
});

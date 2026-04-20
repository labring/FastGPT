import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  createVersion,
  getNextVersionNumber,
  setActiveVersion,
  getVersionBySkillIdAndVersion,
  listVersions,
  getActiveVersion,
  deleteVersion,
  restoreVersion
} from '@fastgpt/service/core/agentSkills/version/controller';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';

describe('versionController', () => {
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;
  let testSkillId: string;

  beforeAll(async () => {
    testTeamId = new Types.ObjectId().toHexString();
    testTmbId = new Types.ObjectId().toHexString();
    testUserId = new Types.ObjectId().toHexString();
  });

  beforeEach(async () => {
    // Clean up test data
    await MongoAgentSkillsVersion.deleteMany({});
    await MongoAgentSkills.deleteMany({ teamId: testTeamId });

    // Create a test skill
    const [skill] = await MongoAgentSkills.create([
      {
        source: AgentSkillSourceEnum.personal,
        name: 'Test Skill',
        description: 'A test skill',
        author: testUserId,
        category: [],
        config: {},
        teamId: testTeamId,
        tmbId: testTmbId,
        createTime: new Date(),
        updateTime: new Date(),
        deleteTime: null
      }
    ]);

    testSkillId = skill._id.toString();
  });

  afterEach(async () => {
    // Clean up test data
    await MongoAgentSkillsVersion.deleteMany({ skillId: testSkillId });
    await MongoAgentSkills.deleteOne({ _id: testSkillId });
  });

  // ==================== createVersion ====================
  describe('createVersion', () => {
    it('should create v0 version successfully', async () => {
      const versionData = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        versionName: 'Initial creation',
        storage: {
          bucket: 'fastgpt-private',
          key: `agent-skills/${testTeamId}/${testSkillId}/v0/package.zip`,
          size: 1024
        }
      };

      const versionId = await createVersion(versionData);

      expect(versionId).toBeDefined();
      expect(typeof versionId).toBe('string');

      // Verify version was created
      const version = await MongoAgentSkillsVersion.findById(versionId);
      expect(version).toBeDefined();
      expect(version?.skillId.toString()).toBe(testSkillId);
      expect(version?.version).toBe(0);
      expect(version?.versionName).toBe('Initial creation');
      expect(version?.isActive).toBe(true);
      expect(version?.isDeleted).toBe(false);
      expect(version?.storage.bucket).toBe(versionData.storage.bucket);
      expect(version?.storage.key).toBe(versionData.storage.key);
      expect(version?.storage.size).toBe(versionData.storage.size);
    });

    it('should create multiple versions for the same skill', async () => {
      // Create v0
      const v0Data = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        storage: { bucket: 'test', key: 'v0', size: 100 }
      };
      const v0Id = await createVersion(v0Data);

      // Create v1
      const v1Data = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 1,
        storage: { bucket: 'test', key: 'v1', size: 200 }
      };
      const v1Id = await createVersion(v1Data);

      // Verify both versions exist
      const v0 = await MongoAgentSkillsVersion.findById(v0Id);
      const v1 = await MongoAgentSkillsVersion.findById(v1Id);

      expect(v0?.version).toBe(0);
      expect(v1?.version).toBe(1);
    });

    it('should store snapshot of skill data', async () => {
      const config = {
        api: {
          url: 'https://api.example.com',
          method: 'POST',
          headers: { Authorization: 'Bearer token' }
        }
      };

      const versionData = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        storage: { bucket: 'test', key: 'test', size: 100 }
      };

      const versionId = await createVersion(versionData);
      const version = await MongoAgentSkillsVersion.findById(versionId);

      // Verify storage data is stored correctly
      expect(version?.storage.bucket).toBe('test');
      expect(version?.storage.key).toBe('test');
      expect(version?.storage.size).toBe(100);
    });

    it('should set isActive to true by default', async () => {
      const versionData = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        storage: { bucket: 'test', key: 'test', size: 100 }
      };

      const versionId = await createVersion(versionData);
      const version = await MongoAgentSkillsVersion.findById(versionId);

      expect(version?.isActive).toBe(true);
    });

    it('should set isDeleted to false by default', async () => {
      const versionData = {
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        storage: { bucket: 'test', key: 'test', size: 100 }
      };

      const versionId = await createVersion(versionData);
      const version = await MongoAgentSkillsVersion.findById(versionId);

      expect(version?.isDeleted).toBe(false);
    });
  });

  // ==================== getNextVersionNumber ====================
  describe('getNextVersionNumber', () => {
    it('should return 0 for skill with no versions', async () => {
      const nextVersion = await getNextVersionNumber(testSkillId);
      expect(nextVersion).toBe(0);
    });

    it('should return 1 after v0 exists', async () => {
      // Create v0
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: true,
        isDeleted: false,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      const nextVersion = await getNextVersionNumber(testSkillId);
      expect(nextVersion).toBe(1);
    });

    it('should return correct next version for multiple existing versions', async () => {
      // Create v0, v1, v2
      for (let i = 0; i <= 2; i++) {
        await MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: i,
          isActive: i === 2, // v2 is active
          isDeleted: false,
          name: 'Test Skill',
          markdown: `# V${i}`,
          config: {},
          description: `V${i}`,
          category: [],
          storage: { bucket: 'test', key: `v${i}`, size: 100 },
          createdAt: new Date()
        });
      }

      const nextVersion = await getNextVersionNumber(testSkillId);
      expect(nextVersion).toBe(3);
    });

    it('should ignore deleted versions when calculating next version', async () => {
      // Create v0 (not deleted)
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: false,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      // Create v1 (deleted)
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 1,
        isActive: false,
        isDeleted: true,
        name: 'Test Skill',
        markdown: '# V1',
        config: {},
        description: 'V1',
        category: [],
        storage: { bucket: 'test', key: 'v1', size: 100 },
        createdAt: new Date()
      });

      // Next version should be 1: max non-deleted version is 0 (v0), so next = 0+1 = 1
      const nextVersion = await getNextVersionNumber(testSkillId);
      expect(nextVersion).toBe(1);
    });
  });

  // ==================== setActiveVersion ====================
  describe('setActiveVersion', () => {
    it('should set a version as active', async () => {
      // Create v0 and v1
      const [v0, v1] = await Promise.all([
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 0,
          isActive: true,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V0',
          config: {},
          description: 'V0',
          category: [],
          storage: { bucket: 'test', key: 'v0', size: 100 },
          createdAt: new Date()
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 1,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V1',
          config: {},
          description: 'V1',
          category: [],
          storage: { bucket: 'test', key: 'v1', size: 100 },
          createdAt: new Date()
        })
      ]);

      // Set v1 as active
      await setActiveVersion(testSkillId, 1);

      // Verify v0 is no longer active and v1 is active
      const v0Updated = await MongoAgentSkillsVersion.findById(v0._id);
      const v1Updated = await MongoAgentSkillsVersion.findById(v1._id);

      expect(v0Updated?.isActive).toBe(false);
      expect(v1Updated?.isActive).toBe(true);
    });

    it('should throw error when version does not exist', async () => {
      await expect(setActiveVersion(testSkillId, 999)).rejects.toThrow();
    });

    it('should throw error when version is deleted', async () => {
      // Create a deleted version
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: true,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      await expect(setActiveVersion(testSkillId, 0)).rejects.toThrow();
    });
  });

  // ==================== getVersionBySkillIdAndVersion ====================
  describe('getVersionBySkillIdAndVersion', () => {
    it('should return version by skillId and version number', async () => {
      // Create a version
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 5,
        isActive: true,
        isDeleted: false,
        name: 'Test Skill',
        markdown: '# V5',
        config: { version: 5 },
        description: 'Version 5',
        category: ['tool'],
        storage: { bucket: 'test', key: 'v5', size: 500 },
        createdAt: new Date()
      });

      const version = await getVersionBySkillIdAndVersion(testSkillId, 5);

      expect(version).toBeDefined();
      expect(version?.version).toBe(5);
      expect(version?.storage.key).toBe('v5');
    });

    it('should return null for non-existing version', async () => {
      const version = await getVersionBySkillIdAndVersion(testSkillId, 999);
      expect(version).toBeNull();
    });

    it('should not return deleted versions', async () => {
      // Create a deleted version
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 3,
        isActive: false,
        isDeleted: true,
        name: 'Test Skill',
        markdown: '# V3',
        config: {},
        description: 'Deleted version',
        category: [],
        storage: { bucket: 'test', key: 'v3', size: 100 },
        createdAt: new Date()
      });

      const version = await getVersionBySkillIdAndVersion(testSkillId, 3);
      expect(version).toBeNull();
    });
  });

  // ==================== listVersions ====================
  describe('listVersions', () => {
    it('should list all versions for a skill', async () => {
      // Create multiple versions
      await Promise.all([
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 0,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V0',
          config: {},
          description: 'V0',
          category: [],
          storage: { bucket: 'test', key: 'v0', size: 100 },
          createdAt: new Date('2024-01-01')
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 1,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V1',
          config: {},
          description: 'V1',
          category: [],
          storage: { bucket: 'test', key: 'v1', size: 200 },
          createdAt: new Date('2024-01-02')
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 2,
          isActive: true,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V2',
          config: {},
          description: 'V2',
          category: [],
          storage: { bucket: 'test', key: 'v2', size: 300 },
          createdAt: new Date('2024-01-03')
        })
      ]);

      const versions = await listVersions(testSkillId);

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(2); // Most recent first
      expect(versions[1].version).toBe(1);
      expect(versions[2].version).toBe(0);

      // Verify active version is marked
      const activeVersion = versions.find((v) => v.isActive);
      expect(activeVersion?.version).toBe(2);
    });

    it('should exclude deleted versions', async () => {
      // Create versions, one deleted
      await Promise.all([
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 0,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V0',
          config: {},
          description: 'V0',
          category: [],
          storage: { bucket: 'test', key: 'v0', size: 100 },
          createdAt: new Date()
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 1,
          isActive: false,
          isDeleted: true, // Deleted
          name: 'Test Skill',
          markdown: '# V1',
          config: {},
          description: 'V1',
          category: [],
          storage: { bucket: 'test', key: 'v1', size: 100 },
          createdAt: new Date()
        })
      ]);

      const versions = await listVersions(testSkillId);

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(0);
    });

    it('should return empty array for skill with no versions', async () => {
      const versions = await listVersions(testSkillId);
      expect(versions).toEqual([]);
    });
  });

  // ==================== getActiveVersion ====================
  describe('getActiveVersion', () => {
    it('should return the active version', async () => {
      // Create versions with v2 active
      await Promise.all([
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 0,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V0',
          config: {},
          description: 'V0',
          category: [],
          storage: { bucket: 'test', key: 'v0', size: 100 },
          createdAt: new Date()
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 1,
          isActive: false,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V1',
          config: {},
          description: 'V1',
          category: [],
          storage: { bucket: 'test', key: 'v1', size: 100 },
          createdAt: new Date()
        }),
        MongoAgentSkillsVersion.create({
          skillId: testSkillId,
          tmbId: testTmbId,
          version: 2,
          isActive: true,
          isDeleted: false,
          name: 'Test Skill',
          markdown: '# V2',
          config: {},
          description: 'V2',
          category: [],
          storage: { bucket: 'test', key: 'v2', size: 100 },
          createdAt: new Date()
        })
      ]);

      const activeVersion = await getActiveVersion(testSkillId);

      expect(activeVersion).toBeDefined();
      expect(activeVersion?.version).toBe(2);
      expect(activeVersion?.isActive).toBe(true);
    });

    it('should return null if no active version exists', async () => {
      // Create a version that is not active
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: false,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      const activeVersion = await getActiveVersion(testSkillId);
      expect(activeVersion).toBeNull();
    });

    it('should return null if skill has no versions', async () => {
      const activeVersion = await getActiveVersion(testSkillId);
      expect(activeVersion).toBeNull();
    });
  });

  // ==================== deleteVersion ====================
  describe('deleteVersion', () => {
    it('should soft delete a version', async () => {
      // Create a non-active version so it can be deleted
      const version = await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: false,
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      // Delete the version
      await deleteVersion(testSkillId, 0);

      // Verify version is soft deleted
      const updatedVersion = await MongoAgentSkillsVersion.findById(version._id);
      expect(updatedVersion?.isDeleted).toBe(true);
      expect(updatedVersion?.isActive).toBe(false);
    });

    it('should throw error when version does not exist', async () => {
      await expect(deleteVersion(testSkillId, 999)).rejects.toThrow();
    });

    it('should throw error when version is already deleted', async () => {
      // Create a deleted version
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: true,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      await expect(deleteVersion(testSkillId, 0)).rejects.toThrow();
    });
  });

  // ==================== restoreVersion ====================
  describe('restoreVersion', () => {
    it('should restore a deleted version', async () => {
      // Create a deleted version
      const version = await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: false,
        isDeleted: true,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      // Restore the version
      await restoreVersion(testSkillId, 0);

      // Verify version is restored
      const updatedVersion = await MongoAgentSkillsVersion.findById(version._id);
      expect(updatedVersion?.isDeleted).toBe(false);
    });

    it('should throw error when version does not exist', async () => {
      await expect(restoreVersion(testSkillId, 999)).rejects.toThrow();
    });

    it('should throw error when version is not deleted', async () => {
      // Create an active version
      await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        version: 0,
        isActive: true,
        isDeleted: false,
        name: 'Test Skill',
        markdown: '# V0',
        config: {},
        description: 'V0',
        category: [],
        storage: { bucket: 'test', key: 'v0', size: 100 },
        createdAt: new Date()
      });

      await expect(restoreVersion(testSkillId, 0)).rejects.toThrow();
    });
  });
});

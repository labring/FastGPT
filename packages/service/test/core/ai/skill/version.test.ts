import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import {
  createVersion,
  getVersionById,
  listVersions,
  getCurrentVersion
} from '@fastgpt/service/core/ai/skill/version';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';

describe('versionController', () => {
  let testTeamId: string;
  let testTmbId: string;
  let testSkillId: string;

  beforeAll(async () => {
    testTeamId = new Types.ObjectId().toHexString();
    testTmbId = new Types.ObjectId().toHexString();
  });

  beforeEach(async () => {
    await MongoAgentSkillsVersion.deleteMany({});
    await MongoAgentSkills.deleteMany({ teamId: testTeamId });

    const [skill] = await MongoAgentSkills.create([
      {
        source: AgentSkillSourceEnum.personal,
        name: 'Test Skill',
        description: 'A test skill',
        category: [],
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
    await MongoAgentSkillsVersion.deleteMany({ skillId: testSkillId });
    await MongoAgentSkills.deleteOne({ _id: testSkillId });
  });

  describe('createVersion', () => {
    it('should create a storage-only version record', async () => {
      const versionData = {
        skillId: testSkillId,
        tmbId: testTmbId,
        versionName: 'Initial creation',
        storageKey: `agent-skills/${testTeamId}/${testSkillId}/version-v0.zip`,
        runtimeSkills: []
      };

      const versionId = await createVersion(versionData);
      const version = await MongoAgentSkillsVersion.findById(versionId);

      expect(versionId).toBeDefined();
      expect(typeof versionId).toBe('string');
      expect(version).toBeDefined();
      expect(version?.skillId.toString()).toBe(testSkillId);
      expect(version?.versionName).toBe('Initial creation');
      expect(version?.storageKey).toBe(versionData.storageKey);
    });

    it('should create multiple versions for the same skill', async () => {
      const v0Id = await createVersion({
        skillId: testSkillId,
        tmbId: testTmbId,
        storageKey: 'v0',
        runtimeSkills: []
      });
      const v1Id = await createVersion({
        skillId: testSkillId,
        tmbId: testTmbId,
        storageKey: 'v1',
        runtimeSkills: []
      });

      const [v0, v1] = await Promise.all([
        MongoAgentSkillsVersion.findById(v0Id),
        MongoAgentSkillsVersion.findById(v1Id)
      ]);

      expect(v0?.storageKey).toBe('v0');
      expect(v1?.storageKey).toBe('v1');
    });
  });

  describe('version queries', () => {
    it('should return version by version id', async () => {
      const created = await MongoAgentSkillsVersion.create({
        skillId: testSkillId,
        tmbId: testTmbId,
        storageKey: 'v5',
        createdAt: new Date()
      });

      const version = await getVersionById(testSkillId, created._id.toString());

      expect(version).toBeDefined();
      expect(version?.storageKey).toBe('v5');
    });

    it('should list versions in descending createdAt order', async () => {
      await MongoAgentSkillsVersion.create([
        {
          skillId: testSkillId,
          tmbId: testTmbId,
          storageKey: 'v0',
          createdAt: new Date('2024-01-01')
        },
        {
          skillId: testSkillId,
          tmbId: testTmbId,
          storageKey: 'v1',
          createdAt: new Date('2024-01-02')
        },
        {
          skillId: testSkillId,
          tmbId: testTmbId,
          storageKey: 'v2',
          createdAt: new Date('2024-01-03')
        }
      ]);

      const versions = await listVersions(testSkillId);

      expect(versions.map((item) => item.storageKey)).toEqual(['v2', 'v1', 'v0']);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return the version pointed to by skill.currentVersionId', async () => {
      const [, latest] = await MongoAgentSkillsVersion.create([
        {
          skillId: testSkillId,
          tmbId: testTmbId,
          storageKey: 'v0',
          createdAt: new Date()
        },
        {
          skillId: testSkillId,
          tmbId: testTmbId,
          storageKey: 'v2',
          createdAt: new Date()
        }
      ]);
      await MongoAgentSkills.updateOne(
        { _id: testSkillId },
        { $set: { currentVersionId: latest._id } }
      );

      const currentVersion = await getCurrentVersion(testSkillId);

      expect(currentVersion).toBeDefined();
      expect(currentVersion?.storageKey).toBe('v2');
    });

    it('should return null if skill.currentVersionId points to a missing version', async () => {
      await MongoAgentSkills.updateOne(
        { _id: testSkillId },
        { $set: { currentVersionId: new Types.ObjectId() } }
      );

      const currentVersion = await getCurrentVersion(testSkillId);

      expect(currentVersion).toBeNull();
    });
  });
});

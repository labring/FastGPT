import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import {
  createSkill,
  createSkillFolder,
  updateSkill,
  deleteSkill,
  getSkillById,
  canModifySkill,
  importSkill
} from '@fastgpt/service/core/ai/skill/manage';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { parseSkillMarkdown } from '@fastgpt/service/core/ai/skill/utils';
import {
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum
} from '@fastgpt/global/core/ai/skill/constants';

describe('AgentSkill Controller', () => {
  let testTeamId: string;
  let testTmbId: string;

  beforeAll(async () => {
    testTeamId = new Types.ObjectId().toHexString();
    testTmbId = new Types.ObjectId().toHexString();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const skillIds = await MongoAgentSkills.find({ teamId: testTeamId }, { _id: 1 }).lean();
    await Promise.all([
      MongoAgentSkills.deleteMany({ teamId: testTeamId }),
      MongoAgentSkillsVersion.deleteMany({ skillId: { $in: skillIds.map((skill) => skill._id) } })
    ]);
  });

  afterAll(async () => {
    // Clean up all test data
    const skillIds = await MongoAgentSkills.find({ teamId: testTeamId }, { _id: 1 }).lean();
    await Promise.all([
      MongoAgentSkills.deleteMany({ teamId: testTeamId }),
      MongoAgentSkillsVersion.deleteMany({ skillId: { $in: skillIds.map((skill) => skill._id) } })
    ]);
  });

  // ==================== Create Skill ====================
  describe('createSkill', () => {
    it('should create a personal skill with valid data', async () => {
      const skillData = {
        name: 'Test Skill',
        description: 'A test skill',
        category: [AgentSkillCategoryEnum.tool],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);

      expect(skillId).toBeDefined();
      expect(typeof skillId).toBe('string');

      // Verify skill was created
      const skill = await MongoAgentSkills.findById(skillId);
      expect(skill).toBeDefined();
      expect(skill?.name).toBe(skillData.name);
      expect(skill?.source).toBe(AgentSkillSourceEnum.personal);
      expect(skill?.description).toBe(skillData.description);
    });

    it('should create skill with default category when not provided', async () => {
      const skillData = {
        name: 'Test Skill No Category',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const skill = await MongoAgentSkills.findById(skillId);

      expect(skill).toBeDefined();
      expect(skill?.category).toEqual([]);
    });
  });

  // ==================== Get Skill ====================
  describe('getSkillById', () => {
    it('should return skill by ID', async () => {
      const skillData = {
        name: 'Get Test Skill',
        description: 'A test skill',
        category: [AgentSkillCategoryEnum.tool],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const skill = await getSkillById(skillId);

      expect(skill).toBeDefined();
      expect(skill?.name).toBe(skillData.name);
      expect(skill?.description).toBe(skillData.description);
    });

    it('should return null for non-existent skill', async () => {
      const skill = await getSkillById('507f1f77bcf86cd799439011'); // Valid but non-existent ObjectId

      expect(skill).toBeNull();
    });

    it('should return null for deleted skill', async () => {
      const skillData = {
        name: 'Deleted Skill',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      await deleteSkill(skillId);

      const skill = await getSkillById(skillId);
      expect(skill).toBeNull();
    });
  });

  // ==================== Update Skill ====================
  describe('updateSkill', () => {
    it('should update skill name', async () => {
      const skillData = {
        name: 'Original Name',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);

      await updateSkill(skillId, { name: 'Updated Name' });

      const updatedSkill = await MongoAgentSkills.findById(skillId);
      expect(updatedSkill?.name).toBe('Updated Name');
      expect(updatedSkill?.description).toBe(skillData.description); // Unchanged
    });

    it('should update skill description', async () => {
      const skillData = {
        name: 'Update Test',
        description: 'Original description',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);

      await updateSkill(skillId, {
        description: 'Updated description'
      });

      const updatedSkill = await MongoAgentSkills.findById(skillId);
      expect(updatedSkill?.description).toBe('Updated description');
    });

    it('should update updateTime on modification', async () => {
      const skillData = {
        name: 'Time Test',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const originalSkill = await MongoAgentSkills.findById(skillId);
      const originalUpdateTime = originalSkill?.updateTime;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      await updateSkill(skillId, { name: 'Time Updated' });

      const updatedSkill = await MongoAgentSkills.findById(skillId);
      expect(updatedSkill?.updateTime?.getTime()).toBeGreaterThan(
        originalUpdateTime?.getTime() || 0
      );
    });
  });

  // ==================== Delete Skill ====================
  describe('deleteSkill', () => {
    it('should soft delete personal skill', async () => {
      const skillData = {
        name: 'Delete Test',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);

      // Verify skill exists
      let skill = await MongoAgentSkills.findById(skillId);
      expect(skill?.deleteTime).toBeNull();

      // Delete skill
      await deleteSkill(skillId);

      // Verify soft delete
      skill = await MongoAgentSkills.findById(skillId);
      expect(skill?.deleteTime).toBeDefined();
      expect(skill?.deleteTime).not.toBeNull();
    });

    it('should mark a folder subtree as deleted without changing child version state', async () => {
      const folder = await createSkillFolder({
        name: 'Delete Folder',
        teamId: testTeamId,
        tmbId: testTmbId
      });
      const childSkillId = await createSkill({
        parentId: folder._id.toString(),
        name: 'Child Skill',
        description: 'A child skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      });

      await MongoAgentSkillsVersion.create({
        skillId: childSkillId,
        versionName: 'v0',
        storageKey: 'test-key',
        tmbId: testTmbId,
        createdAt: new Date()
      });

      await deleteSkill(folder._id.toString());

      const [deletedFolder, deletedChild, childVersion] = await Promise.all([
        MongoAgentSkills.findById(folder._id),
        MongoAgentSkills.findById(childSkillId),
        MongoAgentSkillsVersion.findOne({ skillId: childSkillId })
      ]);

      expect(deletedFolder?.deleteTime).toBeInstanceOf(Date);
      expect(deletedChild?.deleteTime).toBeInstanceOf(Date);
      expect(deletedChild?.deleteTime?.getTime()).toBe(deletedFolder?.deleteTime?.getTime());
      expect(childVersion).toBeDefined();
    });

    it('should throw error when deleting non-existent skill', async () => {
      await expect(deleteSkill('507f1f77bcf86cd799439011')).rejects.toThrow('Skill not found');
    });

    it('should throw error when deleting system skill', async () => {
      // Create a system skill directly
      const [systemSkill] = await MongoAgentSkills.create([
        {
          source: AgentSkillSourceEnum.system,
          name: 'System Skill',
          description: 'A system skill',
          category: [],
          teamId: null,
          tmbId: null,
          createTime: new Date(),
          updateTime: new Date(),
          deleteTime: null
        }
      ]);

      await expect(deleteSkill(systemSkill._id.toString())).rejects.toThrow(
        'Cannot delete system skill'
      );

      // Cleanup
      await MongoAgentSkills.deleteOne({ _id: systemSkill._id });
    });
  });

  // ==================== Permission Checks ====================
  describe('canModifySkill', () => {
    it('should return true for skill owner', async () => {
      const skillData = {
        name: 'Permission Test',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const canModify = await canModifySkill(skillId, testTmbId);

      expect(canModify).toBe(true);
    });

    it('should return false for non-owner', async () => {
      const skillData = {
        name: 'Permission Test 2',
        description: 'A test skill',
        category: [],
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const canModify = await canModifySkill(skillId, 'different-tmb-id');

      expect(canModify).toBe(false);
    });

    it('should return false for system skill', async () => {
      const [systemSkill] = await MongoAgentSkills.create([
        {
          source: AgentSkillSourceEnum.system,
          name: 'System Permission Test',
          description: 'A system skill',
          category: [],
          teamId: null,
          tmbId: null,
          createTime: new Date(),
          updateTime: new Date(),
          deleteTime: null
        }
      ]);

      const canModify = await canModifySkill(systemSkill._id.toString(), testTmbId);
      expect(canModify).toBe(false);

      // Cleanup
      await MongoAgentSkills.deleteOne({ _id: systemSkill._id });
    });
  });

  // ==================== Import Skill ====================
  describe('importSkill', () => {
    it('should import skill from package', async () => {
      const packageData = {
        skill: {
          name: 'Imported Skill',
          description: 'An imported skill',
          category: [AgentSkillCategoryEnum.tool]
        }
      };

      // Create a mock ZIP buffer
      const mockZipBuffer = Buffer.from('mock zip content');

      const skillId = await importSkill(packageData, testTeamId, testTmbId, mockZipBuffer);

      expect(skillId).toBeDefined();

      const skill = await MongoAgentSkills.findById(skillId);
      expect(skill?.name).toBe(packageData.skill.name);
      expect(skill?.description).toBe(packageData.skill.description);
      expect(skill?.source).toBe(AgentSkillSourceEnum.personal);
    });

    it('should allow importing duplicate name without error', async () => {
      const packageData = {
        skill: {
          name: 'Duplicate Import',
          description: 'A skill',
          category: []
        }
      };

      const mockZipBuffer = Buffer.from('mock zip content');

      // First import
      const firstSkillId = await importSkill(packageData, testTeamId, testTmbId, mockZipBuffer);

      // Second import should succeed with a different ID
      const secondSkillId = await importSkill(packageData, testTeamId, testTmbId, mockZipBuffer);

      expect(firstSkillId).toBeDefined();
      expect(secondSkillId).toBeDefined();
      expect(firstSkillId).not.toBe(secondSkillId);
    });
  });

  // ==================== Parse SKILL.md ====================
  describe('parseSkillMarkdown', () => {
    it('should parse YAML frontmatter correctly', () => {
      const markdown = `---
name: web-search
description: Search the web
metadata:
  version: "1.0"
  category: search,tool
---

# Web Search

This is the content.`;

      const result = parseSkillMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.frontmatter.name).toBe('web-search');
      expect(result.frontmatter.description).toBe('Search the web');
      expect(result.frontmatter.metadata).toEqual({
        version: '1.0',
        category: 'search,tool' // raw string, not parsed array (parseSkillMarkdown returns raw YAML values)
      });
      expect(result.content).toContain('# Web Search');
    });

    it('should return error when frontmatter is missing', () => {
      const markdown = `# No Frontmatter

This content has no frontmatter.`;

      const result = parseSkillMarkdown(markdown);

      expect(result.error).toContain('SKILL.md must contain YAML frontmatter');
    });

    it('should parse array values correctly', () => {
      const markdown = `---
name: test-skill
description: A test
category: [search, tool, coding]
---

# Test`;

      const result = parseSkillMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.frontmatter.category).toEqual(['search', 'tool', 'coding']);
    });

    it('should parse frontmatter-only SKILL.md content', () => {
      const markdown = `---
name: test-skill
description: A test
---`;

      const result = parseSkillMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.frontmatter.name).toBe('test-skill');
      expect(result.frontmatter.description).toBe('A test');
      expect(result.content).toBe('');
    });

    it('should parse boolean values correctly', () => {
      const markdown = `---
name: test-skill
description: A test
metadata:
  enabled: true
  disabled: false
---

# Test`;

      const result = parseSkillMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.frontmatter.metadata.enabled).toBe(true);
      expect(result.frontmatter.metadata.disabled).toBe(false);
    });
  });
});

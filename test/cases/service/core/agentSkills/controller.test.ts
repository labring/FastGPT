import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  createSkill,
  updateSkill,
  deleteSkill,
  getSkillById,
  canModifySkill,
  checkSkillNameExists,
  importSkill
} from '@fastgpt/service/core/agentSkills/controller';
import {
  parseSkillMarkdown,
  extractSkillFromMarkdown
} from '@fastgpt/service/core/agentSkills/utils';
import {
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum
} from '@fastgpt/global/core/agentSkills/constants';

describe('AgentSkill Controller', () => {
  let testTeamId: string;
  let testTmbId: string;
  let testUserId: string;

  beforeAll(async () => {
    testTeamId = new Types.ObjectId().toHexString();
    testTmbId = new Types.ObjectId().toHexString();
    testUserId = new Types.ObjectId().toHexString();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await MongoAgentSkills.deleteMany({ teamId: testTeamId });
  });

  afterAll(async () => {
    // Clean up all test data
    await MongoAgentSkills.deleteMany({ teamId: testTeamId });
  });

  // ==================== Create Skill ====================
  describe('createSkill', () => {
    it('should create a personal skill with valid data', async () => {
      const skillData = {
        name: 'Test Skill',
        description: 'A test skill',
        author: testUserId,
        category: [AgentSkillCategoryEnum.tool],
        config: { test: true },
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [AgentSkillCategoryEnum.tool],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
          author: 'system',
          category: [],
          config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
        author: testUserId,
        category: [],
        config: {},
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
          author: 'system',
          category: [],
          config: {},
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

  // ==================== Check Name Exists ====================
  describe('checkSkillNameExists', () => {
    it('should return true for existing name', async () => {
      const skillData = {
        name: 'Existing Name',
        description: 'A test skill',
        author: testUserId,
        category: [],
        config: {},
        teamId: testTeamId,
        tmbId: testTmbId
      };

      await createSkill(skillData);
      const exists = await checkSkillNameExists('Existing Name', testTeamId, null);

      expect(exists).toBe(true);
    });

    it('should return false for non-existing name', async () => {
      const exists = await checkSkillNameExists('Non-Existing Name', testTeamId, null);
      expect(exists).toBe(false);
    });

    it('should return false when excluding current skill', async () => {
      const skillData = {
        name: 'Unique Name',
        description: 'A test skill',
        author: testUserId,
        category: [],
        config: {},
        teamId: testTeamId,
        tmbId: testTmbId
      };

      const skillId = await createSkill(skillData);
      const exists = await checkSkillNameExists('Unique Name', testTeamId, skillId);

      expect(exists).toBe(false);
    });
  });

  // ==================== Import Skill ====================
  describe('importSkill', () => {
    it('should import skill from package', async () => {
      const packageData = {
        skill: {
          name: 'Imported Skill',
          description: 'An imported skill',
          category: [AgentSkillCategoryEnum.tool],
          config: { api: { url: 'https://example.com' } }
        }
      };

      // Create a mock ZIP buffer
      const mockZipBuffer = Buffer.from('mock zip content');

      const skillId = await importSkill(
        packageData,
        testTeamId,
        testTmbId,
        testUserId,
        mockZipBuffer
      );

      expect(skillId).toBeDefined();

      const skill = await MongoAgentSkills.findById(skillId);
      expect(skill?.name).toBe(packageData.skill.name);
      expect(skill?.description).toBe(packageData.skill.description);
      expect(skill?.source).toBe(AgentSkillSourceEnum.personal);
    });

    it('should throw error when importing duplicate name', async () => {
      const packageData = {
        skill: {
          name: 'Duplicate Import',
          description: 'A skill',
          category: [],
          config: {}
        }
      };

      const mockZipBuffer = Buffer.from('mock zip content');

      // First import
      await importSkill(packageData, testTeamId, testTmbId, testUserId, mockZipBuffer);

      // Second import should fail
      await expect(
        importSkill(packageData, testTeamId, testTmbId, testUserId, mockZipBuffer)
      ).rejects.toThrow('skillNameExists');
    });
  });

  // ==================== Parse SKILL.md ====================
  describe('parseSkillMarkdown', () => {
    it('should parse YAML frontmatter correctly', () => {
      const markdown = `---
name: web-search
description: Search the web
metadata:
  author: test
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
        author: 'test',
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

  // ==================== Extract Skill from Markdown ====================
  describe('extractSkillFromMarkdown', () => {
    it('should extract skill with minimal required fields', () => {
      const markdown = `---
name: test-skill
description: A test skill
---

# Test Skill`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.skill).toBeDefined();
      expect(result.skill.name).toBe('test-skill');
      expect(result.skill.description).toBe('A test skill');
      expect(result.skill.category).toEqual(['other']); // default
      expect(result.skill.config).toEqual({});
    });

    it('should extract skill with metadata category', () => {
      const markdown = `---
name: web-search
description: Search the web
metadata:
  category: search,tool
---

# Web Search`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.skill.category).toEqual(['search', 'tool']);
    });

    it('should extract skill with license and compatibility', () => {
      const markdown = `---
name: test-skill
description: A test skill
license: MIT
compatibility: Requires Python 3.8+
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.skill.config.license).toBe('MIT');
      expect(result.skill.config.compatibility).toBe('Requires Python 3.8+');
    });

    it('should extract metadata fields to config', () => {
      const markdown = `---
name: test-skill
description: A test skill
metadata:
  author: test-user
  version: "1.0.0"
  apiUrl: https://example.com
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.skill.config.author).toBe('test-user');
      expect(result.skill.config.version).toBe('1.0.0');
      expect(result.skill.config.apiUrl).toBe('https://example.com');
    });

    it('should return error when name is missing', () => {
      const markdown = `---
description: A test skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Frontmatter field "name" is required');
      expect(result.skill).toBeNull();
    });

    it('should return error when description is missing', () => {
      const markdown = `---
name: test-skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Frontmatter field "description" is required');
      expect(result.skill).toBeNull();
    });

    it('should return error for invalid name format - uppercase', () => {
      const markdown = `---
name: Test-Skill
description: A test skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Name must contain only lowercase letters');
      expect(result.skill).toBeNull();
    });

    it('should return error for invalid name format - starts with hyphen', () => {
      const markdown = `---
name: -test-skill
description: A test skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Name must contain only lowercase letters');
      expect(result.skill).toBeNull();
    });

    it('should return error for invalid name format - consecutive hyphens', () => {
      const markdown = `---
name: test--skill
description: A test skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Name must contain only lowercase letters');
      expect(result.skill).toBeNull();
    });

    it('should return error for name too long', () => {
      const markdown = `---
name: ${'a'.repeat(51)}
description: A test skill
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toContain('Name must be less than 50 characters');
    });

    it('should truncate description if too long', () => {
      const markdown = `---
name: test-skill
description: ${'a'.repeat(600)}
---

# Test`;

      const result = extractSkillFromMarkdown(markdown);

      expect(result.error).toBeUndefined();
      expect(result.skill.description.length).toBe(500); // truncated
    });
  });
});

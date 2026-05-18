import { describe, it, expect } from 'vitest';
import {
  isSandboxExpiredError,
  fetchSkillsMetaForPrompt
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import {
  allSandboxTools,
  SandboxToolIds
} from '@fastgpt/global/core/workflow/node/agent/skillTools';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { JSZip } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import { Types } from '@fastgpt/service/common/mongo';

describe('isSandboxExpiredError', () => {
  it('should return true for "not found" error', () => {
    const error = new Error('Sandbox not found');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "not exist" error', () => {
    const error = new Error('Container does not exist');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "connection" error', () => {
    const error = new Error('Connection timeout');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "sandbox_not_found" error', () => {
    const error = new Error('sandbox_not_found: instance expired');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "ECONNREFUSED" error', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return true for "ECONNRESET" error', () => {
    const error = new Error('read ECONNRESET');
    expect(isSandboxExpiredError(error)).toBe(true);
  });

  it('should return false for unrelated error', () => {
    const error = new Error('Permission denied');
    expect(isSandboxExpiredError(error)).toBe(false);
  });

  it('should return false for non-Error types', () => {
    expect(isSandboxExpiredError('string error')).toBe(false);
    expect(isSandboxExpiredError(null)).toBe(false);
    expect(isSandboxExpiredError(undefined)).toBe(false);
    expect(isSandboxExpiredError({ message: 'not found' })).toBe(false);
    expect(isSandboxExpiredError(123)).toBe(false);
  });

  it('should be case insensitive', () => {
    const error = new Error('SANDBOX NOT FOUND');
    expect(isSandboxExpiredError(error)).toBe(true);
  });
});

describe('fetchSkillsMetaForPrompt', () => {
  it('injects every recursive skill.md from every selected outer skill', async () => {
    const teamId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();

    const makePackage = async (
      entries: Array<{ path: string; name: string; description: string }>
    ) => {
      const zip = new JSZip();
      for (const entry of entries) {
        zip.file(
          entry.path,
          `---
name: ${entry.name}
description: ${entry.description}
---

# ${entry.name}`
        );
      }
      return zip.generateAsync({ type: 'nodebuffer' });
    };

    const [skill1, skill2] = await MongoAgentSkills.create([
      {
        name: 'Skill1',
        description: '',
        author: 'test',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      },
      {
        name: 'Skill2',
        description: '',
        author: 'test',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      }
    ]);

    const [skill1Package, skill2Package] = await Promise.all([
      makePackage([
        { path: 'skill1/skill.md', name: 'alpha', description: 'Alpha skill' },
        { path: 'skill2/1/skill.md', name: 'beta', description: 'Beta skill' },
        { path: 'skill2/2/skill.md', name: 'gamma', description: 'Gamma skill' }
      ]),
      makePackage([
        { path: 'skill1/skill.md', name: 'delta', description: 'Delta skill' },
        { path: 'skill2/1/skill.md', name: 'epsilon', description: 'Epsilon skill' },
        { path: 'skill2/2/skill.md', name: 'zeta', description: 'Zeta skill' }
      ])
    ]);

    const [skill1Storage, skill2Storage] = await Promise.all([
      uploadSkillPackage({
        teamId,
        skillId: String(skill1._id),
        version: 0,
        zipBuffer: skill1Package
      }),
      uploadSkillPackage({
        teamId,
        skillId: String(skill2._id),
        version: 0,
        zipBuffer: skill2Package
      })
    ]);

    await Promise.all([
      MongoAgentSkills.updateOne({ _id: skill1._id }, { currentStorage: skill1Storage }),
      MongoAgentSkills.updateOne({ _id: skill2._id }, { currentStorage: skill2Storage })
    ]);

    const result = await fetchSkillsMetaForPrompt(
      [String(skill1._id), String(skill2._id)],
      teamId,
      '/workspace'
    );

    expect(result).toHaveLength(6);
    expect(result.map((item) => item.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta'
    ]);
    expect(result.map((item) => item.skillMdPath)).toEqual([
      '/workspace/Skill1/skill1/skill.md',
      '/workspace/Skill1/skill2/1/skill.md',
      '/workspace/Skill1/skill2/2/skill.md',
      '/workspace/Skill2/skill1/skill.md',
      '/workspace/Skill2/skill2/1/skill.md',
      '/workspace/Skill2/skill2/2/skill.md'
    ]);
  });
});

describe('sandbox skills tool protocol', () => {
  it('should expose the current sandbox tool set without the removed read file tool', () => {
    const toolNames = allSandboxTools.map((tool) => tool.function.name);

    expect(toolNames).toEqual([
      SandboxToolIds.writeFile,
      SandboxToolIds.editFile,
      SandboxToolIds.execute,
      SandboxToolIds.search,
      SandboxToolIds.fetchUserFile
    ]);
    expect(toolNames).not.toContain('sandbox_read_file');
  });
});

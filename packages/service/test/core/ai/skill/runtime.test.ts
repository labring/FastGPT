import { describe, it, expect, vi } from 'vitest';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox
} from '@fastgpt/service/core/ai/skill/runtime';
import { buildAgentSkillsPrompt } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/userContext';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SEARCH_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_TOOLS,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { uploadSkillPackage, JSZip } from '@fastgpt/service/core/ai/skill/package';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { Types } from '@fastgpt/service/common/mongo';

const makePackage = async (entries: Array<{ path: string; name: string; description: string }>) => {
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

describe('getAgentSkillInfos', () => {
  it('injects every recursive skill.md from every selected outer skill', async () => {
    const teamId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();

    const [skill1, skill2] = await MongoAgentSkills.create([
      {
        name: 'Skill',
        description: '',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      },
      {
        name: 'Skill',
        description: '',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      }
    ]);
    const skill1VersionId = new Types.ObjectId();
    const skill2VersionId = new Types.ObjectId();
    const skill1TargetDir = `/workspace/skills/Skill-${String(skill1._id)}-v${skill1VersionId}`;
    const skill2TargetDir = `/workspace/skills/Skill-${String(skill2._id)}-v${skill2VersionId}`;

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
        packageObjectId: 'skill1-v0',
        zipBuffer: skill1Package
      }),
      uploadSkillPackage({
        teamId,
        skillId: String(skill2._id),
        packageObjectId: 'skill2-v0',
        zipBuffer: skill2Package
      })
    ]);

    await MongoAgentSkillsVersion.create([
      {
        _id: skill1VersionId,
        skillId: skill1._id,
        tmbId,
        storageKey: skill1Storage.key
      },
      {
        _id: skill2VersionId,
        skillId: skill2._id,
        tmbId,
        storageKey: skill2Storage.key
      }
    ]);
    await Promise.all([
      MongoAgentSkills.updateOne(
        { _id: skill1._id },
        { $set: { currentVersionId: skill1VersionId } }
      ),
      MongoAgentSkills.updateOne(
        { _id: skill2._id },
        { $set: { currentVersionId: skill2VersionId } }
      )
    ]);

    const contentByPath = new Map([
      [
        `${skill1TargetDir}/skill1/skill.md`,
        `---
name: alpha
description: Alpha skill
---`
      ],
      [
        `${skill1TargetDir}/skill2/1/skill.md`,
        `---
name: beta
description: Beta skill
---`
      ],
      [
        `${skill1TargetDir}/skill2/2/skill.md`,
        `---
name: gamma
description: Gamma skill
---`
      ],
      [
        `${skill2TargetDir}/skill1/skill.md`,
        `---
name: delta
description: Delta skill
---`
      ],
      [
        `${skill2TargetDir}/skill2/1/skill.md`,
        `---
name: epsilon
description: Epsilon skill
---`
      ],
      [
        `${skill2TargetDir}/skill2/2/skill.md`,
        `---
name: zeta
description: Zeta skill
---`
      ]
    ]);
    const skillMdPaths = Array.from(contentByPath.keys());
    let activeExtracts = 0;
    let maxActiveExtracts = 0;
    let releaseExtracts = () => {};
    const releaseExtractsPromise = new Promise<void>((resolve) => {
      releaseExtracts = resolve;
    });
    const sandbox = {
      writeFiles: vi.fn(async () => undefined),
      execute: vi.fn(async (command: string) => {
        if (command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          return {
            exitCode: 0,
            stdout: `${skillMdPaths.join('\n')}\n`,
            stderr: ''
          };
        }

        if (!command.includes('unzip -o')) {
          throw new Error(`Unexpected command: ${command}`);
        }

        activeExtracts++;
        maxActiveExtracts = Math.max(maxActiveExtracts, activeExtracts);
        const releaseFallback = setTimeout(releaseExtracts, 20);
        if (activeExtracts === 2) {
          clearTimeout(releaseFallback);
          releaseExtracts();
        }
        await releaseExtractsPromise;
        clearTimeout(releaseFallback);
        activeExtracts--;

        return {
          exitCode: 0,
          stdout: '',
          stderr: ''
        };
      }),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: contentByPath.get(path) || ''
        }))
      )
    };

    const result = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill1._id), String(skill2._id)],
      teamId,
      workDirectory: '/workspace'
    });

    expect(sandbox.writeFiles).toHaveBeenCalledTimes(2);
    expect(maxActiveExtracts).toBe(2);
    expect(skill1TargetDir).not.toBe(skill2TargetDir);
    expect(sandbox.execute).toHaveBeenCalledWith(
      `mkdir -p '${skill1TargetDir}' && unzip -o '/workspace/package_${String(
        skill1._id
      )}.zip' -d '${skill1TargetDir}' && rm '/workspace/package_${String(skill1._id)}.zip'`
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      `mkdir -p '${skill2TargetDir}' && unzip -o '/workspace/package_${String(
        skill2._id
      )}.zip' -d '${skill2TargetDir}' && rm '/workspace/package_${String(skill2._id)}.zip'`
    );
    const findSkillCommand = sandbox.execute.mock.calls
      .map(([command]) => command)
      .find((command) => command.includes('-iname "SKILL.md"'));
    expect(findSkillCommand).toContain(`'${skill1TargetDir}'`);
    expect(findSkillCommand).toContain(`'${skill2TargetDir}'`);
    expect(findSkillCommand).not.toBe(`find '/workspace' -iname "SKILL.md" 2>/dev/null`);
    expect(result).toHaveLength(6);
    expect(result.map((item) => item.name)).toEqual(
      expect.arrayContaining(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'])
    );
    expect(result.map((item) => item.skillMdPath)).toEqual(
      expect.arrayContaining([
        `${skill1TargetDir}/skill1/skill.md`,
        `${skill1TargetDir}/skill2/1/skill.md`,
        `${skill1TargetDir}/skill2/2/skill.md`,
        `${skill2TargetDir}/skill1/skill.md`,
        `${skill2TargetDir}/skill2/1/skill.md`,
        `${skill2TargetDir}/skill2/2/skill.md`
      ])
    );
  });

  it('resets persisted skill directories and injects every selected current version', async () => {
    const teamId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();

    const [existingSkill, missingSkill] = await MongoAgentSkills.create([
      {
        name: 'Existing',
        description: '',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      },
      {
        name: 'Missing',
        description: '',
        teamId,
        tmbId,
        source: AgentSkillSourceEnum.personal
      }
    ]);
    const existingSkillVersionId = new Types.ObjectId();
    const missingSkillVersionId = new Types.ObjectId();
    const existingSkillTargetDir = `/workspace/skills/Existing-${String(
      existingSkill._id
    )}-v${existingSkillVersionId}`;
    const missingSkillTargetDir = `/workspace/skills/Missing-${String(
      missingSkill._id
    )}-v${missingSkillVersionId}`;

    const [existingSkillPackage, missingSkillPackage] = await Promise.all([
      makePackage([{ path: 'skill.md', name: 'existing', description: 'Existing skill' }]),
      makePackage([{ path: 'skill.md', name: 'missing', description: 'Missing skill' }])
    ]);
    const [existingSkillStorage, missingSkillStorage] = await Promise.all([
      uploadSkillPackage({
        teamId,
        skillId: String(existingSkill._id),
        packageObjectId: 'existing-v0',
        zipBuffer: existingSkillPackage
      }),
      uploadSkillPackage({
        teamId,
        skillId: String(missingSkill._id),
        packageObjectId: 'missing-v0',
        zipBuffer: missingSkillPackage
      })
    ]);

    await MongoAgentSkillsVersion.create([
      {
        _id: existingSkillVersionId,
        skillId: existingSkill._id,
        tmbId,
        storageKey: existingSkillStorage.key
      },
      {
        _id: missingSkillVersionId,
        skillId: missingSkill._id,
        tmbId,
        storageKey: missingSkillStorage.key
      }
    ]);
    await Promise.all([
      MongoAgentSkills.updateOne(
        { _id: existingSkill._id },
        { $set: { currentVersionId: existingSkillVersionId } }
      ),
      MongoAgentSkills.updateOne(
        { _id: missingSkill._id },
        { $set: { currentVersionId: missingSkillVersionId } }
      )
    ]);

    const contentByPath = new Map([
      [
        `${existingSkillTargetDir}/skill.md`,
        `---
name: existing
description: Existing skill
---`
      ],
      [
        `${missingSkillTargetDir}/skill.md`,
        `---
name: missing
description: Missing skill
---`
      ]
    ]);
    const sandbox = {
      writeFiles: vi.fn(async () => undefined),
      execute: vi.fn(async (command: string) => {
        if (command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          return {
            exitCode: 0,
            stdout: `${Array.from(contentByPath.keys()).join('\n')}\n`,
            stderr: ''
          };
        }

        if (
          [
            `mkdir -p '${existingSkillTargetDir}' && unzip -o '/workspace/package_${String(
              existingSkill._id
            )}.zip' -d '${existingSkillTargetDir}' && rm '/workspace/package_${String(
              existingSkill._id
            )}.zip'`,
            `mkdir -p '${missingSkillTargetDir}' && unzip -o '/workspace/package_${String(
              missingSkill._id
            )}.zip' -d '${missingSkillTargetDir}' && rm '/workspace/package_${String(
              missingSkill._id
            )}.zip'`
          ].includes(command)
        ) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: contentByPath.get(path) || ''
        }))
      )
    };

    const result = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(existingSkill._id), String(missingSkill._id)],
      teamId,
      workDirectory: '/workspace'
    });

    expect(sandbox.writeFiles).toHaveBeenCalledTimes(2);
    expect(sandbox.writeFiles.mock.calls.map(([entries]) => entries[0].path)).toEqual(
      expect.arrayContaining([
        `/workspace/package_${String(existingSkill._id)}.zip`,
        `/workspace/package_${String(missingSkill._id)}.zip`
      ])
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'"
    );
    const findSkillCommand = sandbox.execute.mock.calls
      .map(([command]) => command)
      .find((command) => command.includes('-iname "SKILL.md"'));
    expect(findSkillCommand).toContain(`'${existingSkillTargetDir}'`);
    expect(findSkillCommand).toContain(`'${missingSkillTargetDir}'`);
    expect(result.map((item) => item.name)).toEqual(
      expect.arrayContaining(['existing', 'missing'])
    );
  });

  it('uses the version pointed to by skill.currentVersionId', async () => {
    const teamId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();

    const skill = await MongoAgentSkills.create({
      name: 'MultiActive',
      description: '',
      teamId,
      tmbId,
      source: AgentSkillSourceEnum.personal
    });
    const oldVersionId = new Types.ObjectId();
    const latestVersionId = new Types.ObjectId();
    const [oldPackage, latestPackage] = await Promise.all([
      makePackage([{ path: 'skill.md', name: 'old', description: 'Old current skill' }]),
      makePackage([{ path: 'skill.md', name: 'latest', description: 'Latest current skill' }])
    ]);
    const [oldStorage, latestStorage] = await Promise.all([
      uploadSkillPackage({
        teamId,
        skillId: String(skill._id),
        packageObjectId: 'old-current-version',
        zipBuffer: oldPackage
      }),
      uploadSkillPackage({
        teamId,
        skillId: String(skill._id),
        packageObjectId: 'latest-current-version',
        zipBuffer: latestPackage
      })
    ]);

    await MongoAgentSkillsVersion.create([
      {
        _id: oldVersionId,
        skillId: skill._id,
        tmbId,
        storageKey: oldStorage.key
      },
      {
        _id: latestVersionId,
        skillId: skill._id,
        tmbId,
        storageKey: latestStorage.key
      }
    ]);
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { $set: { currentVersionId: latestVersionId } }
    );

    const oldTargetDir = `/workspace/skills/MultiActive-${String(skill._id)}-v${oldVersionId}`;
    const latestTargetDir = `/workspace/skills/MultiActive-${String(
      skill._id
    )}-v${latestVersionId}`;
    const latestSkillMdPath = `${latestTargetDir}/skill.md`;
    const sandbox = {
      writeFiles: vi.fn(async () => undefined),
      execute: vi.fn(async (command: string) => {
        if (command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          return {
            exitCode: 0,
            stdout: `${latestSkillMdPath}\n`,
            stderr: ''
          };
        }

        if (
          command ===
          `mkdir -p '${latestTargetDir}' && unzip -o '/workspace/package_${String(
            skill._id
          )}.zip' -d '${latestTargetDir}' && rm '/workspace/package_${String(skill._id)}.zip'`
        ) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn(async () => [
        {
          path: latestSkillMdPath,
          content: `---
name: latest
description: Latest current skill
---`
        }
      ])
    };

    const result = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      workDirectory: '/workspace'
    });

    expect(sandbox.execute).toHaveBeenCalledWith(
      `mkdir -p '${latestTargetDir}' && unzip -o '/workspace/package_${String(
        skill._id
      )}.zip' -d '${latestTargetDir}' && rm '/workspace/package_${String(skill._id)}.zip'`
    );
    expect(sandbox.execute).not.toHaveBeenCalledWith(expect.stringContaining(oldTargetDir));
    expect(result).toEqual([
      {
        id: latestSkillMdPath,
        name: 'latest',
        description: 'Latest current skill',
        directory: latestTargetDir,
        skillMdPath: latestSkillMdPath
      }
    ]);
  });

  it('throws when a missing skill package fails to extract', async () => {
    const teamId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();

    const skill = await MongoAgentSkills.create({
      name: 'Broken',
      description: '',
      teamId,
      tmbId,
      source: AgentSkillSourceEnum.personal
    });
    const skillPackage = await makePackage([
      { path: 'skill.md', name: 'broken', description: 'Broken skill' }
    ]);
    const skillStorage = await uploadSkillPackage({
      teamId,
      skillId: String(skill._id),
      packageObjectId: 'broken-v0',
      zipBuffer: skillPackage
    });

    const skillVersionId = new Types.ObjectId();
    await MongoAgentSkillsVersion.create({
      _id: skillVersionId,
      skillId: skill._id,
      tmbId,
      storageKey: skillStorage.key
    });
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { $set: { currentVersionId: skillVersionId } }
    );

    const skillTargetDir = `/workspace/skills/Broken-${String(skill._id)}-v${skillVersionId}`;
    const sandbox = {
      writeFiles: vi.fn(async () => undefined),
      execute: vi.fn(async (command: string) => {
        if (command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (
          command ===
          `mkdir -p '${skillTargetDir}' && unzip -o '/workspace/package_${String(
            skill._id
          )}.zip' -d '${skillTargetDir}' && rm '/workspace/package_${String(skill._id)}.zip'`
        ) {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'bad zip'
          };
        }

        if (
          command === `rm -rf '${skillTargetDir}' '/workspace/package_${String(skill._id)}.zip'`
        ) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    await expect(
      injectAgentSkillFilesToSandbox({
        sandbox: sandbox as any,
        skillIds: [String(skill._id)],
        teamId,
        workDirectory: '/workspace'
      })
    ).rejects.toThrow('Failed to extract skill package "Broken": bad zip');
    expect(sandbox.execute).toHaveBeenCalledWith(
      `rm -rf '${skillTargetDir}' '/workspace/package_${String(skill._id)}.zip'`
    );
    expect(sandbox.readFiles).not.toHaveBeenCalled();
  });
});

describe('sandbox and skill module separation', () => {
  it('keeps sandbox tools global instead of skill-owned tools', () => {
    const toolNames = SANDBOX_TOOLS.map((tool) => tool.function.name);

    expect(toolNames).toEqual([
      SANDBOX_SHELL_TOOL_NAME,
      SANDBOX_READ_FILE_TOOL_NAME,
      SANDBOX_WRITE_FILE_TOOL_NAME,
      SANDBOX_EDIT_FILE_TOOL_NAME,
      SANDBOX_SEARCH_TOOL_NAME,
      SANDBOX_GET_FILE_URL_TOOL_NAME
    ]);
    expect(toolNames).not.toContain('sandbox_execute');
    expect(toolNames).not.toContain('sandbox_fetch_user_file');
  });

  it('keeps sandbox input files outside skill prompt', () => {
    const skillPrompt = buildAgentSkillsPrompt([
      {
        id: 'skill_1',
        name: 'Skill',
        description: 'Skill description',
        skillMdPath: '/workspace/Skill/SKILL.md',
        directory: '/workspace/Skill'
      }
    ]);

    expect(skillPrompt).toContain('## 技能');
    expect(skillPrompt).toContain('<path>/workspace/Skill/SKILL.md</path>');
    expect(skillPrompt).not.toContain('<location>');
    expect(skillPrompt).toContain('<directory>/workspace/Skill</directory>');
    expect(skillPrompt).not.toContain('<sandbox_input_files>');
    expect(skillPrompt).not.toContain('sandbox_fetch_user_file');
  });

  it('uses the injected sandbox instance to load sandbox-workspace skill infos', async () => {
    const sandbox = {
      execute: vi.fn(async () => ({
        exitCode: 0,
        stdout: '/workspace/Report/SKILL.md\n',
        stderr: ''
      })),
      readFiles: vi.fn(async () => [
        {
          path: '/workspace/Report/SKILL.md',
          content: `---
name: Report
description: Write reports
---

# Report`
        }
      ])
    };
    const skillInfos = await getAgentSkillInfos({
      workDirectory: '/workspace',
      sandbox: sandbox as any
    });

    expect(sandbox.execute).toHaveBeenCalledWith(`find '/workspace' -iname "SKILL.md" 2>/dev/null`);
    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/Report/SKILL.md']);
    expect(skillInfos).toEqual([
      {
        id: '/workspace/Report/SKILL.md',
        name: 'Report',
        description: 'Write reports',
        directory: '/workspace/Report',
        skillMdPath: '/workspace/Report/SKILL.md'
      }
    ]);
  });
});

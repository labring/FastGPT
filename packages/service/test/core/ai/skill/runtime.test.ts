import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
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
import { uploadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

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

const makeWriteResults = (entries: Array<{ path: string; data: unknown }>) =>
  entries.map((entry) => ({
    path: entry.path,
    bytesWritten: entry.data instanceof Buffer ? entry.data.length : 0,
    error: null
  }));

const LIST_VERSION_DIRS_COMMAND =
  "find '/workspace/projects' -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null";
const WORKSPACE_SKILL_INFO_FIND_COMMAND = `find '/workspace' \\( -name 'node_modules' -o -name '.venv' -o -name 'venv' \\) -prune -o -iname "SKILL.md" -print0 2>/dev/null`;

describe('getAgentSkillInfos', () => {
  it('scans every recursive skill.md from every selected version directory', async () => {
    const user = await getUser(`runtime-skill-scan-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

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
    const skill1TargetDir = `/workspace/projects/${String(skill1VersionId)}`;
    const skill2TargetDir = `/workspace/projects/${String(skill2VersionId)}`;

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
    const sandbox = {
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('unzip')) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          const matchedPaths = skillMdPaths.filter((path) => {
            return command.includes(path.split('/')[3]);
          });
          return {
            exitCode: 0,
            stdout: `${matchedPaths.join('\0')}\0`,
            stderr: ''
          };
        }

        if (command.startsWith('mkdir -p ')) return { exitCode: 0, stdout: '', stderr: '' };

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: contentByPath.get(path) || ''
        }))
      )
    };

    const deployedVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill1._id), String(skill2._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    const result = await getAgentSkillInfos({
      sandbox: sandbox as any,
      skillDirectories: deployedVersions.map(({ targetDir }) => targetDir)
    });

    expect(sandbox.writeFiles).toHaveBeenCalledTimes(1);
    expect(skill1TargetDir).not.toBe(skill2TargetDir);
    const writtenFilePaths = sandbox.writeFiles.mock.calls[0][0].map(
      (entry: { path: string }) => entry.path
    );
    expect(writtenFilePaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/workspace/projects/.tmp-${String(skill1VersionId)}`),
        expect.stringContaining(`/workspace/projects/.tmp-${String(skill2VersionId)}`)
      ])
    );
    expect(writtenFilePaths.every((path: string) => path.endsWith('/package.zip'))).toBe(true);
    const unzipCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter((command) => command.includes('unzip'));
    expect(unzipCommands).toHaveLength(1);
    expect(unzipCommands[0]).toContain(`mv '/workspace/projects/.tmp-${String(skill1VersionId)}`);
    expect(unzipCommands[0]).toContain(`'${skill1TargetDir}'`);
    expect(unzipCommands[0]).toContain(`mv '/workspace/projects/.tmp-${String(skill2VersionId)}`);
    expect(unzipCommands[0]).toContain(`'${skill2TargetDir}'`);
    expect(unzipCommands[0]).not.toContain('unzip -tq package.zip >/dev/null');
    expect(unzipCommands[0]).toContain('unzip -Z -t package.zip');
    expect(unzipCommands[0]).toContain('unzip -Z1 package.zip');
    expect(unzipCommands[0]).toContain('unzip -o -q package.zip');

    const findSkillCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter((command) => command.includes('-iname "SKILL.md"'));
    expect(findSkillCommands.some((c) => c.includes(`'${skill1TargetDir}'`))).toBe(true);
    expect(findSkillCommands.some((c) => c.includes(`'${skill2TargetDir}'`))).toBe(true);
    expect(findSkillCommands).not.toContain(WORKSPACE_SKILL_INFO_FIND_COMMAND);
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

  it('deploys every selected current version into version directories', async () => {
    const user = await getUser(`runtime-skill-deploy-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

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
    const existingSkillTargetDir = `/workspace/projects/${String(existingSkillVersionId)}`;
    const missingSkillTargetDir = `/workspace/projects/${String(missingSkillVersionId)}`;

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
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('unzip')) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          const allPaths = Array.from(contentByPath.keys());
          const matchedPaths = allPaths.filter((path) => {
            return command.includes(path.split('/')[3]);
          });
          return {
            exitCode: 0,
            stdout: `${matchedPaths.join('\0')}\0`,
            stderr: ''
          };
        }

        if (command.startsWith('mkdir -p ')) return { exitCode: 0, stdout: '', stderr: '' };

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: contentByPath.get(path) || ''
        }))
      )
    };

    const deployedVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(existingSkill._id), String(missingSkill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    const result = await getAgentSkillInfos({
      sandbox: sandbox as any,
      skillDirectories: deployedVersions.map(({ targetDir }) => targetDir)
    });

    expect(sandbox.writeFiles).toHaveBeenCalledTimes(1);
    const writtenFilePaths = sandbox.writeFiles.mock.calls[0][0].map(
      (entry: { path: string }) => entry.path
    );
    expect(writtenFilePaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/workspace/projects/.tmp-${String(existingSkillVersionId)}`),
        expect.stringContaining(`/workspace/projects/.tmp-${String(missingSkillVersionId)}`)
      ])
    );
    expect(sandbox.execute).toHaveBeenCalledWith("mkdir -p '/workspace/projects'");
    const findSkillCommands = sandbox.execute.mock.calls
      .map(([command]) => command)
      .filter((command) => command.includes('-iname "SKILL.md"'));
    expect(findSkillCommands.some((c) => c.includes(`'${existingSkillTargetDir}'`))).toBe(true);
    expect(findSkillCommands.some((c) => c.includes(`'${missingSkillTargetDir}'`))).toBe(true);
    expect(result.map((item) => item.name)).toEqual(
      expect.arrayContaining(['existing', 'missing'])
    );
  });

  it('uses the version pointed to by skill.currentVersionId', async () => {
    const user = await getUser(`runtime-skill-current-version-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

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

    const oldTargetDir = `/workspace/projects/${String(oldVersionId)}`;
    const latestTargetDir = `/workspace/projects/${String(latestVersionId)}`;
    const latestSkillMdPath = `${latestTargetDir}/skill.md`;
    const sandbox = {
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('unzip')) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.includes('-iname "SKILL.md"')) {
          return {
            exitCode: 0,
            stdout: `${latestSkillMdPath}\0`,
            stderr: ''
          };
        }

        if (command.startsWith('mkdir -p ')) return { exitCode: 0, stdout: '', stderr: '' };

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

    const deployedVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    const result = await getAgentSkillInfos({
      sandbox: sandbox as any,
      skillDirectories: deployedVersions.map(({ targetDir }) => targetDir)
    });

    expect(
      sandbox.writeFiles.mock.calls[0][0].map((entry: { path: string }) => entry.path)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/workspace/projects/.tmp-${String(latestVersionId)}`)
      ])
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

  it('filters unauthorized runtime skills instead of injecting them', async () => {
    const owner = await getUser(`runtime-skill-owner-${getNanoid(6)}`);
    const runner = await getUser(`runtime-skill-runner-${getNanoid(6)}`, owner.teamId);

    const [readableSkill, protectedSkill] = await MongoAgentSkills.create([
      {
        name: 'Readable',
        description: '',
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        source: AgentSkillSourceEnum.personal
      },
      {
        name: 'Protected',
        description: '',
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        source: AgentSkillSourceEnum.personal
      }
    ]);
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: String(readableSkill._id),
      tmbId: runner.tmbId,
      permission: ReadPermissionVal
    });

    const readableVersionId = new Types.ObjectId();
    const protectedVersionId = new Types.ObjectId();
    const [readablePackage, protectedPackage] = await Promise.all([
      makePackage([{ path: 'skill.md', name: 'readable', description: 'Readable skill' }]),
      makePackage([{ path: 'skill.md', name: 'protected', description: 'Protected skill' }])
    ]);
    const [readableStorage, protectedStorage] = await Promise.all([
      uploadSkillPackage({
        teamId: owner.teamId,
        skillId: String(readableSkill._id),
        packageObjectId: 'runtime-readable-version',
        zipBuffer: readablePackage
      }),
      uploadSkillPackage({
        teamId: owner.teamId,
        skillId: String(protectedSkill._id),
        packageObjectId: 'runtime-protected-version',
        zipBuffer: protectedPackage
      })
    ]);
    await MongoAgentSkillsVersion.create([
      {
        _id: readableVersionId,
        skillId: readableSkill._id,
        tmbId: owner.tmbId,
        storageKey: readableStorage.key
      },
      {
        _id: protectedVersionId,
        skillId: protectedSkill._id,
        tmbId: owner.tmbId,
        storageKey: protectedStorage.key
      }
    ]);
    await Promise.all([
      MongoAgentSkills.updateOne(
        { _id: readableSkill._id },
        { $set: { currentVersionId: readableVersionId } }
      ),
      MongoAgentSkills.updateOne(
        { _id: protectedSkill._id },
        { $set: { currentVersionId: protectedVersionId } }
      )
    ]);

    const readableTargetDir = `/workspace/projects/${String(readableVersionId)}`;
    const protectedTargetDir = `/workspace/projects/${String(protectedVersionId)}`;
    const sandbox = {
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command === LIST_VERSION_DIRS_COMMAND) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('unzip')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.startsWith('mkdir -p ')) return { exitCode: 0, stdout: '', stderr: '' };

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    const deployedVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(readableSkill._id), String(protectedSkill._id)],
      teamId: owner.teamId,
      tmbId: runner.tmbId,
      workDirectory: '/workspace'
    });

    expect(deployedVersions).toEqual([
      {
        versionId: String(readableVersionId),
        targetDir: readableTargetDir
      }
    ]);
    expect(sandbox.writeFiles).toHaveBeenCalledTimes(1);
    const writtenFilePaths = sandbox.writeFiles.mock.calls[0][0].map(
      (entry: { path: string }) => entry.path
    );
    expect(writtenFilePaths).toEqual([
      expect.stringContaining(`/workspace/projects/.tmp-${String(readableVersionId)}`)
    ]);
    expect(writtenFilePaths.join('\n')).not.toContain(String(protectedVersionId));
    expect(sandbox.execute).not.toHaveBeenCalledWith(expect.stringContaining(protectedTargetDir));
  });

  it('skips existing current version directories and removes unselected version directories', async () => {
    const user = await getUser(`runtime-skill-cached-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

    const skill = await MongoAgentSkills.create({
      name: 'CachedVersion',
      description: '',
      teamId,
      tmbId,
      source: AgentSkillSourceEnum.personal
    });
    const currentVersionId = new Types.ObjectId();
    const staleVersionId = new Types.ObjectId();
    const skillPackage = await makePackage([
      { path: 'skill.md', name: 'cached', description: 'Cached current skill' }
    ]);
    const storage = await uploadSkillPackage({
      teamId,
      skillId: String(skill._id),
      packageObjectId: 'cached-current-version',
      zipBuffer: skillPackage
    });

    await MongoAgentSkillsVersion.create({
      _id: currentVersionId,
      skillId: skill._id,
      tmbId,
      storageKey: storage.key
    });
    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      { $set: { currentVersionId: currentVersionId } }
    );

    const currentTargetDir = `/workspace/projects/${String(currentVersionId)}`;
    const staleTargetDir = `/workspace/projects/${String(staleVersionId)}`;
    const userProjectDir = `/workspace/projects/demo`;
    const sandbox = {
      writeFiles: vi.fn(),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: `${currentTargetDir}\0${staleTargetDir}\0${userProjectDir}\0`,
            stderr: ''
          };
        }

        if (command === `rm -rf '${staleTargetDir}'`) {
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

    const deployedVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });

    expect(deployedVersions).toEqual([
      {
        versionId: String(currentVersionId),
        targetDir: currentTargetDir
      }
    ]);
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledWith(`rm -rf '${staleTargetDir}'`);
    expect(sandbox.execute).not.toHaveBeenCalledWith(`rm -rf '${userProjectDir}'`);
  });

  it('throws when a skill package file fails to write', async () => {
    const user = await getUser(`runtime-skill-write-fail-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

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

    const skillTargetDir = `/workspace/projects/${String(skillVersionId)}`;
    const writeError = new Error('write failed');
    const sandbox = {
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: 0,
          error: writeError
        }))
      ),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: '',
            stderr: ''
          };
        }

        if (command.startsWith('mkdir -p ')) return { exitCode: 0, stdout: '', stderr: '' };

        if (command.startsWith("rm -rf '/workspace/projects/.tmp-")) {
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
        tmbId,
        workDirectory: '/workspace'
      })
    ).rejects.toThrow('Failed to write skill ZIP packages: write failed');
    expect(sandbox.execute).not.toHaveBeenCalledWith(`rm -rf '${skillTargetDir}'`);
    expect(sandbox.readFiles).not.toHaveBeenCalled();
  });

  it('returns empty array when skills are invalid/deleted or missing current version', async () => {
    const user = await getUser(`runtime-skill-empty-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

    const sandbox = {
      writeFiles: vi.fn(),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command === LIST_VERSION_DIRS_COMMAND) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    // 1. Test when skill is invalid or deleted (skills.length === 0)
    const resultNoSkills = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [new Types.ObjectId().toHexString()],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    expect(resultNoSkills).toEqual([]);

    // 2. Test when skill exists but has no current version (deployableSkills.length === 0)
    const skill = await MongoAgentSkills.create({
      name: 'NoVersionSkill',
      description: '',
      teamId,
      tmbId,
      source: AgentSkillSourceEnum.personal
    });
    const resultNoVersion = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    expect(resultNoVersion).toEqual([]);
  });

  it('cleans stale version directories when no skills are selected', async () => {
    const tmbId = new Types.ObjectId().toHexString();
    const sandbox = {
      writeFiles: vi.fn(),
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace/projects'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command === LIST_VERSION_DIRS_COMMAND) {
          return {
            exitCode: 0,
            stdout: '/workspace/projects/0123456789abcdef01234567\0/workspace/projects/demo\0',
            stderr: ''
          };
        }
        if (command === "rm -rf '/workspace/projects/0123456789abcdef01234567'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    const result = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [],
      teamId: new Types.ObjectId().toHexString(),
      tmbId,
      workDirectory: '/workspace'
    });

    expect(result).toEqual([]);
    expect(sandbox.execute).toHaveBeenCalledWith(
      "rm -rf '/workspace/projects/0123456789abcdef01234567'"
    );
    expect(sandbox.execute).not.toHaveBeenCalledWith("rm -rf '/workspace/projects/demo'");
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
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
        stdout: '/workspace/Report/SKILL.md\0',
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

    expect(sandbox.execute).toHaveBeenCalledWith(WORKSPACE_SKILL_INFO_FIND_COMMAND);
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

import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox
} from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/core';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { uploadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { loadWorkflowResourceContext } from '@fastgpt/service/core/workflow/utils/resource';
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

const createSkillFilesystemMocks = (directoryPaths: string[] = []) => ({
  createDirectories: vi.fn(async (_paths: string[]) => undefined),
  listDirectory: vi.fn(async () =>
    directoryPaths.map((path) => ({
      name: path.split('/').pop() ?? path,
      path,
      isDirectory: true,
      isFile: false
    }))
  ),
  deleteDirectories: vi.fn(async (_paths: string[]) => undefined),
  deleteFiles: vi.fn(async (paths: string[]) =>
    paths.map((path) => ({ path, success: true, error: null }))
  ),
  moveFiles: vi.fn(async (_entries: Array<{ source: string; destination: string }>) => undefined)
});

const WORKSPACE_SKILL_INFO_FIND_COMMAND = `find '/workspace' \\( -name 'node_modules' -o -name '.venv' -o -name 'venv' \\) -prune -o -iname "SKILL.md" -print0 2>/dev/null`;

describe('runtime skill deploy and scan integration', () => {
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
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
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

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({
          path,
          content: contentByPath.get(path) || ''
        }))
      )
    };

    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill1._id), String(skill2._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    const result = await getAgentSkillInfos({
      sandbox: sandbox as any,
      skillDirectories: deployedSkillVersions.map(({ targetDir }) => targetDir)
    });

    expect(sandbox.writeFiles).toHaveBeenCalledTimes(2);
    expect(skill1TargetDir).not.toBe(skill2TargetDir);
    const writeEntries = sandbox.writeFiles.mock.calls.flatMap(([entries]) => entries);
    const writtenFilePaths = writeEntries.map((entry: { path: string }) => entry.path);
    expect(
      writeEntries.every((entry: { data: unknown }) => entry.data instanceof ReadableStream)
    ).toBe(true);
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
    for (const zipPath of writtenFilePaths) {
      expect(unzipCommands[0]).toContain(`unzip -Z -t '${zipPath}'`);
      expect(unzipCommands[0]).toContain(`unzip -Z1 '${zipPath}'`);
      expect(unzipCommands[0]).toContain(`unzip -o -q '${zipPath}'`);
    }
    expect(sandbox.deleteFiles).toHaveBeenCalledWith(writtenFilePaths);
    const [moveEntries] = sandbox.moveFiles.mock.calls[0];
    expect(moveEntries).toHaveLength(2);
    expect(moveEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.stringContaining(`/workspace/projects/.tmp-${String(skill1VersionId)}`),
          destination: skill1TargetDir
        }),
        expect.objectContaining({
          source: expect.stringContaining(`/workspace/projects/.tmp-${String(skill2VersionId)}`),
          destination: skill2TargetDir
        })
      ])
    );

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
});

describe('injectAgentSkillFilesToSandbox', () => {
  it('stops when deployed skill directory enumeration fails', async () => {
    const sandbox = {
      ...createSkillFilesystemMocks(),
      listDirectory: vi.fn().mockRejectedValue(new Error('list failed')),
      writeFiles: vi.fn(),
      execute: vi.fn(),
      readFiles: vi.fn()
    };

    await expect(
      injectAgentSkillFilesToSandbox({
        sandbox: sandbox as any,
        skillIds: [],
        teamId: new Types.ObjectId().toHexString(),
        tmbId: new Types.ObjectId().toHexString(),
        workDirectory: '/workspace'
      })
    ).rejects.toThrow('list failed');

    expect(sandbox.createDirectories).toHaveBeenCalledWith(['/workspace/projects']);
    expect(sandbox.deleteDirectories).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.execute).not.toHaveBeenCalled();
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
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
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

    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });
    const result = await getAgentSkillInfos({
      sandbox: sandbox as any,
      skillDirectories: deployedSkillVersions.map(({ targetDir }) => targetDir)
    });

    expect(
      sandbox.writeFiles.mock.calls[0][0].map((entry: { path: string }) => entry.path)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/workspace/projects/.tmp-${String(latestVersionId)}`)
      ])
    );
    expect(sandbox.moveFiles).toHaveBeenCalledWith([
      expect.objectContaining({ destination: latestTargetDir })
    ]);
    const movedDestinations = sandbox.moveFiles.mock.calls.flatMap(([entries]) =>
      entries.map(({ destination }) => destination)
    );
    expect(movedDestinations).not.toContain(oldTargetDir);
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

  it('injects a global system skill from the resource snapshot', async () => {
    const user = await getUser(`runtime-system-skill-${getNanoid(6)}`);
    const { teamId, tmbId } = user;
    const skill = await MongoAgentSkills.create({
      name: 'GlobalSystemSkill',
      description: '',
      teamId: null,
      tmbId: null,
      source: AgentSkillSourceEnum.system
    });
    const versionId = new Types.ObjectId();
    const skillPackage = await makePackage([
      { path: 'skill.md', name: 'system', description: 'Global system skill' }
    ]);
    const storage = await uploadSkillPackage({
      teamId,
      skillId: String(skill._id),
      packageObjectId: 'runtime-system-version',
      zipBuffer: skillPackage
    });
    await MongoAgentSkillsVersion.create({
      _id: versionId,
      skillId: skill._id,
      tmbId,
      storageKey: storage.key
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { $set: { currentVersionId: versionId } });

    const targetDir = `/workspace/projects/${String(versionId)}`;
    const sandbox = {
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command.includes('unzip')) return { exitCode: 0, stdout: '', stderr: '' };
        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    const resourceContext = await loadWorkflowResourceContext({
      resources: [{ type: 'skill', id: String(skill._id) }],
      teamId
    });
    const staticVersions = await runWithContext({ mcpClientMemory: {}, resourceContext }, () =>
      injectAgentSkillFilesToSandbox({
        sandbox: sandbox as any,
        skillIds: [String(skill._id)],
        teamId,
        tmbId,
        workDirectory: '/workspace'
      })
    );

    expect(staticVersions).toEqual([
      {
        skillId: String(skill._id),
        name: 'GlobalSystemSkill',
        description: '',
        avatar: undefined,
        versionId: String(versionId),
        targetDir
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
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        makeWriteResults(entries)
      ),
      execute: vi.fn(async (command: string) => {
        if (command.includes('unzip')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }

        throw new Error(`Unexpected command: ${command}`);
      }),
      readFiles: vi.fn()
    };

    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(readableSkill._id), String(protectedSkill._id)],
      teamId: owner.teamId,
      tmbId: runner.tmbId,
      workDirectory: '/workspace'
    });

    expect(deployedSkillVersions).toEqual([
      {
        skillId: String(readableSkill._id),
        name: 'Readable',
        description: '',
        avatar: undefined,
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
    expect(sandbox.moveFiles).toHaveBeenCalledWith([
      expect.objectContaining({ destination: readableTargetDir })
    ]);
    const movedDestinations = sandbox.moveFiles.mock.calls.flatMap(([entries]) =>
      entries.map(({ destination }) => destination)
    );
    expect(movedDestinations).not.toContain(protectedTargetDir);
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
      ...createSkillFilesystemMocks([currentTargetDir, staleTargetDir, userProjectDir]),
      writeFiles: vi.fn(),
      execute: vi.fn(),
      readFiles: vi.fn()
    };

    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: sandbox as any,
      skillIds: [String(skill._id)],
      teamId,
      tmbId,
      workDirectory: '/workspace'
    });

    expect(deployedSkillVersions).toEqual([
      {
        skillId: String(skill._id),
        name: 'CachedVersion',
        description: '',
        avatar: undefined,
        versionId: String(currentVersionId),
        targetDir: currentTargetDir
      }
    ]);
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.deleteDirectories).toHaveBeenCalledWith([staleTargetDir]);
    expect(sandbox.deleteDirectories).not.toHaveBeenCalledWith([userProjectDir]);
    expect(sandbox.execute).not.toHaveBeenCalled();
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

    const writeError = new Error('write failed');
    const sandbox = {
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: 0,
          error: writeError
        }))
      ),
      execute: vi.fn(),
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
    ).rejects.toThrow('Failed to write skill ZIP package: write failed');
    expect(sandbox.deleteDirectories).toHaveBeenCalledWith([
      expect.stringContaining(`/workspace/projects/.tmp-${String(skillVersionId)}`)
    ]);
    expect(sandbox.execute).not.toHaveBeenCalled();
    expect(sandbox.readFiles).not.toHaveBeenCalled();
  });

  it('returns empty array when skills are invalid/deleted or missing current version', async () => {
    const user = await getUser(`runtime-skill-empty-${getNanoid(6)}`);
    const { teamId, tmbId } = user;

    const sandbox = {
      ...createSkillFilesystemMocks(),
      writeFiles: vi.fn(),
      execute: vi.fn(),
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
    const staleTargetDir = '/workspace/projects/0123456789abcdef01234567';
    const userProjectDir = '/workspace/projects/demo';
    const sandbox = {
      ...createSkillFilesystemMocks([staleTargetDir, userProjectDir]),
      writeFiles: vi.fn(),
      execute: vi.fn(),
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
    expect(sandbox.deleteDirectories).toHaveBeenCalledWith([staleTargetDir]);
    expect(sandbox.deleteDirectories).not.toHaveBeenCalledWith([userProjectDir]);
    expect(sandbox.execute).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });
});

describe('getAgentSkillInfos', () => {
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

  it('attaches parent skill app metadata by deployed version directory', async () => {
    const sandbox = {
      execute: vi.fn(async () => ({
        exitCode: 0,
        stdout: '/workspace/.skills/version_1/fetch-webpage/SKILL.md\0',
        stderr: ''
      })),
      readFiles: vi.fn(async () => [
        {
          path: '/workspace/.skills/version_1/fetch-webpage/SKILL.md',
          content: `---
name: fetch-webpage
description: Read webpages
---

# Fetch webpage`
        }
      ])
    };

    const skillInfos = await getAgentSkillInfos({
      skillDirectories: ['/workspace/.skills/version_1'],
      deployedSkillVersions: [
        {
          skillId: 'skill_app_1',
          name: 'Web Research App',
          description: 'Contains webpage fetch and summary skills',
          versionId: 'version_1',
          targetDir: '/workspace/.skills/version_1'
        }
      ],
      sandbox: sandbox as any
    });

    expect(skillInfos).toEqual([
      {
        id: '/workspace/.skills/version_1/fetch-webpage/SKILL.md',
        appId: 'skill_app_1',
        appName: 'Web Research App',
        appDescription: 'Contains webpage fetch and summary skills',
        name: 'fetch-webpage',
        description: 'Read webpages',
        directory: '/workspace/.skills/version_1/fetch-webpage',
        skillMdPath: '/workspace/.skills/version_1/fetch-webpage/SKILL.md'
      }
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  deleteWorkspaceArchive: vi.fn(),
  startSandboxRuntimeUpgradeArchive: vi.fn(),
  markSandboxRuntimeUpgradeArchiveFailed: vi.fn(),
  SandboxArchiveStateError: class SandboxArchiveStateError extends Error {
    constructor(
      readonly state: string,
      message = `Sandbox is ${state}`
    ) {
      super(message);
      this.name = 'SandboxArchiveStateError';
    }
  },
  prepareSandboxRuntimeMirrors: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/version/schema', () => ({
  MongoAgentSkillsVersion: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/package', () => ({
  downloadSkillPackage: vi.fn(),
  DEFAULT_GITIGNORE_CONTENT: '.venv/\nnode_modules/\n',
  validateDeployableSkillWorkspacePackage: vi.fn(async () => ({
    valid: true,
    files: []
  })),
  validateZipStructure: vi.fn(async () => ({
    valid: true,
    hasSkillMd: true,
    files: []
  }))
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_SKILL_MAX_SIZE: 1
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/edit/config', () => ({
  EDIT_DEBUG_SANDBOX_CHAT_ID: 'edit-debug',
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  }),
  validateSandboxConfig: vi.fn(),
  getSandboxAdapterConfig: vi.fn((opts) => ({
    providerConfig: {
      provider: opts.provider || 'test-provider'
    },
    createConfig: {
      image: { repository: 'test-image' },
      ...opts.createConfig
    }
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  buildBaseSandboxRuntimeEnv: vi.fn(() => ({
    FASTGPT_WORKDIR: '/workspace'
  })),
  getSandboxRuntimeProfile: () => ({
    provider: 'opensandbox',
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills',
    entrypoint: 'sleep infinity',
    buildConfig: vi.fn()
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/lifecycle', () => ({
  connectReadySandboxByInstance: vi.fn(),
  connectToSandbox: mocks.connectToSandbox,
  disconnectSandbox: mocks.disconnectSandbox,
  getReadySandboxInfo: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxAdapter: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  deleteSandboxResource: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => ({
  startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive,
  SandboxArchiveStateError: mocks.SandboxArchiveStateError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/mirrors', () => ({
  prepareSandboxRuntimeMirrors: mocks.prepareSandboxRuntimeMirrors
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    deleteWorkspaceArchive: mocks.deleteWorkspaceArchive
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  countRunningSandboxInstancesByType: vi.fn(),
  deleteSandboxResourceRecord: vi.fn(),
  deleteSandboxInstanceRecord: vi.fn(),
  findSandboxInstanceArchiveState: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxResourcesBySourceChatTypeExcludeProvider: vi.fn(),
  markArchivedSandboxRuntimeImageCurrent: vi.fn(),
  markSandboxRuntimeUpgradeArchiveFailed: mocks.markSandboxRuntimeUpgradeArchiveFailed,
  migrateArchivedSandboxInstanceRecord: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        AGENT: 'agent'
      }
    }
  }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: vi.fn()
}));

import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import {
  downloadSkillPackage,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure
} from '@fastgpt/service/core/ai/skill/package';
import {
  getSkillEditRuntimeContext,
  getSkillEditRuntimeStatus,
  initSkillEditRuntimeSandbox,
  triggerSkillEditRuntimeUpgrade,
  packageSkillInSandbox
} from '@fastgpt/service/core/ai/skill/edit/sandbox';
import {
  connectReadySandboxByInstance,
  getReadySandboxInfo
} from '@fastgpt/service/core/ai/sandbox/provider/lifecycle';
import { buildSandboxAdapter } from '@fastgpt/service/core/ai/sandbox/provider/adapter';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/service/resource';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxResourceRecord,
  deleteSandboxInstanceRecord,
  findSandboxInstanceArchiveState,
  findSandboxInstanceBySandboxId,
  findSandboxResourcesBySourceChatTypeExcludeProvider,
  markArchivedSandboxRuntimeImageCurrent,
  migrateArchivedSandboxInstanceRecord,
  updateSandboxInstanceRecordBySandboxId
} from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText } from '@fastgpt/global/common/error/utils';

type MockReadFileResult = {
  path: string;
  content: Uint8Array | string;
  error: Error | null;
}[];

const createSandbox = ({ readFilesResult }: { readFilesResult: MockReadFileResult }) => {
  const sandbox = {
    execute: vi.fn(async (command: string, _options?: unknown) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/sandbox', stderr: '' };
      }
      if (command.startsWith('[ -d ')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.includes('find . ') && command.includes('-prune')) {
        return { exitCode: 0, stdout: '12', stderr: '' };
      }
      if (command.startsWith('cd ')) {
        return { exitCode: 0, stdout: 'zip ok', stderr: '' };
      }
      if (command.startsWith('rm -f ')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    }),
    readFiles: vi.fn(async (paths: string[]) => {
      if (paths.some((path) => path.startsWith('/home/sandbox/.fastgpt/tmp/'))) {
        return readFilesResult;
      }
      return [];
    })
  };

  return sandbox;
};

const initEditDebugSandbox = async ({
  skillId,
  teamId,
  tmbId,
  onProgress
}: {
  skillId: string;
  teamId: string;
  tmbId: string;
  onProgress?: Parameters<typeof initSkillEditRuntimeSandbox>[0]['onProgress'];
}) => {
  const context = await getSkillEditRuntimeContext({
    skillId,
    teamId,
    tmbId
  });

  return initSkillEditRuntimeSandbox({
    context,
    onProgress
  });
};

describe('packageSkillInSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the packaged zip content and removes the temporary zip', async () => {
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    const zipReadCall = vi
      .mocked(sandbox.readFiles)
      .mock.calls.find(([paths]) => paths.some((path) => path.endsWith('.zip')));
    expect(zipReadCall?.[0][0]).toMatch(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip$/);
    expect(sandbox.execute).toHaveBeenCalledWith("mkdir -p '/home/sandbox/.fastgpt/tmp'");
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /^cd '\/workspace' && zip -r -y '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip' \./
      )
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(sandbox.execute).not.toHaveBeenCalledWith("rm -f '/workspace/package.zip'");
    expect(validateDeployableSkillWorkspacePackage).toHaveBeenCalledWith(Buffer.from(zipContent), {
      maxUncompressedBytes: 1024 * 1024
    });
    expect(validateZipStructure).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('uses basic zip validation when packaging for export', async () => {
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' })
    ).resolves.toEqual(Buffer.from(zipContent));

    expect(validateZipStructure).toHaveBeenCalledWith(Buffer.from(zipContent), {
      maxUncompressedBytes: 1024 * 1024
    });
    expect(validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('throws when the final package zip exceeds the skill package limit', async () => {
    const zipContent = new Uint8Array(1024 * 1024 + 1);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Skill package size'
    );

    expect(validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(validateZipStructure).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('throws when the package zip read reports an error', async () => {
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: new Uint8Array(),
          error: new Error('read failed')
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Failed to read package file in sandbox: read failed'
    );

    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('applies default ignore rules and root workspace gitignore when packaging', async () => {
    const gitignoreContent = 'dist/\n';
    const zipContent = new Uint8Array([9, 8, 7]);
    const sandbox = {
      execute: vi.fn(async (command: string, _options?: unknown) => {
        if (command === 'printf "%s" "$HOME"') {
          return { exitCode: 0, stdout: '/home/sandbox', stderr: '' };
        }
        if (command.startsWith('[ -d ')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('find . ') && command.includes('-prune')) {
          return { exitCode: 0, stdout: '100', stderr: '' };
        }
        if (command.startsWith('cd ')) {
          return { exitCode: 0, stdout: 'zip ok', stderr: '' };
        }
        if (command.startsWith('rm -f ')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      readFiles: vi.fn(async (paths: string[]) => {
        if (paths.includes('/workspace/.gitignore')) {
          return [{ path: '/workspace/.gitignore', content: gitignoreContent, error: null }];
        }
        if (paths.some((path) => path.startsWith('/home/sandbox/.fastgpt/tmp/'))) {
          return [
            {
              path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
              content: zipContent,
              error: null
            }
          ];
        }
        return [];
      })
    };
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/.gitignore']);
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringContaining("-name '.venv' -o -name 'node_modules'")
    );
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '.venv/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '*/.venv/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x 'dist/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '*/dist/*'"));
  });
});

describe('skill edit runtime status split APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkTeamSandboxPermission).mockResolvedValue(undefined);
    vi.mocked(deleteSandboxResourceRecord).mockResolvedValue({} as any);
    vi.mocked(markArchivedSandboxRuntimeImageCurrent).mockResolvedValue({ matchedCount: 1 });
    mocks.markSandboxRuntimeUpgradeArchiveFailed.mockResolvedValue(undefined);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValue(null);
  });

  const setupReadySkillVersion = (skillId = 'skill-1') => {
    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
  };

  it('reports upgradeRequired using service runtime image instead of client input', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgradeRequired',
      canUpgrade: true,
      shouldPoll: false,
      shouldInit: false
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
  });

  it('treats failed runtime archive as upgradeRequired on page entry', async () => {
    const skillId = 'skill-1';
    const failedInstance = {
      _id: 'failed-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'failed',
          error: 'archive failed'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(failedInstance as any);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgradeRequired',
      archiveState: 'failed',
      canUpgrade: true,
      shouldPoll: false,
      shouldInit: false,
      lastError: 'archive failed'
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
  });

  it('starts background archive when runtime upgrade is triggered', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValueOnce({
      success: true,
      archivingDoc: {
        ...existingInstance,
        metadata: {
          ...existingInstance.metadata,
          archive: { state: 'archiving' }
        }
      }
    });

    await expect(
      triggerSkillEditRuntimeUpgrade({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgrading',
      archiveState: 'archiving',
      canUpgrade: false,
      shouldPoll: true,
      shouldInit: false
    });

    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(existingInstance, {
      ensureZipInSandbox: true
    });
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('rejects duplicate upgrade trigger while runtime archive is active', async () => {
    const skillId = 'skill-1';
    const archivingInstance = {
      _id: 'archiving-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archiving',
          startedAt: new Date()
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivingInstance as any);

    await expect(
      triggerSkillEditRuntimeUpgrade({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(SandboxErrEnum.runtimeUpgradeInProgress);

    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('reports stale-provider archiving record as upgrading', async () => {
    const skillId = 'skill-1';
    const staleArchivingInstance = {
      _id: 'stale-archiving-instance',
      provider: 'old-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archiving',
          startedAt: new Date()
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      staleArchivingInstance as any
    ]);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgrading',
      archiveState: 'archiving',
      canUpgrade: false,
      shouldPoll: true,
      shouldInit: false
    });

    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('uses the same archive-state lookup as init when edit-debug type lookup misses', async () => {
    const skillId = 'skill-1';
    const restoringInstance = {
      _id: 'restoring-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'restoring'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(restoringInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgrading',
      archiveState: 'restoring',
      canUpgrade: false,
      shouldPoll: true,
      shouldInit: false
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('treats restoring target-runtime instance as ready instead of runtime upgrade', async () => {
    const skillId = 'skill-1';
    const restoringInstance = {
      _id: 'restoring-current-runtime-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'test-image' },
        archive: {
          state: 'restoring'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(restoringInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'readyToInit',
      archiveState: 'restoring',
      canUpgrade: false,
      shouldPoll: false,
      shouldInit: true
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('requires confirmation for archived outdated-runtime instance before init restore', async () => {
    const skillId = 'skill-1';
    const archivedInstance = {
      _id: 'archived-outdated-runtime-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archived'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgradeRequired',
      archiveState: 'archived',
      canUpgrade: true,
      shouldPoll: false,
      shouldInit: false
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('allows stale-provider archived runtime instance to init for migration restore', async () => {
    const skillId = 'skill-1';
    const archivedInstance = {
      _id: 'stale-provider-archived-instance',
      provider: 'old-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archived'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      archivedInstance as any
    ]);

    await expect(
      getSkillEditRuntimeStatus({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'readyToInit',
      archiveState: 'archived',
      canUpgrade: false,
      shouldPoll: false,
      shouldInit: true
    });

    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('marks archived outdated-runtime image current and returns ready after upgrade confirmation', async () => {
    const skillId = 'skill-1';
    const archivedInstance = {
      _id: 'archived-outdated-runtime-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archived'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);

    await expect(
      triggerSkillEditRuntimeUpgrade({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'readyToInit',
      archiveState: 'archived',
      canUpgrade: false,
      shouldPoll: false,
      shouldInit: true
    });

    expect(markArchivedSandboxRuntimeImageCurrent).toHaveBeenCalledWith(archivedInstance);
    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('keeps archived outdated-runtime upgradeRequired when image update is not matched', async () => {
    const skillId = 'skill-1';
    const archivedInstance = {
      _id: 'archived-outdated-runtime-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archived'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(markArchivedSandboxRuntimeImageCurrent).mockResolvedValueOnce({ matchedCount: 0 });

    await expect(
      triggerSkillEditRuntimeUpgrade({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgradeRequired',
      archiveState: 'archived',
      canUpgrade: true,
      shouldPoll: false,
      shouldInit: false
    });

    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('retries stale-provider failed runtime upgrade archive', async () => {
    const skillId = 'skill-1';
    const staleFailedInstance = {
      _id: 'stale-failed-instance',
      provider: 'old-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'failed',
          error: 'archive failed'
        },
        versionId: 'version-1'
      }
    };

    setupReadySkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      staleFailedInstance as any
    ]);
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValueOnce({
      success: true,
      archivingDoc: {
        ...staleFailedInstance,
        metadata: {
          ...staleFailedInstance.metadata,
          archive: { state: 'archiving' }
        }
      }
    });

    await expect(
      triggerSkillEditRuntimeUpgrade({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: 'upgrading',
      archiveState: 'archiving'
    });

    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(staleFailedInstance, {
      ensureZipInSandbox: true
    });
    expect(getSandboxClient).not.toHaveBeenCalled();
  });
});

describe('initSkillEditRuntimeSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkTeamSandboxPermission).mockResolvedValue(undefined);
    vi.mocked(markArchivedSandboxRuntimeImageCurrent).mockResolvedValue({ matchedCount: 1 });
    mocks.markSandboxRuntimeUpgradeArchiveFailed.mockResolvedValue(undefined);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValue(null);
    vi.mocked(buildSandboxAdapter).mockReturnValue({
      getInfo: vi.fn(async () => ({
        status: { state: 'Running' }
      }))
    } as any);
  });

  it('throws structured sandbox error when team has no sandbox permission', async () => {
    vi.mocked(checkTeamSandboxPermission).mockRejectedValueOnce(new Error('no permission'));

    const promise = initEditDebugSandbox({
      skillId: 'skill-1',
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    await expect(promise).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
    await expect(promise.catch((error) => getErrText(error))).resolves.toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
    );

    expect(MongoAgentSkills.findOne).not.toHaveBeenCalled();
  });

  it('uploads zip packages and decompresses inside the sandbox so Chinese skill directory names are preserved', async () => {
    const packageBuffer = Buffer.from('zip');
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (
          command === "mkdir -p '/workspace/skills'" ||
          command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'"
        ) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('unzip')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${command}` };
      }),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }))
      )
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(downloadSkillPackage).mockResolvedValueOnce(packageBuffer);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-1'
    } as any);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();

    expect(provider.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/skills/package.zip',
        data: packageBuffer
      }
    ]);
    expect(provider.execute).toHaveBeenCalledWith("mkdir -p '/workspace/skills'");
    expect(provider.execute).toHaveBeenCalledWith(expect.stringContaining('unzip'));
    expect(mocks.prepareSandboxRuntimeMirrors).toHaveBeenCalledWith({
      sandbox: provider
    });
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });

  it('restores current-provider archived edit-debug sandbox through runtime client instead of hot reuse', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      writeFiles: vi.fn()
    };
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-restored'
    } as any);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();

    expect(connectReadySandboxByInstance).not.toHaveBeenCalled();
    expect(deleteSandboxResource).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalled();
    expect(getSandboxClient).toHaveBeenCalledWith(
      {
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        sandboxId: `edit-debug-${skillId}`,
        userId: '',
        chatId: 'edit-debug'
      },
      expect.objectContaining({
        createConfig: expect.any(Object)
      })
    );
    expect(downloadSkillPackage).not.toHaveBeenCalled();
  });

  it('keeps restored archived edit-debug sandbox when startup fails after runtime restore', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(),
      writeFiles: vi.fn()
    };
    const deleteSandbox = vi.fn(async () => undefined);
    const readyError = new Error('prepare runtime image failed');
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: deleteSandbox
    } as any);
    vi.mocked(getReadySandboxInfo).mockRejectedValueOnce(readyError);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(readyError);

    expect(deleteSandbox).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(archivedInstance._id);
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });

  it('recreates missing edit-debug sandbox without inspecting or re-deploying an empty workspace', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      metadata: {
        image: { repository: 'test-image' },
        versionId: 'version-1'
      }
    };
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes("test -n \"$(find '/workspace'")) {
          return { exitCode: 1, stdout: '', stderr: 'workspace should not be inspected' };
        }
        if (command.includes('unzip')) {
          return { exitCode: 1, stdout: '', stderr: 'workspace should not be deployed' };
        }
        return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${command}` };
      }),
      writeFiles: vi.fn()
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(buildSandboxAdapter).mockReturnValueOnce({
      getInfo: vi.fn(async () => null)
    } as any);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-recreated'
    } as any);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();

    expect(connectReadySandboxByInstance).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(existingInstance._id);
    expect(getSandboxClient).toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(provider.execute).not.toHaveBeenCalledWith(expect.stringContaining('unzip'));
  });

  it('rejects when mismatched existing edit-debug sandbox cannot hot reload without cleanup or rebuild', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      metadata: {
        image: { repository: 'test-image' },
        versionId: 'old-version'
      }
    };
    const connectError = new Error('connect failed');

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(connectReadySandboxByInstance).mockRejectedValueOnce(connectError);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(connectError);

    expect(deleteSandboxResource).not.toHaveBeenCalledWith(existingInstance);
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(existingInstance._id);
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it('rejects edit-debug sandbox start without rebuilding from skill package when archived S3 package is missing', async () => {
    const skillId = 'skill-1';
    const noSuchKeyError = Object.assign(new Error('The specified key does not exist.'), {
      name: 'NoSuchKey',
      code: 'NoSuchKey'
    });
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockRejectedValueOnce(noSuchKeyError);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(noSuchKeyError);

    expect(getSandboxClient).toHaveBeenCalledTimes(1);
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(archivedInstance._id);
    expect(deleteSandboxResource).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getReadySandboxInfo).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it('drops non-archived stale-provider record locally before creating current-provider sandbox', async () => {
    const skillId = 'skill-1';
    const createError = new Error('stop after stale cleanup');
    const staleProviderInstance = {
      _id: 'stale-provider-instance',
      provider: 'sealosdevbox',
      sandboxId: `edit-debug-${skillId}`,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      type: 'editDebug',
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      staleProviderInstance as any
    ]);
    vi.mocked(getSandboxClient).mockRejectedValueOnce(createError);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(createError);

    expect(deleteSandboxResourceRecord).toHaveBeenCalledWith(staleProviderInstance);
    expect(deleteSandboxResource).not.toHaveBeenCalledWith(staleProviderInstance);
    expect(getSandboxClient).toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
  });

  it('migrates archived stale-provider edit-debug records before restoring with the new provider', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      writeFiles: vi.fn()
    };
    const archivedStaleInstance = {
      _id: 'archived-stale-provider-instance',
      provider: 'opensandbox',
      sandboxId: `edit-debug-${skillId}`,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      type: 'editDebug',
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      archivedStaleInstance as any
    ]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(migrateArchivedSandboxInstanceRecord).mockResolvedValueOnce({
      ...archivedStaleInstance,
      provider: 'test-provider'
    } as any);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'new-provider-doc'
    } as any);

    await expect(
      initEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();

    expect(migrateArchivedSandboxInstanceRecord).toHaveBeenCalledWith({
      source: archivedStaleInstance,
      provider: 'test-provider',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: '',
      chatId: 'edit-debug',
      type: 'edit-debug'
    });
    expect(deleteSandboxResource).not.toHaveBeenCalledWith(archivedStaleInstance);
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'test-provider',
        sandboxId: `edit-debug-${skillId}`,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'edit-debug'
      })
    );
  });
});

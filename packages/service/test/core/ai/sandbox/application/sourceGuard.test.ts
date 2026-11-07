import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  appExists: vi.fn(),
  appFindOne: vi.fn(),
  skillExists: vi.fn(),
  skillFindOne: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { exists: mocks.appExists, findOne: mocks.appFindOne }
}));
vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { exists: mocks.skillExists, findOne: mocks.skillFindOne }
}));

import {
  assertSandboxSourceActive,
  assertSandboxSourceDeleted,
  resolveSandboxSourceTeamId
} from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';

const docResult = (doc: unknown) => ({ lean: async () => doc });

describe('sandbox source guards', () => {
  beforeEach(() => {
    mocks.appExists.mockReset();
    mocks.appFindOne.mockReset();
    mocks.skillExists.mockReset();
    mocks.skillFindOne.mockReset();
  });

  it('uses deleteTime as the active and deleted source fence', async () => {
    mocks.appFindOne.mockReturnValueOnce(docResult({ teamId: 'team-1' }));
    mocks.skillFindOne.mockReturnValueOnce(docResult({ teamId: 'team-1' }));
    mocks.appExists.mockResolvedValueOnce({ _id: 'app-1' });

    await assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' });
    await assertSandboxSourceActive({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-1'
    });
    await assertSandboxSourceDeleted({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    expect(mocks.appFindOne).toHaveBeenCalledWith(
      { _id: 'app-1', deleteTime: null },
      { teamId: 1 }
    );
    expect(mocks.skillFindOne).toHaveBeenCalledWith(
      { _id: 'skill-1', deleteTime: null },
      { teamId: 1 }
    );
    expect(mocks.appExists).toHaveBeenCalledWith({
      _id: 'app-1',
      deleteTime: { $ne: null }
    });
  });

  it('resolves the team id from the same existing-source projection read', async () => {
    mocks.appFindOne.mockReturnValueOnce(docResult({ teamId: 'team-app' }));
    mocks.skillFindOne.mockReturnValueOnce(docResult({ teamId: 'team-skill' }));

    await expect(
      resolveSandboxSourceTeamId({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toBe('team-app');
    await expect(
      resolveSandboxSourceTeamId({ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: 'skill-1' })
    ).resolves.toBe('team-skill');
  });

  it('returns undefined when the source exists without a team id', async () => {
    mocks.appFindOne.mockReturnValue(docResult({}));

    await expect(
      resolveSandboxSourceTeamId({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toBeUndefined();
    await expect(
      assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toBeUndefined();
  });

  it('rejects sources outside the requested fence', async () => {
    mocks.appFindOne.mockReturnValueOnce(docResult(null));
    mocks.skillFindOne.mockReturnValueOnce(docResult(null));
    mocks.skillExists.mockResolvedValueOnce(null);

    await expect(
      assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'deleted-app' })
    ).rejects.toThrow('Sandbox source is missing or deleted');
    await expect(
      resolveSandboxSourceTeamId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'deleted-skill'
      })
    ).rejects.toThrow('Sandbox source is missing or deleted');
    await expect(
      assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'deleted-skill'
      })
    ).rejects.toThrow('Sandbox source is not marked for deletion');
  });
});

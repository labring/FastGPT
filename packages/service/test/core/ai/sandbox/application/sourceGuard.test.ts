import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({ appExists: vi.fn(), skillExists: vi.fn() }));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { exists: mocks.appExists }
}));
vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { exists: mocks.skillExists }
}));

import {
  assertSandboxSourceActive,
  assertSandboxSourceDeleted
} from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';

describe('assertSandboxSourceActive', () => {
  beforeEach(() => {
    mocks.appExists.mockReset();
    mocks.skillExists.mockReset();
  });

  it('accepts active App and Skill sources using deleteTime as the fence', async () => {
    mocks.appExists.mockResolvedValueOnce({ _id: 'app-1' });
    mocks.skillExists.mockResolvedValueOnce({ _id: 'skill-1' });

    await expect(
      assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toBeUndefined();
    await expect(
      assertSandboxSourceActive({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1'
      })
    ).resolves.toBeUndefined();

    expect(mocks.appExists).toHaveBeenCalledWith({ _id: 'app-1', deleteTime: null });
    expect(mocks.skillExists).toHaveBeenCalledWith({ _id: 'skill-1', deleteTime: null });
  });

  it('rejects missing or deleted App and Skill sources', async () => {
    mocks.appExists.mockResolvedValueOnce(null);
    mocks.skillExists.mockResolvedValueOnce(null);

    await expect(
      assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'deleted-app' })
    ).rejects.toThrow('Sandbox source is missing or deleted');
    await expect(
      assertSandboxSourceActive({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'deleted-skill'
      })
    ).rejects.toThrow('Sandbox source is missing or deleted');
  });

  it('allows destructive cleanup only after deleteTime is set', async () => {
    mocks.appExists.mockResolvedValueOnce({ _id: 'app-1' });
    mocks.skillExists.mockResolvedValueOnce(null);

    await expect(
      assertSandboxSourceDeleted({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).resolves.toBeUndefined();
    await expect(
      assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1'
      })
    ).rejects.toThrow('Sandbox source is not marked for deletion');

    expect(mocks.appExists).toHaveBeenCalledWith({
      _id: 'app-1',
      deleteTime: { $ne: null }
    });
  });
});

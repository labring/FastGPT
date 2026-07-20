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

describe('sandbox source guards', () => {
  beforeEach(() => {
    mocks.appExists.mockReset();
    mocks.skillExists.mockReset();
  });

  it('uses deleteTime as the active and deleted source fence', async () => {
    mocks.appExists.mockResolvedValueOnce({ _id: 'app-1' });
    mocks.skillExists.mockResolvedValueOnce({ _id: 'skill-1' });
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

    expect(mocks.appExists).toHaveBeenCalledWith({ _id: 'app-1', deleteTime: null });
    expect(mocks.skillExists).toHaveBeenCalledWith({ _id: 'skill-1', deleteTime: null });
    expect(mocks.appExists).toHaveBeenCalledWith({
      _id: 'app-1',
      deleteTime: { $ne: null }
    });
  });

  it('rejects sources outside the requested fence', async () => {
    mocks.appExists.mockResolvedValueOnce(null);
    mocks.skillExists.mockResolvedValueOnce(null);

    await expect(
      assertSandboxSourceActive({ sourceType: ChatSourceTypeEnum.app, sourceId: 'deleted-app' })
    ).rejects.toThrow('Sandbox source is missing or deleted');
    await expect(
      assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'deleted-skill'
      })
    ).rejects.toThrow('Sandbox source is not marked for deletion');
  });
});

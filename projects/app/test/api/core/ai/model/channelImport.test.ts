import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/publish/authChat', () => ({ authOutLink: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({ assertAuthModels: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/model/importFromChannel', () => ({
  previewImportFromChannel: mocks.preview,
  applyChangesFromChannel: mocks.apply
}));

import preview from '@/pages/api/core/ai/model/previewImportFromChannel';
import apply from '@/pages/api/core/ai/model/applyChanges';

describe('system channel import authorization', () => {
  const actor = { tmbId: 'member', teamId: 'team' };
  const query = { channelId: 1, channelType: 'system' as const };
  const body = { ...query, operations: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue({ items: [] });
    mocks.apply.mockResolvedValue({ results: [] });
  });

  it('rejects a non-root caller before reading or applying the import', async () => {
    mocks.authUserPer.mockResolvedValue({ ...actor, isRoot: false });
    await expect(
      preview({ query } as Parameters<typeof preview>[0], {} as Parameters<typeof preview>[1])
    ).rejects.toBe(ModelErrEnum.rootOnlyPermit);
    await expect(
      apply({ body } as Parameters<typeof apply>[0], {} as Parameters<typeof apply>[1])
    ).rejects.toBe(ModelErrEnum.rootOnlyPermit);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('allows a root caller and passes the authenticated identity to the service', async () => {
    mocks.authUserPer.mockResolvedValue({ ...actor, isRoot: true });
    await expect(
      preview({ query } as Parameters<typeof preview>[0], {} as Parameters<typeof preview>[1])
    ).resolves.toEqual({ items: [] });
    await expect(
      apply({ body } as Parameters<typeof apply>[0], {} as Parameters<typeof apply>[1])
    ).resolves.toEqual({ results: [] });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith({ channelId: 1, tmbId: actor.tmbId });
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ channelId: 1, operations: [], ...actor });
  });
});

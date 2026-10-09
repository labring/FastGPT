import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteAvatar: vi.fn(),
  removeAvatarTTL: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: vi.fn(() => ({
    deleteAvatar: mocks.deleteAvatar,
    removeAvatarTTL: mocks.removeAvatarTTL
  }))
}));

import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';

describe('syncSiteAvatarLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the old favicon when it is cleared and not referenced by navbar', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/old.png', navbarItems: [] },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('avatar/old.png');
    expect(mocks.removeAvatarTTL).not.toHaveBeenCalled();
  });

  it('never deletes the old favicon when replaced if a navbar item still references it', async () => {
    // 关键复现场景：favicon 从 shared.png 换为 new.png，但 shared.png 仍被 navbar 引用
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/shared.png', navbarItems: [{ avatar: 'avatar/shared.png' }] },
      next: { favicon: 'avatar/new.png', navbarItems: [{ avatar: 'avatar/shared.png' }] }
    });

    // shared.png 仍在引用中，绝不能被删除
    expect(mocks.deleteAvatar).not.toHaveBeenCalledWith('avatar/shared.png');
    // new.png 新加入引用，移除 TTL
    expect(mocks.removeAvatarTTL).toHaveBeenCalledWith('avatar/new.png');
  });

  it('deletes old favicon when replaced by new one if no navbar item references it', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/a.png', navbarItems: [] },
      next: { favicon: 'avatar/b.png', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('avatar/a.png');
    expect(mocks.removeAvatarTTL).toHaveBeenCalledWith('avatar/b.png');
  });

  it('keeps a removed navbar avatar when it is still used as the new favicon', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: '', navbarItems: [{ avatar: 'avatar/shared.png' }] },
      next: { favicon: 'avatar/shared.png', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
    // shared.png 已经处于引用集合中，不是新增引用，无需重复 removeAvatarTTL
    expect(mocks.removeAvatarTTL).not.toHaveBeenCalled();
  });

  it('deletes navbar avatars that are no longer referenced anywhere', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: '', navbarItems: [{ avatar: 'avatar/gone.png' }] },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('avatar/gone.png');
  });

  it('does nothing when references are identical', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/same.png', navbarItems: [{ avatar: 'avatar/nav.png' }] },
      next: { favicon: 'avatar/same.png', navbarItems: [{ avatar: 'avatar/nav.png' }] }
    });

    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
    expect(mocks.removeAvatarTTL).not.toHaveBeenCalled();
  });
});

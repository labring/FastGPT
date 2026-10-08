import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  removeAvatarTTL: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: vi.fn(() => ({
    refreshAvatar: mocks.refreshAvatar,
    deleteAvatar: mocks.deleteAvatar,
    removeAvatarTTL: mocks.removeAvatarTTL
  }))
}));

import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';

describe('syncSiteAvatarLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the old favicon when it is cleared', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/old.png', navbarItems: [] },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('avatar/old.png');
  });

  it('keeps the old favicon when a navbar item still references it after clearing', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/old.png', navbarItems: [] },
      next: { favicon: '', navbarItems: [{ avatar: 'avatar/old.png' }] }
    });

    expect(mocks.deleteAvatar).not.toHaveBeenCalledWith('avatar/old.png');
    // 新导航项引用的头像需移除 TTL 避免被回收
    expect(mocks.removeAvatarTTL).toHaveBeenCalledWith('avatar/old.png');
  });

  it('keeps a removed navbar avatar when it is still the new favicon', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: '', navbarItems: [{ avatar: 'avatar/shared.png' }] },
      next: { favicon: 'avatar/shared.png', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).not.toHaveBeenCalledWith('avatar/shared.png');
  });

  it('deletes navbar avatars that are no longer referenced anywhere', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: '', navbarItems: [{ avatar: 'avatar/gone.png' }] },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.deleteAvatar).toHaveBeenCalledWith('avatar/gone.png');
  });

  it('delegates favicon replacement to refreshAvatar', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: 'avatar/a.png', navbarItems: [] },
      next: { favicon: 'avatar/b.png', navbarItems: [] }
    });

    expect(mocks.refreshAvatar).toHaveBeenCalledWith('avatar/b.png', 'avatar/a.png');
    // 有值替换由 refreshAvatar 内部清理旧头像，不再重复删除
    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
  });
});

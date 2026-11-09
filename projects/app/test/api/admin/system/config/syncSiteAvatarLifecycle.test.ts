import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshAvatar: vi.fn(),
  scheduleAvatarDeletion: vi.fn(),
  getCurrentSiteAvatarKeys: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: () => ({
    refreshAvatar: mocks.refreshAvatar,
    scheduleAvatarDeletion: mocks.scheduleAvatarDeletion
  })
}));
vi.mock('@fastgpt/service/common/s3/siteAvatarReferences', () => ({
  getCurrentSiteAvatarKeys: mocks.getCurrentSiteAvatarKeys,
  toSiteAvatarKey: (avatar: string) => avatar.slice('/api/system/img/'.length)
}));

import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';

const oldAvatar = '/api/system/img/avatar/team/old.png';
const newAvatar = '/api/system/img/avatar/team/new.png';

describe('syncSiteAvatarLifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentSiteAvatarKeys.mockResolvedValue(new Set());
  });

  it('retains the new image before scheduling the replaced image for delayed deletion', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar },
      next: { favicon: newAvatar }
    });

    expect(mocks.refreshAvatar).toHaveBeenCalledWith(newAvatar);
    expect(mocks.scheduleAvatarDeletion).toHaveBeenCalledWith({ avatar: oldAvatar });
  });

  it('does not delete an old favicon still referenced by a navbar item', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar, navbarItems: [{ avatar: oldAvatar }] },
      next: { favicon: newAvatar, navbarItems: [{ avatar: oldAvatar }] }
    });

    expect(mocks.refreshAvatar).toHaveBeenCalledWith(newAvatar);
    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });

  it('schedules each unreferenced image once when the fields are cleared', async () => {
    await syncSiteAvatarLifecycle({
      previous: {
        favicon: oldAvatar,
        navbarItems: [{ avatar: oldAvatar }, { avatar: newAvatar }]
      },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.scheduleAvatarDeletion.mock.calls).toEqual([
      [{ avatar: oldAvatar }],
      [{ avatar: newAvatar }]
    ]);
  });

  it('does nothing when images remain referenced or move between fields', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar, navbarItems: [{ avatar: newAvatar }] },
      next: { favicon: newAvatar, navbarItems: [{ avatar: oldAvatar }] }
    });

    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });

  it('skips deletion when the latest site config has re-referenced the old image', async () => {
    mocks.getCurrentSiteAvatarKeys.mockResolvedValue(new Set(['avatar/team/old.png']));

    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar },
      next: { favicon: newAvatar }
    });

    expect(mocks.refreshAvatar).toHaveBeenCalledWith(newAvatar);
    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });

  it('keeps objects untouched when the latest site config cannot be read', async () => {
    mocks.getCurrentSiteAvatarKeys.mockResolvedValue(undefined);

    await expect(
      syncSiteAvatarLifecycle({
        previous: { favicon: oldAvatar },
        next: { favicon: newAvatar }
      })
    ).rejects.toThrow('Cannot verify current site avatars');

    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });

  it('ignores external URLs, built-in icons and other image sources', async () => {
    await syncSiteAvatarLifecycle({
      previous: {
        favicon: 'https://example.com/old.png',
        navbarItems: [{ avatar: '/icon/logo.svg' }]
      },
      next: { navbarItems: [{ avatar: '/api/system/img/chat/file.png' }, {}] }
    });

    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });

  it('leaves old images untouched if retaining the new image fails', async () => {
    mocks.refreshAvatar.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(
      syncSiteAvatarLifecycle({
        previous: { favicon: oldAvatar },
        next: { favicon: newAvatar }
      })
    ).rejects.toThrow('S3 unavailable');

    expect(mocks.refreshAvatar).toHaveBeenCalledWith(newAvatar);
    expect(mocks.scheduleAvatarDeletion).not.toHaveBeenCalled();
  });
});

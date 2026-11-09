import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refreshAvatar: vi.fn() }));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: () => ({ refreshAvatar: mocks.refreshAvatar })
}));

import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';

const oldAvatar = '/api/system/img/avatar/team/old.png';
const newAvatar = '/api/system/img/avatar/team/new.png';

describe('syncSiteAvatarLifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('retains the new image before deleting the replaced image through refreshAvatar', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar },
      next: { favicon: newAvatar }
    });

    expect(mocks.refreshAvatar.mock.calls).toEqual([[newAvatar], [null, oldAvatar]]);
  });

  it('retains an old favicon still referenced by a navbar item', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar, navbarItems: [{ avatar: oldAvatar }] },
      next: { favicon: newAvatar, navbarItems: [{ avatar: oldAvatar }] }
    });

    expect(mocks.refreshAvatar.mock.calls).toEqual([[newAvatar]]);
  });

  it('deletes each unreferenced image once when the fields are cleared', async () => {
    await syncSiteAvatarLifecycle({
      previous: {
        favicon: oldAvatar,
        navbarItems: [{ avatar: oldAvatar }, { avatar: newAvatar }]
      },
      next: { favicon: '', navbarItems: [] }
    });

    expect(mocks.refreshAvatar.mock.calls).toEqual([
      [null, oldAvatar],
      [null, newAvatar]
    ]);
  });

  it('does nothing when images remain referenced or move between fields', async () => {
    await syncSiteAvatarLifecycle({
      previous: { favicon: oldAvatar, navbarItems: [{ avatar: newAvatar }] },
      next: { favicon: newAvatar, navbarItems: [{ avatar: oldAvatar }] }
    });

    expect(mocks.refreshAvatar).not.toHaveBeenCalled();
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
  });

  it('leaves old images untouched if retaining the new image fails', async () => {
    mocks.refreshAvatar.mockRejectedValueOnce(new Error('S3 unavailable'));

    await expect(
      syncSiteAvatarLifecycle({
        previous: { favicon: oldAvatar },
        next: { favicon: newAvatar }
      })
    ).rejects.toThrow('S3 unavailable');

    expect(mocks.refreshAvatar.mock.calls).toEqual([[newAvatar]]);
  });
});

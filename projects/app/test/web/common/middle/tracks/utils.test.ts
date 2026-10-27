import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

const mocks = vi.hoisted(() => ({ post: vi.fn(), isPlus: true }));
vi.mock('@/web/common/api/request', () => ({ POST: mocks.post }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: { getState: () => ({ feConfigs: { isPlus: mocks.isPlus } }) }
}));

describe('webPushTrack.workflowBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPlus = true;
    mocks.post.mockResolvedValue(undefined);
  });

  it('uses the existing route with only appId/action and skips non-plus', async () => {
    await webPushTrack.workflowBuilder({ appId: 'app-1', action: 'apply_failed' });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/common/tracks/push', {
      event: 'workflowBuilder',
      data: { appId: 'app-1', action: 'apply_failed' }
    });
    mocks.isPlus = false;
    await webPushTrack.workflowBuilder({ appId: 'app-1', action: 'apply_click' });
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it('isolates rejected requests and synchronous failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.post.mockRejectedValueOnce(new Error('network failed'));
    await expect(
      webPushTrack.workflowBuilder({ appId: 'app-1', action: 'apply_click' })
    ).resolves.toBeUndefined();
    mocks.post.mockImplementationOnce(() => {
      throw new Error('request failed');
    });
    await expect(
      webPushTrack.workflowBuilder({ appId: 'app-1', action: 'apply_failed' })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

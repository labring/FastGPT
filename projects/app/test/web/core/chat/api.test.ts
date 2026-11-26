import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/web/common/api/request';
import { postOutLinkBrandTrack } from '@/web/core/chat/api';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { PushTrackBodySchema } from '@fastgpt/global/openapi/common/other/api';

vi.mock('@/web/common/api/request', () => ({
  DELETE: vi.fn(),
  GET: vi.fn(),
  POST: vi.fn(async () => undefined),
  PUT: vi.fn()
}));

describe('postOutLinkBrandTrack', () => {
  it('sends a valid outlink event to the unified tracking endpoint', async () => {
    const body = {
      authType: 'outLink' as const,
      event: TrackEnum.shareBrandExposure,
      eventId: 'page-exposure-id',
      outLinkAuthData: { shareId: 'share', outLinkUid: 'visitor' }
    };

    await postOutLinkBrandTrack(body);

    expect(POST).toHaveBeenCalledWith('/common/tracks/push', body, { timeout: 10000 });
    expect(PushTrackBodySchema.safeParse(body).success).toBe(true);
  });
});

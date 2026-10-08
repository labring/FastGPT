import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelStatusEnum } from '@fastgpt/global/core/ai/channel';

const mocks = vi.hoisted(() => ({
  PUT: vi.fn()
}));

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: mocks.PUT,
  DELETE: vi.fn()
}));

import { putChannel } from '@/web/core/ai/model/channel';

describe('putChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.PUT.mockResolvedValue(undefined);
  });

  it('omits an empty key so AI Proxy preserves the stored channel secret', async () => {
    await putChannel({
      id: 7,
      channelType: 'team',
      type: 1,
      name: 'channel',
      base_url: 'https://example.com/v1',
      models: ['model-a'],
      model_mapping: {},
      key: '',
      status: ChannelStatusEnum.ChannelStatusEnabled,
      priority: 1
    });

    expect(mocks.PUT).toHaveBeenCalledWith(
      '/core/ai/model/channel/update',
      expect.not.objectContaining({ key: expect.anything() })
    );
  });

  it('sends a replacement key when the user explicitly enters one', async () => {
    await putChannel({
      id: 7,
      channelType: 'system',
      type: 1,
      name: 'channel',
      models: ['model-a'],
      key: 'new-secret',
      status: ChannelStatusEnum.ChannelStatusEnabled
    });

    expect(mocks.PUT).toHaveBeenCalledWith(
      '/core/ai/model/channel/update',
      expect.objectContaining({ key: 'new-secret' })
    );
  });
});

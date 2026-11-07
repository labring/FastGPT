import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { aiProxyClient } from '@fastgpt/service/thirdProvider/aiproxy/client';
import handler from '@/pages/api/core/ai/model/config';

describe('system model configuration channel metadata ownership', () => {
  beforeEach(() => {
    global.ModelProviderRawCache = [];
    global.aiproxyChannelsCache = [
      {
        channelId: 1,
        name: { en: 'Protocol', 'zh-CN': '协议', 'zh-Hant': '協議' },
        avatar: 'protocol.svg'
      }
    ];
    vi.spyOn(aiProxyClient.system.channels, 'listAll').mockResolvedValue([
      {
        id: 7,
        type: 1,
        name: 'Saved Channel',
        models: ['gpt-5'],
        status: 1
      }
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('omits the type catalog while preserving protocol summaries used by model management', async () => {
    const auth = await getRootUser();
    const response = await Call(handler, { auth, query: { channelType: 'system' } });

    expect(response.code).toBe(200);
    expect(response.data).not.toHaveProperty('aiproxyChannels');
    expect(response.data.channels).toEqual([
      {
        id: 7,
        name: 'Saved Channel',
        status: 1,
        protocol: { name: global.aiproxyChannelsCache[0].name, avatar: 'protocol.svg' }
      }
    ]);
    expect(
      response.data.models.find((model: { model: string }) => model.model === 'gpt-5').channels
    ).toEqual(response.data.channels);
  });
});

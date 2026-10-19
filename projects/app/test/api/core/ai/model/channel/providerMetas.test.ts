import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { getUser } from '@test/datas/users';
import { aiProxyClient } from '@fastgpt/service/thirdProvider/aiproxy/client';
import { resetChannelCache } from '@fastgpt/service/core/ai/model/channel/cache';
import handler from '@/pages/api/core/ai/model/channel/providerMetas';

describe('GET /api/core/ai/model/channel/providerMetas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetChannelCache();
    global.aiproxyChannelsCache = [
      {
        channelId: 1,
        name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
    vi.spyOn(aiProxyClient, 'getTypeMetas').mockResolvedValue({
      1: { name: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', keyHelp: 'sk-*' }
    });
  });

  it('rejects anonymous callers before reading upstream metadata', async () => {
    const response = await Call(handler, { headers: {} });
    expect(response.code).toBe(500);
    expect(aiProxyClient.getTypeMetas).not.toHaveBeenCalled();
  });

  it('serves complete display and form metadata to an ordinary logged-in member', async () => {
    const owner = await getUser('metadata-owner');
    const auth = await getUser('metadata-member', owner.teamId);
    const response = await Call(handler, { auth, headers: {} });
    expect(response.code).toBe(200);
    expect(response.data).toEqual({
      1: {
        name: 'OpenAI',
        displayName: global.aiproxyChannelsCache[0].name,
        avatar: 'model/openai',
        order: 0,
        defaultBaseUrl: 'https://api.openai.com/v1',
        keyHelp: 'sk-*',
        canCreate: true
      }
    });
  });
});

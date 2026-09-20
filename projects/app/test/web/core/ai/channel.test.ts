import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
  userState: {
    userInfo: {
      username: 'root',
      team: {
        permission: {
          hasModelCreateRole: true
        }
      }
    }
  }
}));

vi.mock('@/web/common/api/request', () => ({
  GET: mocks.GET,
  POST: mocks.POST,
  PUT: mocks.PUT,
  DELETE: mocks.DELETE
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: {
    getState: () => mocks.userState
  }
}));

vi.mock('@fastgpt/global/common/i18n/utils', () => ({
  i18nT: (key: string) => key
}));

import {
  batchDeleteChannels,
  batchUpdateChannelStatus,
  deleteChannel,
  getChannelList,
  getChannelLog,
  getChannelProviders,
  getDashboardV2,
  getLogDetail,
  postCreateChannel,
  putChannel,
  putChannelStatus
} from '@/web/core/ai/channel';

const channelInput = {
  type: 1,
  name: ' Existing channel ',
  base_url: 'https://example.com/v1',
  key: 'secret',
  models: ['model-a'],
  model_mapping: {}
};

describe('Channel Web Client API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userState.userInfo.username = 'root';
  });

  describe('getChannelList', () => {
    it('defaults to system scope for root and sorts channels desc', async () => {
      mocks.GET.mockResolvedValueOnce({
        list: [
          {
            id: 1,
            name: 'ch-1',
            type: 1,
            status: 1,
            models: ['m1'],
            created_at: 100,
            relatedModelCount: 0
          },
          {
            id: 2,
            name: 'ch-2',
            type: 1,
            status: 1,
            models: ['m2'],
            created_at: 200,
            relatedModelCount: 1
          }
        ],
        total: 2
      });

      const res = await getChannelList();

      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/list', { groupType: 'system' });
      expect(res.map((item) => item.id)).toEqual([2, 1]);
    });

    it('defaults to team scope for non-root members', async () => {
      mocks.userState.userInfo.username = 'member';
      mocks.GET.mockResolvedValueOnce({ list: [], total: 0 });

      await getChannelList();

      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/list', { groupType: 'team' });
    });
  });

  describe('postCreateChannel', () => {
    it('rejects a duplicate trimmed channel name before creating anything', async () => {
      mocks.GET.mockResolvedValueOnce({
        list: [
          {
            id: 1,
            name: 'Existing channel',
            created_at: 1,
            type: 1,
            status: 1,
            models: [],
            relatedModelCount: 0
          }
        ],
        total: 1
      });

      await expect(postCreateChannel(channelInput)).rejects.toBe(
        'config_model:channel_name_duplicate'
      );

      expect(mocks.POST).not.toHaveBeenCalled();
    });

    it('trims a unique name and submits the canonical create payload to /core/ai/channel/create', async () => {
      mocks.GET.mockResolvedValueOnce({ list: [], total: 0 });
      mocks.POST.mockResolvedValueOnce(undefined);

      await expect(postCreateChannel(channelInput)).resolves.toBeUndefined();

      expect(mocks.POST).toHaveBeenCalledWith('/core/ai/channel/create', {
        groupType: 'system',
        type: 1,
        name: 'Existing channel',
        base_url: 'https://example.com/v1',
        models: ['model-a'],
        model_mapping: {},
        configs: { map_reasoning_to_reasoning_content: true },
        key: 'secret',
        priority: 1
      });
    });

    it('does not add reasoning field mapping to unrelated channel types', async () => {
      mocks.GET.mockResolvedValueOnce({ list: [], total: 0 });
      mocks.POST.mockResolvedValueOnce(undefined);

      await postCreateChannel({ ...channelInput, type: 14 });

      expect(mocks.POST).toHaveBeenCalledWith('/core/ai/channel/create', {
        groupType: 'system',
        type: 14,
        name: 'Existing channel',
        base_url: 'https://example.com/v1',
        models: ['model-a'],
        model_mapping: {},
        configs: undefined,
        key: 'secret',
        priority: 1
      });
    });
  });

  describe('putChannel', () => {
    it('preserves channel fields and routes to /core/ai/channel/update', async () => {
      mocks.PUT.mockResolvedValueOnce(undefined);

      await putChannel({
        id: 7,
        type: 1,
        name: 'Advanced channel',
        base_url: 'https://example.com/v1',
        proxy_url: 'https://proxy.example.com',
        models: ['model-a'],
        model_mapping: { alias: 'model-a' },
        configs: { region: 'us-west' },
        key: 'secret',
        status: 1,
        priority: 0,
        sets: ['production'],
        enabled_auto_balance_check: true,
        balance_threshold: 0,
        skip_tls_verify: true,
        enabled_no_permission_ban: true,
        warn_error_rate: 0.2,
        max_error_rate: 0.5,
        created_at: 1
      });

      expect(mocks.PUT).toHaveBeenCalledWith('/core/ai/channel/update', {
        id: 7,
        channelType: 'system',
        type: 1,
        name: 'Advanced channel',
        base_url: 'https://example.com/v1',
        proxy_url: 'https://proxy.example.com',
        models: ['model-a'],
        model_mapping: { alias: 'model-a' },
        configs: { region: 'us-west' },
        key: 'secret',
        status: 1,
        priority: 1,
        sets: ['production']
      });
    });

    it('rejects a full update when balance threshold cannot be preserved', async () => {
      await expect(
        putChannel({
          id: 8,
          type: 1,
          name: 'Threshold channel',
          base_url: '',
          models: [],
          model_mapping: {},
          key: '',
          status: 1,
          priority: 1,
          balance_threshold: 10,
          created_at: 1
        })
      ).rejects.toThrow('cannot preserve balance_threshold for channel: 8');
      expect(mocks.PUT).not.toHaveBeenCalled();
    });
  });

  describe('putChannelStatus & deleteChannel', () => {
    it('calls /core/ai/channel/status', async () => {
      mocks.POST.mockResolvedValueOnce(undefined);
      await putChannelStatus(9, 1 as any);
      expect(mocks.POST).toHaveBeenCalledWith('/core/ai/channel/status', {
        id: 9,
        status: 1,
        channelType: 'system'
      });
    });

    it('calls /core/ai/channel/delete', async () => {
      mocks.DELETE.mockResolvedValueOnce({ affectedModels: [] });
      await deleteChannel(10);
      expect(mocks.DELETE).toHaveBeenCalledWith('/core/ai/channel/delete', {
        id: 10,
        channelType: 'system'
      });
    });
  });

  describe('batch operations', () => {
    it('calls /core/ai/channel/batchDelete', async () => {
      mocks.POST.mockResolvedValueOnce(undefined);
      await batchDeleteChannels([1, 2]);
      expect(mocks.POST).toHaveBeenCalledWith('/core/ai/channel/batchDelete', {
        ids: [1, 2],
        channelType: 'system'
      });
    });

    it('calls /core/ai/channel/batchStatus', async () => {
      mocks.POST.mockResolvedValueOnce(undefined);
      await batchUpdateChannelStatus([1, 2], 2);
      expect(mocks.POST).toHaveBeenCalledWith('/core/ai/channel/batchStatus', {
        ids: [1, 2],
        status: 2,
        channelType: 'system'
      });
    });
  });

  describe('observability methods', () => {
    it('normalizes logs query parameters and calls /core/ai/channel/logs', async () => {
      mocks.GET.mockResolvedValueOnce({ list: [], total: 0 });

      await getChannelLog({
        request_id: 'req-1',
        channel: '12',
        model_name: 'gpt-4o',
        code_type: 'success',
        start_timestamp: 1000,
        end_timestamp: 2000,
        pageSize: 20,
        offset: 40
      });

      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/logs', {
        channelType: 'system',
        requestId: 'req-1',
        channelId: 12,
        modelName: 'gpt-4o',
        codeType: 'success',
        startTimestamp: 1000,
        endTimestamp: 2000,
        pageNum: 3,
        pageSize: 20
      });
    });

    it('calls /core/ai/channel/logDetail', async () => {
      mocks.GET.mockResolvedValueOnce({ request_body: '{}', response_body: '{}' });
      await getLogDetail(101);
      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/logDetail', {
        id: 101,
        channelType: 'system'
      });
    });

    it('normalizes dashboard query and calls /core/ai/channel/dashboard', async () => {
      mocks.GET.mockResolvedValueOnce([
        {
          timestamp: 1787666400,
          summary: [
            {
              model: 'gpt-4o',
              channel_id: 12,
              request_count: 5,
              total_tokens: 100,
              input_tokens: 60,
              output_tokens: 40,
              total_time_milliseconds: 2000,
              total_ttfb_milliseconds: 500,
              used_amount: 0.1,
              exception_count: 0
            }
          ]
        }
      ]);

      const res = await getDashboardV2({
        channel: 12,
        model: 'gpt-4o',
        start_timestamp: 1000,
        end_timestamp: 2000,
        timezone: 'UTC',
        timespan: 'hour'
      });

      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/dashboard', {
        channelType: 'system',
        channelId: 12,
        model: 'gpt-4o',
        startTimestamp: 1000,
        endTimestamp: 2000,
        timezone: 'UTC',
        timespan: 'hour'
      });
      expect(res).toHaveLength(1);
      expect(res[0].summary[0].total_tokens).toBe(100);
    });

    it('calls /core/ai/channel/providerMetas', async () => {
      mocks.GET.mockResolvedValueOnce({
        '1': { defaultBaseUrl: 'https://api.openai.com/v1', keyHelp: 'sk-...', name: 'OpenAI' }
      });
      const metas = await getChannelProviders();
      expect(mocks.GET).toHaveBeenCalledWith('/core/ai/channel/providerMetas');
      expect(metas['1'].name).toBe('OpenAI');
    });
  });
});

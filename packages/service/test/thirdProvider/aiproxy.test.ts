import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AIProxyClient } from '../../thirdProvider/aiproxy/client';

const mockAxiosWithoutSSRF = vi.fn();

vi.mock('../../common/api/axios', () => ({
  axiosWithoutSSRF: (...args: any[]) => mockAxiosWithoutSSRF(...args)
}));

describe('AIProxyClient', () => {
  const config = {
    baseUrl: 'https://aiproxy.example.com',
    token: 'test-admin-token'
  };

  let client: AIProxyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AIProxyClient(() => config);
  });

  describe('system.channels', () => {
    it('list forwards query params to search endpoint when search is provided', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            channels: [{ id: 1, name: 'ch-1', type: 1, models: ['gpt-4'] }],
            total: 1
          }
        }
      });

      const res = await client.system.channels.list({ page: 2, perPage: 20, search: 'test' });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: 'https://aiproxy.example.com/api/channels/search?page=2&per_page=20&keyword=test',
          headers: { Authorization: 'Bearer test-admin-token' }
        })
      );
      expect(res.channels).toHaveLength(1);
      expect(res.channels[0].id).toBe(1);
      expect(res.total).toBe(1);
    });

    it('list forwards query params to standard endpoint when search is absent', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            channels: [{ id: 1, name: 'ch-1', type: 1, models: ['gpt-4'] }],
            total: 1
          }
        }
      });

      const res = await client.system.channels.list({ page: 2, perPage: 20 });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: 'https://aiproxy.example.com/api/channels/?page=2&per_page=20',
          headers: { Authorization: 'Bearer test-admin-token' }
        })
      );
      expect(res.channels).toHaveLength(1);
      expect(res.channels[0].id).toBe(1);
      expect(res.total).toBe(1);
    });

    it('get fetches a single channel by id', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: { id: 12, name: 'system-ch' }
        }
      });

      const res = await client.system.channels.get(12);

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: 'https://aiproxy.example.com/api/channel/12'
        })
      );
      expect(res.id).toBe(12);
    });

    it('create posts payload to /api/channel/', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: { success: true, data: null }
      });

      await client.system.channels.create({
        name: 'new-ch',
        type: 1,
        key: 'sk-123',
        models: ['gpt-4']
      });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'https://aiproxy.example.com/api/channel/',
          data: expect.objectContaining({ name: 'new-ch', key: 'sk-123' })
        })
      );
    });

    it('batchDelete posts ids to /api/channels/batch_delete', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: { success: true, data: null }
      });

      await client.system.channels.batchDelete([1, 2, 3]);

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'https://aiproxy.example.com/api/channels/batch_delete',
          data: [1, 2, 3]
        })
      );
    });

    it('throws error when envelope success is false', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: { success: false, message: 'channel name duplicated' }
      });

      await expect(
        client.system.channels.create({
          name: 'dup',
          type: 1,
          key: 'sk',
          models: ['m']
        })
      ).rejects.toThrow('channel name duplicated');
    });
  });

  describe('group.channels', () => {
    const groupId = 'fastgpt:tmb:12345';

    it('list queries group-scoped endpoint', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            channels: [{ id: 10, name: 'team-ch', group_id: groupId }],
            total: 1
          }
        }
      });

      const res = await client.group(groupId).channels.list({ page: 1 });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: `https://aiproxy.example.com/api/group/${encodeURIComponent(groupId)}/channels/?page=1`
        })
      );
      expect(res.channels[0].id).toBe(10);
    });

    it('create posts to group-scoped endpoint', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: { success: true, data: null }
      });

      await client.group(groupId).channels.create({
        name: 'member-ch',
        type: 1,
        key: 'sk-abc',
        models: ['gpt-4']
      });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: `https://aiproxy.example.com/api/group/${encodeURIComponent(groupId)}/channel/`,
          data: expect.objectContaining({ name: 'member-ch' })
        })
      );
    });

    it('batchDelete posts to group batch_delete endpoint', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: { success: true, data: null }
      });

      await client.group(groupId).channels.batchDelete([10, 11]);

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: `https://aiproxy.example.com/api/group/${encodeURIComponent(groupId)}/channels/batch_delete`,
          data: [10, 11]
        })
      );
    });
  });

  describe('logs and observability', () => {
    it('group logs search formats query and maps group_channel_id', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            logs: [
              {
                id: 100,
                model_name: 'gpt-4o',
                group_channel_id: 88,
                created_at: 12345
              }
            ],
            total: 1
          }
        }
      });

      const res = await client.group('grp-1').logs.search({
        requestId: 'req-1',
        channelId: 88,
        pageSize: 10
      });

      expect(mockAxiosWithoutSSRF).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: expect.stringContaining('/api/log/grp-1/group_channel/search')
        })
      );
      expect(res.list[0].channel).toBe(88);
      expect(res.total).toBe(1);
    });

    it('system dashboard get maps summary channel_id', async () => {
      mockAxiosWithoutSSRF.mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            {
              timestamp: 1000,
              summary: [{ group_channel_id: 99, total_calls: 10 }]
            }
          ]
        }
      });

      const res = await client.system.dashboard.get({
        timezone: 'UTC',
        timespan: 'day'
      });

      expect(res[0].summary[0].channel_id).toBe(99);
    });
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AIProxyClient } from '../../thirdProvider/aiproxy/client';
import {
  isAiproxyNotFoundError,
  tolerateNotFound,
  normalizeRelayNoChannelError
} from '../../thirdProvider/aiproxy/error';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

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

    it('propagates raw 404 http error without wrapping in ModelErrEnum', async () => {
      const err404 = { response: { status: 404, data: { message: 'not found' } } };
      mockAxiosWithoutSSRF.mockRejectedValueOnce(err404);

      await expect(client.system.channels.get(404)).rejects.toBe(err404);
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

    it('list returns empty channels and 0 total when group returns 404', async () => {
      mockAxiosWithoutSSRF.mockRejectedValueOnce({
        response: { status: 404 }
      });

      const res = await client.group(groupId).channels.list();
      expect(res).toEqual({ channels: [], total: 0 });
    });

    it('listAll returns empty array when group returns 404', async () => {
      mockAxiosWithoutSSRF.mockRejectedValueOnce({
        response: { status: 404 }
      });

      const res = await client.group(groupId).channels.listAll();
      expect(res).toEqual([]);
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

describe('AIProxy Error Helpers', () => {
  describe('isAiproxyNotFoundError', () => {
    it('matches 404 status codes', () => {
      expect(isAiproxyNotFoundError({ status: 404 })).toBe(true);
      expect(isAiproxyNotFoundError({ response: { status: 404 } })).toBe(true);
    });

    it('matches 500 status code with record not found message', () => {
      expect(
        isAiproxyNotFoundError({ response: { status: 500, data: { message: 'record not found' } } })
      ).toBe(true);
      expect(isAiproxyNotFoundError({ status: 500, message: 'Record Not Found' })).toBe(true);
    });

    it('returns false for unrelated errors and domain enums', () => {
      expect(isAiproxyNotFoundError(new Error('connection timeout'))).toBe(false);
      expect(isAiproxyNotFoundError({ response: { status: 500, data: { message: 'boom' } } })).toBe(
        false
      );
      expect(isAiproxyNotFoundError(null)).toBe(false);
      expect(isAiproxyNotFoundError(ModelErrEnum.channelNotExist)).toBe(false);
    });
  });

  describe('tolerateNotFound', () => {
    it('returns result when fetch succeeds', async () => {
      const res = await tolerateNotFound(async () => 'success', 'fallback');
      expect(res).toBe('success');
    });

    it('returns fallback when fetch throws a 404 not found error', async () => {
      const res = await tolerateNotFound(async () => {
        throw { response: { status: 404 } };
      }, 'fallback');
      expect(res).toBe('fallback');
    });

    it('rethrows when fetch throws other errors', async () => {
      await expect(
        tolerateNotFound(async () => {
          throw new Error('fatal error');
        }, 'fallback')
      ).rejects.toThrow('fatal error');
    });
  });

  describe('normalizeRelayNoChannelError', () => {
    it('converts relay 404 no available channel errors to ModelErrEnum.noAvailableChannel', () => {
      const err = {
        response: { status: 404, data: { message: 'no available channel for model' } }
      };
      expect(normalizeRelayNoChannelError(err)).toBe(ModelErrEnum.noAvailableChannel);
    });

    it('leaves other 404 errors or non-404 errors unmodified', () => {
      const notFoundOther = { response: { status: 404, data: { message: 'other error' } } };
      expect(normalizeRelayNoChannelError(notFoundOther)).toBe(notFoundOther);

      const serverErr = { response: { status: 500, data: { message: 'no available channel' } } };
      expect(normalizeRelayNoChannelError(serverErr)).toBe(serverErr);
    });
  });
});

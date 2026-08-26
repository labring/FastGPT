import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosMock, getConfigMock } = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  getConfigMock: vi.fn(() => ({ baseUrl: 'http://aiproxy.test', token: 'test-token' }))
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: axiosMock
}));

vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: getConfigMock
}));

import { resetChannelCache } from '@fastgpt/service/core/ai/channel/cache';
import {
  createGroupChannel,
  createSystemChannel,
  deleteGroupChannel,
  deleteSystemChannel,
  getChannelDashboard,
  getChannelLogDetail,
  getSystemGroupId,
  listGlobalGroupChannels,
  listGroupChannels,
  listSystemChannels,
  searchChannelLogs,
  testGroupChannel,
  testSystemChannel,
  updateGroupChannel,
  updateGroupChannelStatus,
  updateSystemChannel,
  updateSystemChannelStatus
} from '@fastgpt/service/core/ai/channel/api';

const okEnvelope = (data: unknown) => ({ data: { success: true, data } });
const channel = { id: 1, name: 'ch', type: 1, status: 1, models: ['gpt-4o'] };

describe('aiproxy channel admin client', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    resetChannelCache(); // list* is cache-aware: buckets must be fresh per test
  });

  it('getSystemGroupId follows the fastgpt:tmb: convention', () => {
    expect(getSystemGroupId('tmb_123')).toBe('fastgpt:tmb:tmb_123');
  });

  it('sends the admin bearer token and unwraps the envelope', async () => {
    axiosMock.mockResolvedValue(okEnvelope({ channels: [channel], total: 1 }));
    const res = await listSystemChannels({ page: 1, perPage: 100 });

    // Cache-aware list: first call fetches the full bucket via the pagination
    // loop (fixed page=1 & per_page=100), then pages locally over the bucket.
    expect(res).toEqual({ channels: [channel], total: 1 });
    const config = axiosMock.mock.calls[0][0];
    expect(config.method).toBe('get');
    expect(config.url).toBe('http://aiproxy.test/api/channels/?page=1&per_page=100');
    expect(config.headers.Authorization).toBe('Bearer test-token');
    expect(getConfigMock).toHaveBeenCalled();
  });

  it('throws the aiproxy message when the envelope reports failure', async () => {
    axiosMock.mockResolvedValue({ data: { success: false, message: 'invalid key' } });
    await expect(
      createSystemChannel({ name: 'ch', type: 1, key: 'k', models: ['gpt-4o'] })
    ).rejects.toThrow('invalid key');
  });

  it('system channel CRUD + status + test hit the /api/channel endpoints', async () => {
    axiosMock.mockResolvedValue(okEnvelope(null));

    await createSystemChannel({ name: 'ch', type: 1, key: 'k', models: ['gpt-4o'] });
    await updateSystemChannel(12, { name: 'ch2', type: 1, key: 'k', models: ['gpt-4o'] });
    await deleteSystemChannel(12);
    await updateSystemChannelStatus(12, 2);
    await testSystemChannel(12, 'gpt-4o');

    const urls = axiosMock.mock.calls.map((c) => `${c[0].method} ${c[0].url}`);
    expect(urls).toEqual([
      'post http://aiproxy.test/api/channel/',
      'put http://aiproxy.test/api/channel/12',
      'delete http://aiproxy.test/api/channel/12',
      'post http://aiproxy.test/api/channel/12/status',
      'get http://aiproxy.test/api/channel/12/test/gpt-4o'
    ]);
    // status body carries { status: 2 }
    expect(axiosMock.mock.calls[3][0].data).toEqual({ status: 2 });
  });

  it('group channel CRUD + status + test hit the group-scoped endpoints', async () => {
    axiosMock.mockResolvedValue(okEnvelope(null));
    const groupId = getSystemGroupId('tmb-a'); // fastgpt:tmb:tmb-a

    await createGroupChannel(groupId, { name: 'ch', type: 1, key: 'k', models: ['qwen-plus'] });
    await updateGroupChannel(groupId, 12, {
      name: 'ch2',
      type: 1,
      key: 'k',
      models: ['qwen-plus']
    });
    await deleteGroupChannel(groupId, 12);
    await updateGroupChannelStatus(groupId, 12, 1);
    await testGroupChannel(groupId, 12, 'qwen-plus');

    const urls = axiosMock.mock.calls.map((c) => c[0].url);
    expect(urls).toEqual([
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel/',
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel/12',
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel/12',
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel/12/status',
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel/12/test/qwen-plus'
    ]);
  });

  it('listGroupChannels fetches its bucket; filtered & unfiltered global views share one bucket', async () => {
    axiosMock.mockResolvedValue(okEnvelope({ channels: [], total: 0 }));

    await listGroupChannels('fastgpt:tmb:tmb-a', { page: 2, perPage: 100 });
    await listGlobalGroupChannels({ groupId: 'fastgpt:tmb:tmb-b' });
    await listGlobalGroupChannels({ page: 1, perPage: 10 });

    const urls = axiosMock.mock.calls.map((c) => c[0].url);
    // Bucket fetch uses the fixed pagination loop page (page=1 & per_page=100);
    // the requested page/perPage are applied locally over the bucket.
    expect(urls[0]).toBe(
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channels/?page=1&per_page=100'
    );
    // the ?group= filter is applied in memory over the shared global bucket —
    // both global calls reuse the same bucket fetch (page=1 & per_page=100, no ?group=)
    expect(urls[1]).toBe('http://aiproxy.test/api/group_channels/?page=1&per_page=100');
    expect(urls).toHaveLength(2); // group bucket + shared global bucket — no third fetch
  });

  it('tolerates a null channels payload (Go nil slice) instead of crashing the spread', async () => {
    // aiproxy may return data.channels: null for an empty/degraded bucket —
    // the pagination loop must not spread null ("X is not iterable" 500).
    axiosMock.mockResolvedValue(okEnvelope({ channels: null, total: 0 }));

    const res = await listSystemChannels();
    expect(res).toEqual({ channels: [], total: 0 });
    // treated as end-of-list: exactly one page fetch, no spin on total
    expect(axiosMock.mock.calls).toHaveLength(1);

    axiosMock.mockClear();
    axiosMock.mockResolvedValue(okEnvelope({ channels: null, total: 3 }));
    const res2 = await listGlobalGroupChannels();
    expect(res2).toEqual({ channels: [], total: 0 });
    expect(axiosMock.mock.calls).toHaveLength(1);
  });

  it('stops pagination on an empty page even when total is stale', async () => {
    // total claims 3 channels but the bucket is empty — must not loop forever.
    axiosMock.mockResolvedValue(okEnvelope({ channels: [], total: 3 }));

    const res = await listSystemChannels();
    expect(res).toEqual({ channels: [], total: 0 });
    expect(axiosMock.mock.calls).toHaveLength(1);
  });

  it('queries system logs and preserves the system channel id', async () => {
    axiosMock.mockResolvedValue(
      okEnvelope({
        logs: [
          {
            id: 1001,
            model: 'gpt-4o',
            channel: 12,
            created_at: 1787670000000,
            request_at: 1787669999000,
            code: 200
          }
        ],
        total: 1
      })
    );

    const result = await searchChannelLogs({
      channelId: 12,
      codeType: 'all',
      startTimestamp: 1787500800000,
      endTimestamp: 1787673599999,
      pageNum: 2,
      pageSize: 20
    });

    expect(result.list[0].channel).toBe(12);
    expect(result.total).toBe(1);
    expect(axiosMock.mock.calls[0][0].url).toBe(
      'http://aiproxy.test/api/logs/search?result_only=true&channel=12&code_type=all&start_timestamp=1787500800000&end_timestamp=1787673599999&p=2&per_page=20'
    );
  });

  it('queries the private group-channel log store and normalizes group_channel_id', async () => {
    axiosMock.mockResolvedValue(
      okEnvelope({
        logs: [
          {
            id: 1002,
            model: 'qwen-plus',
            group_channel_id: 21,
            created_at: 1787670000000,
            request_at: 1787669999000,
            code: 500
          }
        ],
        total: 1
      })
    );

    const result = await searchChannelLogs({
      groupId: 'fastgpt:tmb:tmb-a',
      channelId: 21,
      startTimestamp: 1787500800000,
      endTimestamp: 1787673599999,
      pageSize: 20
    });

    expect(result.list[0].channel).toBe(21);
    expect(axiosMock.mock.calls[0][0].url).toBe(
      'http://aiproxy.test/api/log/fastgpt%3Atmb%3Atmb-a/group_channel/search?result_only=true&channel=21&start_timestamp=1787500800000&end_timestamp=1787673599999&p=1&per_page=20'
    );
  });

  it('uses scope-specific log detail endpoints', async () => {
    axiosMock.mockResolvedValue(okEnvelope({ request_body: '{}', response_body: '{}' }));

    await getChannelLogDetail({ id: 1001 });
    await getChannelLogDetail({ id: 1002, groupId: 'fastgpt:tmb:tmb-a' });

    expect(axiosMock.mock.calls.map((call) => call[0].url)).toEqual([
      'http://aiproxy.test/api/logs/detail/1001',
      'http://aiproxy.test/api/log/fastgpt%3Atmb%3Atmb-a/group_channel/detail/1002'
    ]);
  });

  it('uses scope-specific dashboard filters and normalizes group_channel_id', async () => {
    axiosMock
      .mockResolvedValueOnce(
        okEnvelope([{ timestamp: 1, summary: [{ channel_id: 12, model: 'gpt-4o' }] }])
      )
      .mockResolvedValueOnce(
        okEnvelope([{ timestamp: 2, summary: [{ group_channel_id: 21, model: 'qwen-plus' }] }])
      );

    const systemResult = await getChannelDashboard({
      channelId: 12,
      timezone: 'Asia/Shanghai',
      timespan: 'hour'
    });
    const groupResult = await getChannelDashboard({
      groupId: 'fastgpt:tmb:tmb-a',
      channelId: 21,
      timezone: 'Asia/Shanghai',
      timespan: 'day'
    });

    expect(systemResult[0].summary[0].channel_id).toBe(12);
    expect(groupResult[0].summary[0].channel_id).toBe(21);
    expect(axiosMock.mock.calls.map((call) => call[0].url)).toEqual([
      'http://aiproxy.test/api/dashboardv2/?channel=12&timezone=Asia%2FShanghai&timespan=hour',
      'http://aiproxy.test/api/group/fastgpt%3Atmb%3Atmb-a/channel-dashboardv2?group_channel=21&timezone=Asia%2FShanghai&timespan=day'
    ]);
  });
});

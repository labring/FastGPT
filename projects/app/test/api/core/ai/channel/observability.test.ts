import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  getChannelDashboard,
  getChannelLogDetail,
  getGlobalGroupChannelById,
  getGroupChannelById,
  getSystemChannelById,
  searchChannelLogs,
  type AiproxyGroupChannel
} from '@fastgpt/service/core/ai/channel';
import { Call } from '@test/utils/request';
import logsHandler from '@/pages/api/core/ai/channel/logs';
import logDetailHandler from '@/pages/api/core/ai/channel/logDetail';
import dashboardHandler from '@/pages/api/core/ai/channel/dashboard';

vi.mock('@fastgpt/service/core/ai/channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel')>();
  return {
    ...actual,
    getGroupChannelById: vi.fn(),
    getSystemChannelById: vi.fn(),
    getGlobalGroupChannelById: vi.fn(),
    searchChannelLogs: vi.fn(),
    getChannelLogDetail: vi.fn(),
    getChannelDashboard: vi.fn()
  };
});

vi.mock('@fastgpt/service/support/permission/user/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/user/auth')>();
  return {
    ...actual,
    authUserPer: vi.fn()
  };
});

const TMB_ID = 'tmbId';
const GROUP_ID = `fastgpt:tmb:${TMB_ID}`;

const mockAuth = (isRoot: boolean) => {
  const permission = new TeamPermission({ isOwner: true });
  vi.mocked(authUserPer).mockResolvedValue({
    userId: 'userId',
    teamId: 'teamId',
    tmbId: TMB_ID,
    isRoot,
    permission,
    tmb: { permission }
  } as any);
};

const groupChannel = (id: number): AiproxyGroupChannel => ({
  id,
  name: `channel-${id}`,
  type: 1,
  status: 1,
  models: ['gpt-4o'],
  group_id: GROUP_ID
});

const logItem = {
  id: 1001,
  model: 'gpt-4o',
  channel: 12,
  created_at: 1787670000000,
  request_at: 1787669999000,
  code: 200
};

describe('channel observability APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives a member group and validates channelId before searching logs', async () => {
    mockAuth(false);
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12));
    vi.mocked(searchChannelLogs).mockResolvedValue({ list: [logItem], total: 1 });

    const res = await Call(logsHandler, {
      query: {
        channelType: 'team',
        channelId: 12,
        codeType: 'all',
        startTimestamp: 1787500800000,
        endTimestamp: 1787673599999,
        pageSize: 20
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getGroupChannelById)).toHaveBeenCalledWith(GROUP_ID, 12);
    expect(vi.mocked(searchChannelLogs)).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, channelId: 12 })
    );
    expect(vi.mocked(getGlobalGroupChannelById)).not.toHaveBeenCalled();
  });

  it('treats an empty channelId from the all-channels selector as no filter', async () => {
    mockAuth(false);
    vi.mocked(searchChannelLogs).mockResolvedValue({ list: [], total: 0 });

    const res = await Call(logsHandler, {
      query: {
        channelType: 'team',
        channelId: '',
        startTimestamp: 1787500800000,
        endTimestamp: 1787673599999,
        pageSize: 20
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getGroupChannelById)).not.toHaveBeenCalled();
    expect(vi.mocked(searchChannelLogs)).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, channelId: undefined })
    );
  });

  it('rejects a member requesting the system log scope', async () => {
    mockAuth(false);

    const res = await Call(logsHandler, {
      query: {
        channelType: 'system',
        startTimestamp: 1787500800000,
        endTimestamp: 1787673599999,
        pageSize: 20
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('rootOnlyPermit');
    expect(vi.mocked(searchChannelLogs)).not.toHaveBeenCalled();
  });

  it('keeps root team logs inside the root member group', async () => {
    mockAuth(true);
    vi.mocked(getGroupChannelById).mockResolvedValue(groupChannel(12));
    vi.mocked(searchChannelLogs).mockResolvedValue({ list: [], total: 0 });

    const res = await Call(logsHandler, {
      query: {
        channelType: 'team',
        channelId: 12,
        startTimestamp: 1787500800000,
        endTimestamp: 1787673599999,
        pageSize: 20
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getGroupChannelById)).toHaveBeenCalledWith(GROUP_ID, 12);
    expect(vi.mocked(getGlobalGroupChannelById)).not.toHaveBeenCalled();
    expect(vi.mocked(searchChannelLogs)).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID })
    );
  });

  it('rejects channelId that is absent from the current member group', async () => {
    mockAuth(false);
    vi.mocked(getGroupChannelById).mockRejectedValue({ response: { status: 404 } });

    const res = await Call(logsHandler, {
      query: {
        channelType: 'team',
        channelId: 99,
        startTimestamp: 1787500800000,
        endTimestamp: 1787673599999,
        pageSize: 20
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('channelNotExist');
    expect(vi.mocked(searchChannelLogs)).not.toHaveBeenCalled();
  });

  it('uses the derived member group for log details', async () => {
    mockAuth(false);
    vi.mocked(getChannelLogDetail).mockResolvedValue({
      request_body: '{}',
      response_body: '{}'
    });

    const res = await Call(logDetailHandler, {
      query: { channelType: 'team', id: 1001 }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getChannelLogDetail)).toHaveBeenCalledWith({
      id: 1001,
      groupId: GROUP_ID
    });
  });

  it('validates a root system channel before querying the global dashboard', async () => {
    mockAuth(true);
    vi.mocked(getSystemChannelById).mockResolvedValue({
      ...groupChannel(12),
      group_id: undefined
    });
    vi.mocked(getChannelDashboard).mockResolvedValue([]);

    const res = await Call(dashboardHandler, {
      query: {
        channelType: 'system',
        channelId: 12,
        timezone: 'Asia/Shanghai',
        timespan: 'hour'
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(getSystemChannelById)).toHaveBeenCalledWith(12);
    expect(vi.mocked(getChannelDashboard)).toHaveBeenCalledWith({
      channelId: 12,
      timezone: 'Asia/Shanghai',
      timespan: 'hour',
      groupId: undefined
    });
  });
});

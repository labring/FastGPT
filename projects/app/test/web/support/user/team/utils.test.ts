import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/web/common/api/request';
import { getAllTeamMembers } from '@/web/support/user/team/utils';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));

const member = (tmbId: string) => ({ tmbId, memberName: tmbId }) as TeamMemberItemType;

describe('getAllTeamMembers', () => {
  beforeEach(() => vi.mocked(POST).mockReset());

  it('allows a successfully loaded empty list', async () => {
    vi.mocked(POST).mockResolvedValue({ total: 0, list: [] });
    await expect(getAllTeamMembers({ orgId: 'org' }, new AbortController())).resolves.toEqual([]);
  });

  it('loads every page using the number actually returned as the next offset', async () => {
    const controller = new AbortController();
    vi.mocked(POST)
      .mockResolvedValueOnce({ total: 3, list: [member('a'), member('b')] })
      .mockResolvedValueOnce({ total: 3, list: [member('c')] });

    await expect(getAllTeamMembers({ groupId: 'group' }, controller)).resolves.toEqual([
      member('a'),
      member('b'),
      member('c')
    ]);
    expect(vi.mocked(POST).mock.calls).toEqual([
      [
        '/proApi/support/user/team/member/list',
        { groupId: 'group', pageSize: 1000, offset: 0 },
        { cancelToken: controller }
      ],
      [
        '/proApi/support/user/team/member/list',
        { groupId: 'group', pageSize: 1000, offset: 2 },
        { cancelToken: controller }
      ]
    ]);
  });

  it('preserves organization filters on every request', async () => {
    vi.mocked(POST)
      .mockResolvedValueOnce({ total: 2, list: [member('a')] })
      .mockResolvedValueOnce({ total: 2, list: [member('b')] });
    await getAllTeamMembers(
      { orgId: 'org', withOrgs: false, withPermission: false },
      new AbortController()
    );
    for (const [, params] of vi.mocked(POST).mock.calls) {
      expect(params).toMatchObject({ orgId: 'org', withOrgs: false, withPermission: false });
    }
  });

  it.each([-1, 1.5, NaN])('rejects an invalid total %s', async (total) => {
    vi.mocked(POST).mockResolvedValue({ total, list: [] });
    await expect(getAllTeamMembers({ groupId: 'group' }, new AbortController())).rejects.toThrow(
      'common:core.chat.error.data_error'
    );
  });

  it('rejects changes in total during pagination', async () => {
    vi.mocked(POST)
      .mockResolvedValueOnce({ total: 2, list: [member('a')] })
      .mockResolvedValueOnce({ total: 3, list: [member('b')] });
    await expect(getAllTeamMembers({ groupId: 'group' }, new AbortController())).rejects.toThrow(
      'common:core.chat.error.data_error'
    );
  });

  it.each(['same-page', 'across-pages'])('rejects duplicate IDs %s', async (caseName) => {
    if (caseName === 'same-page') {
      vi.mocked(POST).mockResolvedValue({ total: 2, list: [member('a'), member('a')] });
    } else {
      vi.mocked(POST)
        .mockResolvedValueOnce({ total: 2, list: [member('a')] })
        .mockResolvedValueOnce({ total: 2, list: [member('a')] });
    }
    await expect(getAllTeamMembers({ groupId: 'group' }, new AbortController())).rejects.toThrow(
      'common:core.chat.error.data_error'
    );
  });

  it('rejects a missing page rather than returning a partial list', async () => {
    vi.mocked(POST)
      .mockResolvedValueOnce({ total: 2, list: [member('a')] })
      .mockResolvedValueOnce({ total: 2, list: [] });
    await expect(getAllTeamMembers({ orgId: 'org' }, new AbortController())).rejects.toThrow(
      'common:core.chat.error.data_error'
    );
    expect(POST).toHaveBeenCalledTimes(2);
  });

  it('rejects more members than the declared total', async () => {
    vi.mocked(POST).mockResolvedValue({ total: 1, list: [member('a'), member('b')] });
    await expect(getAllTeamMembers({ orgId: 'org' }, new AbortController())).rejects.toThrow(
      'common:core.chat.error.data_error'
    );
  });

  it('propagates a later-page failure without returning earlier members', async () => {
    vi.mocked(POST)
      .mockResolvedValueOnce({ total: 2, list: [member('a')] })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(getAllTeamMembers({ groupId: 'group' }, new AbortController())).rejects.toThrow(
      'offline'
    );
  });

  it('does not request anything after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getAllTeamMembers({ orgId: 'org' }, controller)).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(POST).not.toHaveBeenCalled();
  });

  it('stops pagination when cancelled while a page is in flight', async () => {
    const controller = new AbortController();
    vi.mocked(POST).mockImplementation(async () => {
      controller.abort();
      return { total: 2, list: [member('a')] } as any;
    });
    await expect(getAllTeamMembers({ orgId: 'org' }, controller)).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(POST).toHaveBeenCalledOnce();
  });
});

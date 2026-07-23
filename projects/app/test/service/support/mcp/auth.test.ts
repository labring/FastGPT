import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { McpAuthProxyHeader } from '@fastgpt/global/support/mcp/type';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getMcpAuthProxyFromHeaders, resolveMcpEffectiveTmbId } from '@/service/support/mcp/auth';

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: {
    findOne: vi.fn()
  }
}));

const mockLeanQuery = (value: unknown) => ({
  select: vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(value)
  })
});

describe('MCP auth proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses optional proxy identity from transport headers', () => {
    expect(getMcpAuthProxyFromHeaders({})).toBeUndefined();
    expect(
      getMcpAuthProxyFromHeaders({
        [McpAuthProxyHeader.username]: 'user@example.com',
        [McpAuthProxyHeader.tmbId]: '68ad85a7463006c963799a05'
      })
    ).toEqual({
      username: 'user@example.com',
      tmbId: '68ad85a7463006c963799a05'
    });
  });

  it('uses publisher identity when no proxy is requested', async () => {
    await expect(
      resolveMcpEffectiveTmbId({
        mcp: {
          teamId: 'team-id',
          tmbId: 'publisher-tmb-id',
          authProxy: false
        }
      })
    ).resolves.toBe('publisher-tmb-id');

    expect(MongoTeamMember.findOne).not.toHaveBeenCalled();
  });

  it('rejects proxy identity when the publisher did not enable authProxy', async () => {
    await expect(
      resolveMcpEffectiveTmbId({
        mcp: {
          teamId: 'team-id',
          tmbId: 'publisher-tmb-id',
          authProxy: false
        },
        authProxy: { tmbId: '68ad85a7463006c963799a05' }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
  });

  it('resolves an active member in the publishing team by tmbId', async () => {
    vi.mocked(MongoTeamMember.findOne).mockReturnValue(
      mockLeanQuery({ _id: '68ad85a7463006c963799a05' }) as any
    );

    await expect(
      resolveMcpEffectiveTmbId({
        mcp: {
          teamId: 'team-id',
          tmbId: 'publisher-tmb-id',
          authProxy: true
        },
        authProxy: { tmbId: '68ad85a7463006c963799a05' }
      })
    ).resolves.toBe('68ad85a7463006c963799a05');

    expect(MongoTeamMember.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: '68ad85a7463006c963799a05',
        teamId: 'team-id'
      })
    );
  });

  it('rejects when username and tmbId resolve to different members', async () => {
    vi.mocked(MongoUser.findOne).mockReturnValue(mockLeanQuery({ _id: 'user-id' }) as any);
    vi.mocked(MongoTeamMember.findOne)
      .mockReturnValueOnce(mockLeanQuery({ _id: '68ad85a7463006c963799a05' }) as any)
      .mockReturnValueOnce(mockLeanQuery({ _id: '68ad85a7463006c963799a06' }) as any);

    await expect(
      resolveMcpEffectiveTmbId({
        mcp: {
          teamId: 'team-id',
          tmbId: 'publisher-tmb-id',
          authProxy: true
        },
        authProxy: {
          username: 'user@example.com',
          tmbId: '68ad85a7463006c963799a05'
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
  });
});

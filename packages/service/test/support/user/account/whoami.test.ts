import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_TTL_SECONDS } from '@fastgpt/dal/redis/caches';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreateRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import * as sessionService from '@fastgpt/service/support/user/session';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { getWhoamiDetail } from '@fastgpt/service/support/user/account/whoami/service';
import { getFakeUsers } from '@test/datas/users';

describe('getWhoamiDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns session identity, permissions, and TTL bounds from certificate sessionCreatedAt', async () => {
    const {
      owner,
      members: [member]
    } = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.team,
      teamId: member.teamId,
      tmbId: member.tmbId,
      permission: TeamAppCreateRoleVal
    });

    const createdAt = 1_762_752_000_000;
    const ownerRes = await getWhoamiDetail({
      certificate: {
        userId: owner.userId,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        authType: AuthUserTypeEnum.token,
        isRoot: false,
        sessionId: `${owner.userId}:sess-1`,
        sessionCreatedAt: createdAt
      }
    });

    expect(ownerRes).toMatchObject({
      authType: AuthUserTypeEnum.token,
      user: {
        userId: owner.userId
      },
      team: {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        role: 'owner',
        permission: {
          isOwner: true,
          hasManagePer: true,
          hasWritePer: true,
          hasReadPer: true,
          hasAppCreatePer: true
        }
      },
      isRoot: false,
      session: {
        createdAt,
        expiresAt: createdAt + SESSION_TTL_SECONDS * 1000
      }
    });

    // 历史遗留非 owner 角色字符串应被规范化为 null，同时保留真实权限位。
    await MongoTeamMember.updateOne({ _id: member.tmbId }, { $set: { role: 'legacy-role' } });
    const memberRes = await getWhoamiDetail({
      certificate: {
        userId: member.userId,
        teamId: member.teamId,
        tmbId: member.tmbId,
        authType: AuthUserTypeEnum.token,
        isRoot: false,
        sessionId: `${member.userId}:sess-2`,
        sessionCreatedAt: createdAt
      }
    });

    expect(memberRes).toMatchObject({
      authType: AuthUserTypeEnum.token,
      team: {
        teamId: member.teamId,
        tmbId: member.tmbId,
        role: null,
        permission: {
          isOwner: false,
          hasAppCreatePer: true,
          hasManagePer: false
        }
      }
    });
  });

  it('upgrades permission summary to owner for root sessions and falls back to authUserSession when sessionCreatedAt is omitted', async () => {
    const {
      members: [member]
    } = await getFakeUsers(1);
    const createdAt = 1_762_752_111_000;
    vi.spyOn(sessionService, 'authUserSession').mockResolvedValueOnce({
      userId: member.userId,
      teamId: member.teamId,
      tmbId: member.tmbId,
      isRoot: true,
      createdAt
    });

    const result = await getWhoamiDetail({
      certificate: {
        userId: member.userId,
        teamId: member.teamId,
        tmbId: member.tmbId,
        authType: AuthUserTypeEnum.token,
        isRoot: true,
        sessionId: `${member.userId}:sess-root`
      }
    });

    expect(result).toMatchObject({
      authType: AuthUserTypeEnum.token,
      isRoot: true,
      team: {
        permission: {
          isOwner: true,
          hasManagePer: true,
          hasModelCreatePer: true
        }
      },
      session: {
        createdAt,
        expiresAt: createdAt + SESSION_TTL_SECONDS * 1000
      }
    });
  });

  it('rejects token requests when session is missing, user is forbidden, member left, or team mismatched', async () => {
    const {
      owner,
      members: [member]
    } = await getFakeUsers(1);

    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.token,
          isRoot: false
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);

    vi.spyOn(sessionService, 'authUserSession').mockRejectedValueOnce(ERROR_ENUM.unAuthorization);
    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.token,
          isRoot: false,
          sessionId: `${owner.userId}:expired`
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);

    // 即使该用户在另一个团队仍是 active，会话绑定团队的成员离职后也不能静默回退到其他团队。
    const otherTeam = await MongoTeam.create({ name: 'Other Team', ownerId: member.userId });
    await MongoTeamMember.create({
      teamId: otherTeam._id,
      userId: member.userId,
      status: TeamMemberStatusEnum.active,
      role: 'owner'
    });
    await MongoTeamMember.updateOne(
      { _id: member.tmbId },
      { $set: { status: TeamMemberStatusEnum.leave } }
    );

    await expect(
      getWhoamiDetail({
        certificate: {
          userId: member.userId,
          teamId: member.teamId,
          tmbId: member.tmbId,
          authType: AuthUserTypeEnum.token,
          isRoot: false,
          sessionCreatedAt: 1000
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);

    await MongoUser.updateOne(
      { _id: owner.userId },
      { $set: { status: UserStatusEnum.forbidden } }
    );
    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.token,
          isRoot: false,
          sessionCreatedAt: 1000
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
  });

  it('returns personal API Key details with masked secret, permissions, and quota calculations', async () => {
    const { owner } = await getFakeUsers(1);
    const expiredAt = new Date('2027-01-01T00:00:00.000Z');
    const keyDoc = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      type: ApiKeyTypeEnum.personal,
      apiKey: 'fastgpt-personal-secret-1234',
      name: 'Personal CI',
      authProxy: true,
      usagePoints: 300,
      limit: {
        expiredTime: expiredAt,
        maxUsagePoints: 1000
      }
    });

    const result = await getWhoamiDetail({
      certificate: {
        userId: owner.userId,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        authType: AuthUserTypeEnum.apikey,
        apiKeyId: String(keyDoc._id),
        apiKeyType: ApiKeyTypeEnum.personal,
        apiKeyAuthProxy: true,
        isRoot: false
      }
    });

    expect(result).toMatchObject({
      authType: AuthUserTypeEnum.apikey,
      apiKeyType: ApiKeyTypeEnum.personal,
      user: {
        userId: owner.userId
      },
      team: {
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        role: 'owner',
        permission: {
          isOwner: true,
          hasManagePer: true
        }
      },
      apiKey: {
        id: String(keyDoc._id),
        name: 'Personal CI',
        maskedKey: '******1234',
        authProxy: true,
        limit: {
          expiredTime: expiredAt.toISOString(),
          maxUsagePoints: 1000,
          usagePoints: 300,
          remainingPoints: 700
        }
      }
    });

    // 超额与零上限场景均需正确截断或保留 0，不能回落为 null。
    await MongoOpenApi.updateOne(
      { _id: keyDoc._id },
      { $set: { usagePoints: 1250, limit: { maxUsagePoints: 1000 } } }
    );
    const overUsed = await getWhoamiDetail({
      certificate: {
        userId: owner.userId,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        authType: AuthUserTypeEnum.apikey,
        apiKeyId: String(keyDoc._id),
        apiKeyType: ApiKeyTypeEnum.personal,
        isRoot: false
      }
    });
    expect(overUsed).toMatchObject({
      apiKey: {
        limit: {
          expiredTime: null,
          maxUsagePoints: 1000,
          usagePoints: 1250,
          remainingPoints: 0
        }
      }
    });

    // 个人 API Key 创建者离职后应被拒绝。
    await MongoTeamMember.updateOne(
      { _id: owner.tmbId },
      { $set: { status: TeamMemberStatusEnum.leave } }
    );
    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.apikey,
          apiKeyId: String(keyDoc._id),
          apiKeyType: ApiKeyTypeEnum.personal,
          isRoot: false
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);
  });

  it('returns app API Key details with boundApp info and null permission even after creator leaves', async () => {
    const {
      owner,
      members: [member]
    } = await getFakeUsers(1);
    const app = await MongoApp.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'Support Bot',
      type: AppTypeEnum.simple
    });
    const appKey = await MongoOpenApi.create({
      teamId: owner.teamId,
      tmbId: member.tmbId,
      type: ApiKeyTypeEnum.app,
      appId: String(app._id),
      apiKey: 'fastgpt-app-secret-9876',
      name: 'App Public Key',
      authProxy: true
    });

    // 应用 Key 创建者离职后，应用绑定 Key 仍可正常查询且不暴露成员权限。
    await MongoTeamMember.updateOne(
      { _id: member.tmbId },
      { $set: { status: TeamMemberStatusEnum.leave } }
    );

    const result = await getWhoamiDetail({
      certificate: {
        userId: member.userId,
        teamId: member.teamId,
        tmbId: member.tmbId,
        authType: AuthUserTypeEnum.apikey,
        apiKeyId: String(appKey._id),
        apiKeyType: ApiKeyTypeEnum.app,
        boundAppId: String(app._id),
        apiKeyAuthProxy: false,
        isRoot: false
      }
    });

    expect(result).toEqual({
      authType: AuthUserTypeEnum.apikey,
      apiKeyType: ApiKeyTypeEnum.app,
      user: {
        userId: member.userId,
        username: expect.any(String)
      },
      team: {
        teamId: member.teamId,
        teamName: expect.any(String),
        tmbId: member.tmbId,
        role: null,
        permission: null
      },
      apiKey: {
        id: String(appKey._id),
        name: 'App Public Key',
        maskedKey: '******9876',
        boundAppId: String(app._id),
        boundAppName: 'Support Bot',
        authProxy: false,
        limit: {
          expiredTime: null,
          maxUsagePoints: -1,
          usagePoints: 0,
          remainingPoints: null
        }
      }
    });

    // 绑定应用删除后，应用 Key 应被拒绝。
    await MongoApp.updateOne({ _id: app._id }, { $set: { deleteTime: new Date() } });
    await expect(
      getWhoamiDetail({
        certificate: {
          userId: member.userId,
          teamId: member.teamId,
          tmbId: member.tmbId,
          authType: AuthUserTypeEnum.apikey,
          apiKeyId: String(appKey._id),
          apiKeyType: ApiKeyTypeEnum.app,
          boundAppId: String(app._id),
          isRoot: false
        }
      })
    ).rejects.toBe(AppErrEnum.unExist);
  });

  it('rejects missing API Key records and unsupported auth types', async () => {
    const { owner } = await getFakeUsers(1);

    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.apikey,
          isRoot: false
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    await expect(
      getWhoamiDetail({
        certificate: {
          userId: owner.userId,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          authType: AuthUserTypeEnum.apikey,
          apiKeyId: new Types.ObjectId().toString(),
          isRoot: false
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthApiKey);

    await expect(
      getWhoamiDetail({
        certificate: {
          userId: '',
          teamId: '',
          tmbId: '',
          authType: AuthUserTypeEnum.root,
          isRoot: true
        }
      })
    ).rejects.toBe(ERROR_ENUM.unAuthorization);
  });
});

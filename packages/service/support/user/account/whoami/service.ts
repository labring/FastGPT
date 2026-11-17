import { SESSION_TTL_SECONDS } from '@fastgpt/dal/redis/caches';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { WhoamiResponseType } from '@fastgpt/global/openapi/support/user/account/whoami/api';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  TeamPermission,
  TeamPermissionSummarySchema
} from '@fastgpt/global/support/permission/user/controller';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { getAppByApiKey } from '../../../openapi/auth';
import { MongoOpenApi } from '../../../openapi/schema';
import { resolveApiKeyScope } from '../../../openapi/utils';
import type { AuthResponseType } from '../../../permission/type';
import { MongoUser } from '../../schema';
import { authUserSession } from '../../session';
import { getTmbInfoByTmbId } from '../../team/controller';
import { MongoTeamMember } from '../../team/teamMemberSchema';
import { MongoTeam } from '../../team/teamSchema';

/**
 * 根据已解析的认证凭据查询当前调用主体的完整身份、所属团队、权限摘要与限额信息。
 *
 * 按凭据类型分三条分支处理：
 * - `token`：严格校验会话对应的团队成员仍处于 active 且未被禁止；不回退到其他团队，避免跨团队错配。
 * - `apikey` + `personal`：校验归属用户与团队成员仍有效，并继承成员的团队权限摘要。
 * - `apikey` + `app`：仅校验绑定应用未删除及所属团队/成员记录存在，不要求创建者仍为 active，权限固定为 `null`。
 */
export async function getWhoamiDetail({
  certificate
}: {
  certificate: Omit<AuthResponseType, 'permission'>;
}): Promise<WhoamiResponseType> {
  // 历史库记录的 role 可能是旧值或空值，统一收窄为 owner 或 null，避免响应校验失败。
  const normalizeTeamMemberRole = (role: unknown): TeamMemberRoleEnum | null =>
    role === TeamMemberRoleEnum.owner ? TeamMemberRoleEnum.owner : null;

  // .lean() 查询不会触发 Mongoose getter，必须在此显式脱敏，绝不返回明文 API Key。
  const maskApiKey = (apiKey: string) => `******${apiKey.slice(-4)}`;

  const formatApiKeyLimit = (
    apiKeyDoc: Pick<OpenApiSchema, 'usagePoints' | 'limit'>
  ): {
    expiredTime: string | null;
    maxUsagePoints: number;
    usagePoints: number;
    remainingPoints: number | null;
  } => {
    const maxUsagePoints = apiKeyDoc.limit?.maxUsagePoints ?? -1;
    const usagePoints = apiKeyDoc.usagePoints ?? 0;
    const remainingPoints = maxUsagePoints < 0 ? null : Math.max(0, maxUsagePoints - usagePoints);
    const expiredTime = apiKeyDoc.limit?.expiredTime
      ? new Date(apiKeyDoc.limit.expiredTime).toISOString()
      : null;

    return {
      expiredTime,
      maxUsagePoints,
      usagePoints,
      remainingPoints
    };
  };

  if (certificate.authType === AuthUserTypeEnum.token) {
    // 1. 解析会话生命周期时间；优先复用 parseHeaderCert 已读取的 createdAt，避免重复访问 Redis。
    const createdAt = await (async () => {
      if (certificate.sessionCreatedAt !== undefined) {
        return certificate.sessionCreatedAt;
      }
      if (!certificate.sessionId) {
        return undefined;
      }
      try {
        const session = await authUserSession(certificate.sessionId);
        return session.createdAt;
      } catch {
        return undefined;
      }
    })();

    if (createdAt === undefined) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    const expiresAt = createdAt + SESSION_TTL_SECONDS * 1000;

    // 2. 严格校验当前会话绑定的用户与团队成员，不使用 getUserFallbackTeam 静默切换团队。
    const [user, tmb] = await Promise.all([
      MongoUser.findById(certificate.userId, 'username status').lean(),
      getTmbInfoByTmbId({ tmbId: certificate.tmbId }).catch(() => null)
    ]);

    if (
      !user ||
      user.status === UserStatusEnum.forbidden ||
      !tmb ||
      tmb.teamId !== certificate.teamId
    ) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // 3. Root 会话按团队所有者权限返回摘要，普通用户保留成员自身权限。
    const effectivePermission = certificate.isRoot
      ? new TeamPermission({ isOwner: true })
      : tmb.permission;

    return {
      authType: AuthUserTypeEnum.token,
      user: {
        userId: String(user._id),
        username: user.username,
        avatar: tmb.avatar
      },
      team: {
        teamId: tmb.teamId,
        teamName: tmb.teamName,
        tmbId: tmb.tmbId,
        role: normalizeTeamMemberRole(tmb.role),
        permission: TeamPermissionSummarySchema.parse(effectivePermission)
      },
      isRoot: certificate.isRoot,
      session: {
        createdAt,
        expiresAt
      }
    };
  }

  if (certificate.authType === AuthUserTypeEnum.apikey) {
    // 1. 读取 API Key 记录并确定密钥范围（personal / app）。
    if (!certificate.apiKeyId) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const apiKeyDoc = await MongoOpenApi.findById(
      certificate.apiKeyId,
      'name apiKey type appId authProxy usagePoints limit'
    ).lean();
    if (!apiKeyDoc) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const apiKeyType = certificate.apiKeyType ?? resolveApiKeyScope(apiKeyDoc).type;

    // 2. 应用 Key 独立于创建者成员的活跃状态与 ACL，但绑定应用和归属团队必须有效。
    if (apiKeyType === ApiKeyTypeEnum.app) {
      const boundApp = await getAppByApiKey({
        teamId: certificate.teamId,
        boundAppId: certificate.boundAppId ?? apiKeyDoc.appId?.toLowerCase()
      });

      const [user, team, tmb] = await Promise.all([
        MongoUser.findById(certificate.userId, 'username').lean(),
        MongoTeam.findOne({ _id: certificate.teamId, deleteTime: null }, 'name').lean(),
        MongoTeamMember.findOne(
          { _id: certificate.tmbId, teamId: certificate.teamId },
          'role'
        ).lean()
      ]);

      if (!user || !team || !tmb) {
        return Promise.reject(ERROR_ENUM.unAuthApiKey);
      }

      return {
        authType: AuthUserTypeEnum.apikey,
        apiKeyType: ApiKeyTypeEnum.app,
        user: {
          userId: String(user._id),
          username: user.username
        },
        team: {
          teamId: String(team._id),
          teamName: team.name,
          tmbId: String(tmb._id),
          role: normalizeTeamMemberRole(tmb.role),
          permission: null
        },
        apiKey: {
          id: String(apiKeyDoc._id),
          name: apiKeyDoc.name ?? 'Api Key',
          maskedKey: maskApiKey(apiKeyDoc.apiKey ?? ''),
          boundAppId: String(boundApp._id),
          boundAppName: boundApp.name,
          authProxy: false,
          limit: formatApiKeyLimit(apiKeyDoc)
        }
      };
    }

    // 3. 个人 API Key 依赖创建者成员在当前团队内仍处于有效状态，并继承其团队权限。
    const [user, tmb] = await Promise.all([
      MongoUser.findById(certificate.userId, 'username status').lean(),
      getTmbInfoByTmbId({ tmbId: certificate.tmbId }).catch(() => null)
    ]);

    if (
      !user ||
      user.status === UserStatusEnum.forbidden ||
      !tmb ||
      tmb.teamId !== certificate.teamId
    ) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    return {
      authType: AuthUserTypeEnum.apikey,
      apiKeyType: ApiKeyTypeEnum.personal,
      user: {
        userId: String(user._id),
        username: user.username
      },
      team: {
        teamId: tmb.teamId,
        teamName: tmb.teamName,
        tmbId: tmb.tmbId,
        role: normalizeTeamMemberRole(tmb.role),
        permission: TeamPermissionSummarySchema.parse(tmb.permission)
      },
      apiKey: {
        id: String(apiKeyDoc._id),
        name: apiKeyDoc.name ?? 'Api Key',
        maskedKey: maskApiKey(apiKeyDoc.apiKey ?? ''),
        authProxy: certificate.apiKeyAuthProxy ?? !!apiKeyDoc.authProxy,
        limit: formatApiKeyLimit(apiKeyDoc)
      }
    };
  }

  return Promise.reject(ERROR_ENUM.unAuthorization);
}

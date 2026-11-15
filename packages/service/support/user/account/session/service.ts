import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import { SESSION_CONTEXT_HEADER } from '@fastgpt/global/support/user/session/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import type { NodeHttpRequest, NodeHttpResponse } from '../../../../types/http';
import { MongoUser } from '../../schema';
import { MongoTeam } from '../../team/teamSchema';
import { MongoTeamMember } from '../../team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { withUserLock } from '../../lock';
import { delUserAllSession, sessionTokenCache, userSessionTokenService } from '../../session';
import { assertUserCanLogin } from '../cancellation/guard';
import { authCert, clearCookie } from '../../../permission/auth/common';
import {
  isNativeSessionTransport,
  readSelectedSessionCookies,
  assertSessionContext
} from '../../session/http';

/** 仅从当前客户端约定的传输通道获取凭证，拒绝浏览器 Body 中的 Refresh。 */
export const readSessionCredentials = async (req: NodeHttpRequest, bodyRefreshToken?: string) => {
  const native = isNativeSessionTransport(req);
  if (bodyRefreshToken && !native) throw new Error(SessionErrEnum.refreshInvalid);
  const cookies: { accessToken?: string; refreshToken?: string } = native
    ? {}
    : await readSelectedSessionCookies(req);
  const accessToken =
    typeof req.headers.token === 'string' ? req.headers.token : cookies.accessToken;
  return { native, accessToken, refreshToken: native ? bodyRefreshToken : cookies.refreshToken };
};

/** 校验账户与绑定团队仍有效；pending 注销允许进入账户自助页面，finalizing 不可续约。 */
export const refreshUserSession = async ({
  refreshToken,
  accessToken,
  expectedContext
}: {
  refreshToken: string;
  accessToken?: string;
  expectedContext?: string | string[];
}) => {
  const identity = await userSessionTokenService.verifyRefresh(refreshToken);
  assertSessionContext(expectedContext, identity);
  return withUserLock({ userId: identity.userId, waitTimeoutMs: 8000 }, async ({ assertValid }) => {
    const data = await userSessionTokenService.verifyRefresh(refreshToken);
    assertSessionContext(expectedContext, data);
    const [user, member, team] = await Promise.all([
      MongoUser.findById(data.userId, 'username status').lean(),
      MongoTeamMember.findOne(
        {
          _id: data.tmbId,
          userId: data.userId,
          teamId: data.teamId,
          status: TeamMemberStatusEnum.active
        },
        '_id'
      ).lean(),
      MongoTeam.findOne({ _id: data.teamId, deleteTime: null }, '_id').lean()
    ]);
    if (
      !user ||
      user.status === UserStatusEnum.forbidden ||
      !member ||
      !team ||
      (data.isRoot && user.username !== 'root')
    ) {
      await sessionTokenCache.delete(data.sessionId);
      throw new Error(SessionErrEnum.revoked);
    }
    if (!data.isRoot) await assertUserCanLogin(data.userId);
    assertValid();
    return userSessionTokenService.refresh({ refreshToken, accessToken });
  });
};

/** 全设备退出在用户锁内重新认证，拒绝等待期间已被改密或切团队替换的凭证。 */
export const logoutUserSessions = async ({
  req,
  res,
  bodyRefreshToken
}: {
  req: NodeHttpRequest;
  res: NodeHttpResponse;
  bodyRefreshToken?: string;
}) => {
  let clearCredentials = true;
  try {
    const { refreshToken } = await readSessionCredentials(req, bodyRefreshToken);
    const authenticate = async () => {
      const identity = refreshToken
        ? await userSessionTokenService.authRefreshForRevocation(refreshToken)
        : await authCert({ req, authToken: true, allowAccountCancellation: true });
      assertSessionContext(req.headers[SESSION_CONTEXT_HEADER], {
        sessionId: identity.sessionId ?? '',
        contextVersion:
          'contextVersion' in identity ? identity.contextVersion : identity.session?.contextVersion
      });
      return identity;
    };
    const identity = await authenticate();
    const userId = identity.userId;
    await withUserLock({ userId, waitTimeoutMs: 8000 }, async ({ assertValid }) => {
      // 等锁前的认证仅确定锁归属；新上下文生效后，旧请求不能继续撤销新凭证。
      await authenticate();
      assertValid();
      await delUserAllSession(userId);
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : error;
    if (reason === SessionErrEnum.contextChanged) {
      clearCredentials = false;
      throw error;
    }
    if (
      reason !== ERROR_ENUM.unAuthorization &&
      !Object.values(SessionErrEnum).includes(reason as SessionErrEnum)
    )
      throw error;
  } finally {
    if (clearCredentials) clearCookie(res, req);
    res.setHeader('Cache-Control', 'no-store');
  }
};

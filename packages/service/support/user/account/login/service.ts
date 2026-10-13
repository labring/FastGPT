import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type { FastGPTSemType } from '@fastgpt/global/support/marketing/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { getUserDetail } from '../../controller';
import { createUserLoginTeam } from '../../team/controller';
import { assertUserCanLogin } from '../cancellation/guard';
import type { ClientSession } from '../../../../common/mongo';
import type { PasswordVerificationUser } from '../verification/password/type';
import { reportCRMVisitorIdentity, resolveCRMVisitorId } from '../../../marketing/attribution';
import { createUserSession } from '../../session';
import { setCookie } from '../../../permission/auth/common';
import { getClientIpFromRequest } from '../../../../common/security/clientIp';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { addAuditLog } from '../../audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { NodeHttpRequest, NodeHttpResponse } from '../../../../types/http';
import { MongoUser } from '../../schema';

/**
 * 登录流程内部传递的用户文档类型。
 * 密码比对只发生在 passwordVerificationService 内部（由 Mongo 查询直接匹配散列），
 * 登录策略校验、团队加载和 Session 创建都不需要密码，因此显式排除 password，
 * 避免调用方误以为这里能读到密码散列。
 */
export type PasswordLoginUser = Omit<PasswordVerificationUser, 'password'>;

/**
 * 校验密码登录用户是否可以继续进入普通登录或二次验证阶段。
 * 该检查必须发生在创建登录 Challenge 之前，避免禁用账号获得可继续使用的 Challenge。
 */
export const assertPasswordLoginUser = async ({ user }: { user: PasswordLoginUser }) => {
  if (user.status === UserStatusEnum.forbidden) {
    return Promise.reject('Invalid account!');
  }

  if (user.username.startsWith('wecom-')) {
    return Promise.reject(new UserError('Wecom user can not login with password'));
  }

  await assertUserCanLogin(String(user._id));
};

/**
 * 根据登录 Challenge 中的用户 ID 加载用户，并把不存在的用户按失效验证材料处理。
 * 用户名不会从浏览器请求恢复，调用方必须使用 Challenge 内保存的用户名继续登录。
 *
 * 二次验证通过时密码早已校验完毕，这里不再 select('+password')，
 * 避免把密码散列无谓地载入内存。
 */
export const getPasswordLoginUser = async ({
  userId,
  session
}: {
  userId: string;
  session: ClientSession;
}): Promise<PasswordLoginUser> => {
  const user = await MongoUser.findById(userId).session(session);
  if (!user) {
    throw new UserError(UserErrEnum.invalidVerificationCode);
  }
  return user;
};

/**
 * 在登录事务中加载用户团队、更新登录偏好和 CRM 访客归属。
 * 不创建 Session 或 Cookie，调用方可在 Challenge 验证成功后复用该事务逻辑。
 */
export const completePasswordLogin = async ({
  user,
  username,
  language,
  fastgpt_sem,
  session
}: {
  user: PasswordLoginUser;
  username: string;
  language: `${LangEnum}`;
  fastgpt_sem?: FastGPTSemType;
  session: ClientSession;
}) => {
  await assertPasswordLoginUser({ user });

  const userDetail = await getUserDetail({
    tmbId: user.lastLoginTmbId,
    userId: user._id,
    isRoot: username === 'root',
    session,
    createTeamIfUnavailable:
      username !== 'root' && global.systemConfig?.teamMode === 'multi'
        ? ({ userId, session: teamSession }) =>
            createUserLoginTeam({
              userId,
              username: user.username,
              session: teamSession as ClientSession
            })
        : undefined
  });

  user.lastLoginTmbId = userDetail.team.tmbId;
  user.language = language;
  const visitorIdentity = resolveCRMVisitorId({
    storedFastgptSem: user.fastgpt_sem,
    incomingVisitorId: fastgpt_sem?.visitor_id
  });
  if (visitorIdentity.shouldPersist) {
    user.fastgpt_sem = visitorIdentity.fastgptSem;
  }
  await user.save({ session });

  return { user, userDetail, visitorIdentity };
};

/**
 * 在登录事务提交后创建 Session、写入 Cookie 并执行登录相关外部副作用。
 * 外部副作用不参与 Challenge 或验证码材料事务，避免事务重试造成重复上报。
 */
export const finishPasswordLogin = async ({
  user,
  userDetail,
  visitorIdentity,
  username,
  req,
  res
}: {
  user: PasswordLoginUser;
  userDetail: Awaited<ReturnType<typeof getUserDetail>>;
  visitorIdentity: ReturnType<typeof resolveCRMVisitorId>;
  username: string;
  req: NodeHttpRequest;
  res: NodeHttpResponse;
}) => {
  const token = await createUserSession({
    userId: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId,
    isRoot: username === 'root',
    ip: getClientIpFromRequest(req)
  });

  setCookie(res, token);

  void reportCRMVisitorIdentity({
    visitorId: visitorIdentity.visitorId,
    userId: String(user._id),
    username: user.username,
    contact: user.contact ?? undefined
  });

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId
  });
  void addAuditLog({
    tmbId: userDetail.team.tmbId,
    teamId: userDetail.team.teamId,
    event: AuditEventEnum.LOGIN
  });

  return {
    user: userDetail,
    token
  };
};

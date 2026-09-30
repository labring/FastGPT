import { randomBytes } from 'node:crypto';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { TmpDataEnum, TmpDataExpireTime } from '@fastgpt/global/support/tmpData/constants';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../../common/mongo';
import { MongoTmpData } from '../../../tmpData/schema';
import { MongoUser } from '../../schema';
import {
  isPasswordAvailableForUsername,
  isSsoPasswordPolicyEnabled,
  isSsoUsername
} from '@fastgpt/global/support/user/account/password/utils';

export const PASSWORD_CHANGE_SESSION_TTL_SECONDS = 5 * 60;

type PasswordChangeSessionData = {
  userId: string;
  loginSessionId: string;
};

/** 当前运行时是否开启 SSO 用户禁用密码策略。判定口径由 global 统一提供，此处只负责注入运行时配置。 */
export const isSsoPasswordDisabled = () => isSsoPasswordPolicyEnabled(global.feConfigs?.sso);

/** 使用共享账号分类规则判断持久化 username 是否属于当前 SSO 环境。 */
export const isSsoUserByUsername = (username: string) =>
  isSsoUsername(username, global.feConfigs?.sso);

/** 返回当前运行时中指定账号是否允许使用或维护平台密码。 */
export const getUserPasswordAvailability = (username: string) =>
  isPasswordAvailableForUsername(username, global.feConfigs?.sso);

/** 在密码比对或最终写入前拒绝受限 SSO 用户。 */
export const assertUserPasswordAvailable = (username: string) => {
  if (!getUserPasswordAvailability(username)) {
    throw new UserError(UserErrEnum.ssoPasswordUnavailable);
  }
};

type PasswordChangeSession = {
  sessionId: string;
  expiredAt: string;
};

const getPasswordChangeSessionDataId = (sessionId: string) =>
  `${TmpDataEnum.PasswordChangeSession}--${hashStr(sessionId)}`;

/** 创建绑定当前用户和当前登录 Session 的一次性改密 Session，原始值只返回给前端。 */
export const createPasswordChangeSession = async ({
  userId,
  loginSessionId,
  session
}: PasswordChangeSessionData & { session?: ClientSession }): Promise<PasswordChangeSession> => {
  const sessionId = randomBytes(32).toString('base64url');
  const expiredAt = new Date(Date.now() + TmpDataExpireTime[TmpDataEnum.PasswordChangeSession]);

  await MongoTmpData.create(
    [
      {
        dataId: getPasswordChangeSessionDataId(sessionId),
        data: { userId, loginSessionId },
        expireAt: expiredAt
      }
    ],
    { session }
  );

  return { sessionId, expiredAt: expiredAt.toISOString() };
};

/**
 * 在同一 Mongo 事务中校验改密 Session、更新密码并消费 Session。
 * 只有密码更新和凭证删除都成功，事务才会提交，避免凭证被提前消费或重复使用。
 */
export const updatePasswordWithChangeSession = async ({
  sessionId,
  userId,
  loginSessionId,
  newPassword
}: PasswordChangeSessionData & {
  sessionId: string;
  newPassword: string;
}) =>
  mongoSessionRun(async (session) => {
    const dataId = getPasswordChangeSessionDataId(sessionId);
    const record = await MongoTmpData.findOne({
      dataId,
      expireAt: { $gt: new Date() },
      'data.userId': userId,
      'data.loginSessionId': loginSessionId
    })
      .session(session)
      .lean();

    if (!record) throw new UserError(UserErrEnum.passwordChangeAuthorizationInvalid);

    await assertNewPasswordDiffersFromCurrent({ userId, newPassword, session });

    const updateResult = await MongoUser.updateOne(
      { _id: userId },
      {
        $set: {
          password: newPassword,
          passwordUpdateTime: new Date()
        }
      },
      { session }
    );
    if (updateResult.matchedCount !== 1) throw new Error('Failed to update password');

    const deleted = await MongoTmpData.deleteOne(
      {
        dataId,
        expireAt: { $gt: new Date() },
        'data.userId': userId,
        'data.loginSessionId': loginSessionId
      },
      { session }
    );
    if (deleted.deletedCount !== 1) {
      throw new UserError(UserErrEnum.passwordChangeAuthorizationInvalid);
    }
  });

/** 拒绝将当前持久化密码再次设置为新密码。Schema setter 负责沿用现有双层哈希协议。 */
export const assertNewPasswordDiffersFromCurrent = async ({
  userId,
  newPassword,
  session
}: {
  userId: string;
  newPassword: string;
  session?: ClientSession;
}) => {
  const query = MongoUser.exists({ _id: userId, password: newPassword });
  if (session) query.session(session);
  if (await query) throw new UserError(UserErrEnum.newPasswordSameAsOld);
};

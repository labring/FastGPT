import { randomBytes } from 'node:crypto';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { TmpDataEnum, TmpDataExpireTime } from '@fastgpt/global/support/tmpData/constants';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../../common/mongo';
import { MongoTmpData } from '../../../tmpData/schema';
import { MongoUser } from '../../schema';

export const PASSWORD_CHANGE_SESSION_TTL_SECONDS = 5 * 60;

type PasswordChangeSessionData = {
  userId: string;
  loginSessionId: string;
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
  loginSessionId
}: PasswordChangeSessionData): Promise<PasswordChangeSession> => {
  const sessionId = randomBytes(32).toString('base64url');
  const expiredAt = new Date(Date.now() + TmpDataExpireTime[TmpDataEnum.PasswordChangeSession]);

  await MongoTmpData.create({
    dataId: getPasswordChangeSessionDataId(sessionId),
    data: { userId, loginSessionId },
    expireAt: expiredAt
  });

  return { sessionId, expiredAt: expiredAt.toISOString() };
};

/**
 * 在同一 Mongo 事务中校验并消费改密 Session，同时执行密码更新。
 * 改密 Session 绑定当前登录端且只在密码更新成功后删除，避免并发重放和失败误消费。
 */
export const consumePasswordChangeSessionInTransaction = async <T>({
  sessionId,
  userId,
  loginSessionId,
  newPassword,
  handler
}: PasswordChangeSessionData & {
  sessionId: string;
  newPassword: string;
  handler: (session: ClientSession) => Promise<T>;
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
    const result = await handler(session);
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

    return result;
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

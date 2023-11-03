import { MongoUser } from './schema';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { parseHeaderAuth } from '../permission/controller';
import { AuthModeType } from '../permission/type';

/* auth balance */
export const authBalanceByUid = async (uid: string) => {
  const user = await MongoUser.findById<UserModelSchema>(
    uid,
    '_id username balance openaiAccount timezone'
  );
  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  if (user.balance <= 0) {
    return Promise.reject(ERROR_ENUM.insufficientQuota);
  }
  return user;
};

/* uniform auth user */
export const authUser = async ({
  authBalance = false,
  ...props
}: AuthModeType & {
  authBalance?: boolean;
}) => {
  const result = await parseHeaderAuth(props);

  return result;
};

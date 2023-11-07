import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserType } from '@fastgpt/global/support/user/type';
import { getUserDetail } from '@/service/support/user/controller';

export async function getUserAndAuthBalance({
  tmbId,
  minBalance
}: {
  tmbId: string;
  minBalance?: number;
}) {
  const user = await getUserDetail({ tmbId });

  if (!user) {
    return Promise.reject(UserErrEnum.unAuthUser);
  }
  if (minBalance !== undefined && global.feConfigs.isPlus && user.team.balance < minBalance) {
    return Promise.reject(UserErrEnum.balanceNotEnough);
  }

  return user;
}

/* get user */
export async function authUser({
  minBalance,
  ...props
}: AuthModeType & {
  minBalance?: number;
}): Promise<
  AuthResponseType & {
    user: UserType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);

  return {
    userId,
    teamId,
    tmbId,
    user: await getUserAndAuthBalance({ tmbId, minBalance }),
    isOwner: true,
    canWrite: true
  };
}

import type { ClientSession } from '../../../common/mongo';
import { MongoUser } from '../schema';
import { touchUserCapacityGuard } from './entity';

/** Re-check license capacity inside the same transaction that creates users. */
export const reserveUserCreateCapacity = async ({
  additionalUsers,
  session
}: {
  additionalUsers: number;
  session: ClientSession;
}) => {
  if (additionalUsers <= 0) return;
  await touchUserCapacityGuard(session);
  const maxUsers = global.licenseData?.maxUsers;
  if (!maxUsers) return;
  const usersCount = await MongoUser.countDocuments({}).session(session);
  if (usersCount + additionalUsers > maxUsers) {
    throw new Error('LICENSE_USER_LIMIT');
  }
};

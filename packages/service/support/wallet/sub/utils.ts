import { SubStatusEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';

/* get team dataset size */
export const getTeamDatasetValidSub = async ({
  teamId,
  freeSize = Infinity
}: {
  teamId: string;
  freeSize?: number;
}) => {
  const sub = await MongoTeamSub.findOne({
    teamId,
    status: SubStatusEnum.active
  })
    .sort({
      expiredTime: -1
    })
    .lean();

  const maxSize = (() => {
    if (!sub || !sub.datasetStoreAmount) return freeSize;

    return sub.datasetStoreAmount + freeSize;
  })();

  return {
    maxSize,
    sub
  };
};

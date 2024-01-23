import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
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
    type: SubTypeEnum.extraDatasetSize,
    expiredTime: { $gte: new Date() }
  }).lean();

  const maxSize = (() => {
    if (!sub || !sub.currentExtraDatasetSize) return freeSize;

    return sub.currentExtraDatasetSize + freeSize;
  })();

  return {
    maxSize,
    sub
  };
};

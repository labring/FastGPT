import { StandSubPlanLevelMapType } from '@fastgpt/global/support/wallet/sub/type';
import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';
import { getTeamDatasetMaxSize } from '../../wallet/sub/utils';

export const checkDatasetLimit = async ({
  teamId,
  insertLen = 0,
  standardPlans
}: {
  teamId: string;
  insertLen?: number;
  standardPlans?: StandSubPlanLevelMapType;
}) => {
  const [{ maxSize }, usedSize] = await Promise.all([
    getTeamDatasetMaxSize({ teamId, standardPlans }),
    getVectorCountByTeamId(teamId)
  ]);

  if (usedSize + insertLen >= maxSize) {
    return Promise.reject(`数据库容量不足，无法继续添加。可以在账号页面进行扩容。`);
  }
  return;
};

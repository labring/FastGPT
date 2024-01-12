import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';
import { getTeamDatasetValidSub } from '../../wallet/sub/utils';

export const checkDatasetLimit = async ({
  teamId,
  freeSize = Infinity,
  insertLen = 0
}: {
  teamId: string;
  freeSize?: number;
  insertLen?: number;
}) => {
  const { maxSize } = await getTeamDatasetValidSub({ teamId, freeSize });
  const usedSize = await getVectorCountByTeamId(teamId);

  if (usedSize + insertLen >= maxSize) {
    return Promise.reject(`数据库容量已满，无法继续添加。可以在账号页面进行扩容。`);
  }
  return;
};

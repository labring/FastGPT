/* vector crud */
import { PgVectorCtrl } from './pg/class';
import { ObVectorCtrl } from './oceanbase/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { DelDatasetVectorCtrlProps, InsertVectorProps } from './controller.d';
import { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS } from './constants';
import { MilvusCtrl } from './milvus/class';
import { getGlobalRedisCacheConnection, checkAndIncr } from '../redis';

const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();

  return new PgVectorCtrl();
};

const Vector = getVectorObj();

const redis = getGlobalRedisCacheConnection();

export const initVectorStore = Vector.init;
export const recallFromVectorStore = Vector.embRecall;
export const getVectorDataByTime = Vector.getVectorDataByTime;

export const getVectorCountByTeamId = async (teamId: string) => {
  const countStr = await redis.getex(`countByTeamId:${teamId}`, 'EX', 1800);
  if (!countStr) {
    return await initCache(teamId);
  }
  return parseInt(countStr);
};
export const getVectorCountByDatasetId = Vector.getVectorCountByDatasetId;
export const getVectorCountByCollectionId = Vector.getVectorCountByCollectionId;

async function initCache(teamId: string) {
  const count = await Vector.getVectorCountByTeamId(teamId);
  await redis.setex(`countByTeamId:${teamId}`, 1800, count);
  return count;
}

export const insertDatasetDataVector = async ({
  model,
  query,
  ...props
}: InsertVectorProps & {
  query: string;
  model: EmbeddingModelItemType;
}) => {
  const { vectors, tokens } = await getVectorsByText({
    model,
    input: query,
    type: 'db'
  });
  const { insertId } = await Vector.insert({
    ...props,
    vector: vectors[0]
  });

  await checkAndIncr(redis, `countByTeamId:${props.teamId}`);

  return {
    tokens,
    insertId
  };
};

export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlProps) => {
  const result = await Vector.delete(props);
  await initCache(props.teamId);
  return result;
};

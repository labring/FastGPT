/* vector crud */
import { PgVectorCtrl } from './pg/class';
import { ObVectorCtrl } from './oceanbase/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { DelDatasetVectorCtrlProps, InsertVectorProps } from './controller.d';
import { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS } from './constants';
import { MilvusCtrl } from './milvus/class';
import { setRedisCache, getRedisCache, delRedisCache, CacheKeyEnum } from '../redis/cache';

const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();

  return new PgVectorCtrl();
};
const getChcheKey = (teamId: string) => `${CacheKeyEnum.team_vector_count}:${teamId}`;

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const recallFromVectorStore = Vector.embRecall;
export const getVectorDataByTime = Vector.getVectorDataByTime;

export const getVectorCountByTeamId = async (teamId: string) => {
  const key = getChcheKey(teamId);

  const countStr = await getRedisCache(key);
  if (countStr) {
    return Number(countStr);
  }

  const count = await Vector.getVectorCountByTeamId(teamId);

  await setRedisCache(key, count, 30 * 60);

  return count;
};

export const getVectorCountByDatasetId = Vector.getVectorCountByDatasetId;
export const getVectorCountByCollectionId = Vector.getVectorCountByCollectionId;

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

  delRedisCache(getChcheKey(props.teamId));

  return {
    tokens,
    insertId
  };
};

export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlProps) => {
  const result = await Vector.delete(props);
  delRedisCache(getChcheKey(props.teamId));
  return result;
};

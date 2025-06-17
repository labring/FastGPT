/* vector crud */
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { getVectorsByText } from '../../core/ai/embedding';
import { type DelDatasetVectorCtrlProps, type InsertVectorProps } from './controller.d';
import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS } from './constants';
import { MilvusCtrl } from './milvus';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  incrValueToCache,
  CacheKeyEnum,
  CacheKeyEnumTime
} from '../redis/cache';
import { throttle } from 'lodash';
import { retryFn } from '@fastgpt/global/common/system/utils';

const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();

  return new PgVectorCtrl();
};

const getChcheKey = (teamId: string) => `${CacheKeyEnum.team_vector_count}:${teamId}`;
const onDelCache = throttle((teamId: string) => delRedisCache(getChcheKey(teamId)), 30000, {
  leading: true,
  trailing: true
});
const onIncrCache = (teamId: string) => incrValueToCache(getChcheKey(teamId), 1);

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

  await setRedisCache(key, count, CacheKeyEnumTime.team_vector_count);

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
  return retryFn(async () => {
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: query,
      type: 'db'
    });
    const { insertId } = await Vector.insert({
      ...props,
      vector: vectors[0]
    });

    onIncrCache(props.teamId);

    return {
      tokens,
      insertId
    };
  });
};

export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlProps) => {
  const result = await Vector.delete(props);
  onDelCache(props.teamId);
  return result;
};

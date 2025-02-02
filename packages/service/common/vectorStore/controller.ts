/* vector crud */
import { PgVectorCtrl } from './pg/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { InsertVectorProps } from './controller.d';
import { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, MOCHOW_ADDRESS, PG_ADDRESS } from './constants';
import { MilvusCtrl } from './milvus/class';
import { MochowCtrl } from './mochow/class';

const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();
  if (MOCHOW_ADDRESS) return new MochowCtrl();

  return new PgVectorCtrl();
};

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const deleteDatasetDataVector = Vector.delete;
export const recallFromVectorStore = Vector.embRecall;
export const getVectorDataByTime = Vector.getVectorDataByTime;
export const getVectorCountByTeamId = Vector.getVectorCountByTeamId;
export const getVectorCountByDatasetId = Vector.getVectorCountByDatasetId;

export const insertDatasetDataVector = async ({
  model,
  query,
  ...props
}: InsertVectorProps & {
  query: string;
  model: VectorModelItemType;
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

  return {
    tokens,
    insertId
  };
};

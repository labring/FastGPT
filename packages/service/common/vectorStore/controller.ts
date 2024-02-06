/* vector crud */
import { PgVector } from './pg/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { InsertVectorProps } from './controller.d';
import { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';

const getVectorObj = () => {
  return new PgVector();
};

export const initVectorStore = getVectorObj().init;
export const deleteDatasetDataVector = getVectorObj().delete;
export const recallFromVectorStore = getVectorObj().recall;
export const checkVectorDataExist = getVectorObj().checkDataExist;
export const getVectorDataByTime = getVectorObj().getVectorDataByTime;
export const getVectorCountByTeamId = getVectorObj().getVectorCountByTeamId;

export const insertDatasetDataVector = async ({
  model,
  query,
  ...props
}: InsertVectorProps & {
  query: string;
  model: VectorModelItemType;
}) => {
  const { vectors, charsLength } = await getVectorsByText({
    model,
    input: query
  });
  const { insertId } = await getVectorObj().insert({
    ...props,
    vectors
  });

  return {
    charsLength,
    insertId
  };
};

export const updateDatasetDataVector = async ({
  id,
  ...props
}: InsertVectorProps & {
  id: string;
  query: string;
  model: VectorModelItemType;
}) => {
  // insert new vector
  const { charsLength, insertId } = await insertDatasetDataVector(props);

  // delete old vector
  await deleteDatasetDataVector({
    teamId: props.teamId,
    id
  });

  return { charsLength, insertId };
};

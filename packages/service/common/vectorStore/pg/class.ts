import {
  initPg,
  insertDatasetDataVector,
  deleteDatasetDataVector,
  embeddingRecall,
  getVectorDataByTime,
  getVectorCountByTeamId
} from './controller';

export class PgVector {
  constructor() {}
  init = initPg;
  insert = insertDatasetDataVector;
  delete = deleteDatasetDataVector;
  recall = embeddingRecall;
  getVectorCountByTeamId = getVectorCountByTeamId;
  getVectorDataByTime = getVectorDataByTime;
}

import {
  initPg,
  insertDatasetDataVector,
  updateDatasetDataVector,
  deleteDatasetDataVector,
  embeddingRecall,
  getVectorDataByTime,
  getVectorCountByTeamId
} from './controller';

export class PgVector {
  constructor() {}
  init = initPg;
  insert = insertDatasetDataVector;
  update = updateDatasetDataVector;
  delete = deleteDatasetDataVector;
  recall = embeddingRecall;
  getVectorCountByTeamId = getVectorCountByTeamId;
  getVectorDataByTime = getVectorDataByTime;
}

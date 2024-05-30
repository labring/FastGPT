import {
  initPg,
  insertDatasetDataVector,
  deleteDatasetDataVector,
  embeddingRecall,
  getVectorDataByTime,
  getVectorCountByTeamId
} from './controller';

export class PgVectorCtrl {
  constructor() {}
  init = initPg;
  insert = insertDatasetDataVector;
  delete = deleteDatasetDataVector;
  embRecall = embeddingRecall;
  getVectorCountByTeamId = getVectorCountByTeamId;
  getVectorDataByTime = getVectorDataByTime;
}

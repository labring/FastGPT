import { defineIndex, getMongoModel, Schema } from '../../common/mongo';
import type { TmpDataSchema as SchemaType } from '@fastgpt/global/support/tmpData/type';
import { getLogger, LogCategories } from '../../common/logger';

const collectionName = 'tmp_datas';

const TmpDataSchema = new Schema({
  dataId: {
    type: String,
    required: true
  },
  data: {
    type: Object
  },
  expireAt: {
    type: Date,
    required: true
  }
});

try {
  defineIndex(TmpDataSchema, {
    key: { dataId: 1 },
    options: { unique: true }
  });
  defineIndex(TmpDataSchema, { key: { dataId: -1 } });
  defineIndex(TmpDataSchema, {
    key: { expireAt: -1 },
    options: { expireAfterSeconds: 5 }
  });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build tmp data indexes', { error });
}

export const MongoTmpData = getMongoModel<SchemaType<object>>(collectionName, TmpDataSchema);

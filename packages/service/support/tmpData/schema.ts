import { defineIndex, getMongoModel, Schema } from '../../common/mongo';
import type { TmpDataSchema as SchemaType } from '@fastgpt/global/support/tmpData/type';

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

defineIndex(TmpDataSchema, {
  key: { dataId: 1 },
  options: { unique: true }
});
defineIndex(TmpDataSchema, { key: { dataId: -1 } });
defineIndex(TmpDataSchema, {
  key: {
    'data.teamId': 1,
    'data.tmbId': 1
  },
  options: {
    partialFilterExpression: {
      'data.teamId': { $exists: true },
      'data.tmbId': { $exists: true }
    }
  }
});
defineIndex(TmpDataSchema, {
  key: { expireAt: -1 },
  options: { expireAfterSeconds: 5 }
});

export const MongoTmpData = getMongoModel<SchemaType<object>>(collectionName, TmpDataSchema);

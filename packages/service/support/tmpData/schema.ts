import { getMongoModel, Schema } from '../../common/mongo';
import type { TmpDataSchema as SchemaType } from '@fastgpt/global/support/tmpData/type';

const collectionName = 'tmp_datas';

const TmpDataSchema = new Schema({
  dataId: {
    type: String,
    required: true,
    unique: true
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
  TmpDataSchema.index({ dataId: -1 });
  TmpDataSchema.index({ expireAt: -1 }, { expireAfterSeconds: 5 });
} catch (error) {
  console.log(error);
}

export const MongoTmpData = getMongoModel<SchemaType<Object>>(collectionName, TmpDataSchema);

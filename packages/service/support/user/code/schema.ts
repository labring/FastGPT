import { CodeModelSchema } from '@fastgpt/global/support/user/code/type';
import { type Model, connectionMongo } from '../../../common/mongo';
import { addMinutes } from 'date-fns';
const { Schema, model, models } = connectionMongo;

export const codesCollectionName = 'codes';

const CodeSchema = new Schema({
  openid: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  expireTime: {
    type: Date,
    default: () => addMinutes(new Date(), 5)
  }
});

export const MongoCode: Model<CodeModelSchema> =
  models[codesCollectionName] || model(codesCollectionName, CodeSchema);

MongoCode.syncIndexes();

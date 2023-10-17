import { connectionMongo, type Model } from '@fastgpt/service/common/mongo';
const { Schema, model, models } = connectionMongo;
import { CollectionSchema as CollectionType } from '@/types/mongoSchema';

const CollectionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  }
});

export const Collection: Model<CollectionType> =
  models['collection'] || model('collection', CollectionSchema);

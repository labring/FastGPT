import { Schema, model, models, Model as MongoModel } from 'mongoose';
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

export const Collection: MongoModel<CollectionType> =
  models['collection'] || model('collection', CollectionSchema);

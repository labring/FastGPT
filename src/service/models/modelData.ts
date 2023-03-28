/* 模型的知识库 */
import { Schema, model, models, Model as MongoModel } from 'mongoose';
import { ModelDataSchema as ModelDataType } from '@/types/mongoSchema';

const ModelDataSchema = new Schema({
  modelId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  q: {
    type: String,
    required: true
  },
  a: {
    type: String,
    default: ''
  },
  status: {
    type: Number,
    enum: [0, 1, 2],
    default: 1
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

export const ModelData: MongoModel<ModelDataType> =
  models['modelData'] || model('modelData', ModelDataSchema);

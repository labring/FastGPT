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
  text: {
    type: String,
    required: true
  },
  q: {
    type: [
      {
        id: String, // 对应redis的key
        text: String
      }
    ],
    default: []
  },
  status: {
    type: Number,
    enum: [0, 1], // 1 训练ing
    default: 1
  }
});

export const ModelData: MongoModel<ModelDataType> =
  models['modelData'] || model('modelData', ModelDataSchema);

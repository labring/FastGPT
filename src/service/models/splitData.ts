/* 模型的知识库 */
import { Schema, model, models, Model as MongoModel } from 'mongoose';
import { SplitDataSchema as SplitDataType } from '@/types/mongoSchema';

const SplitDataSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  prompt: {
    // 拆分时的提示词
    type: String,
    required: true
  },
  kbId: {
    type: Schema.Types.ObjectId,
    ref: 'kb',
    required: true
  },
  textList: {
    type: [String],
    default: []
  },
  errorText: {
    type: String,
    default: ''
  }
});

export const SplitData: MongoModel<SplitDataType> =
  models['splitData'] || model('splitData', SplitDataSchema);

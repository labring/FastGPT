/* 模型的知识库 */
import { Schema, model, models, Model as MongoModel } from 'mongoose';
import { TrainingDataSchema as TrainingDateType } from '@/types/mongoSchema';

// pgList and vectorList, Only one of them will work

const TrainingDataSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  kbId: {
    type: Schema.Types.ObjectId,
    ref: 'kb',
    required: true
  },
  lockTime: {
    type: Date,
    default: () => new Date('2000/1/1')
  },
  vectorList: {
    type: [{ q: String, a: String }],
    default: []
  },
  prompt: {
    // 拆分时的提示词
    type: String,
    default: ''
  },
  qaList: {
    type: [String],
    default: []
  }
});

export const TrainingData: MongoModel<TrainingDateType> =
  models['trainingData'] || model('trainingData', TrainingDataSchema);

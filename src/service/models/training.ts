import { Schema, model, models } from 'mongoose';

const TrainingSChema = new Schema({
  serviceName: {
    // 模型厂商名
    type: String,
    required: true
  },
  tuneId: {
    // 微调进程 ID
    type: String,
    required: true
  },
  modelId: {
    // 关联模型的 ID
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  },
  status: {
    // 状态值
    type: String,
    required: true,
    enum: ['pending', 'succeed', 'errored', 'canceled']
  }
});

export const Training = models['training'] || model('training', TrainingSChema);

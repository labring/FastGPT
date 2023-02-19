import { Schema, model, models } from 'mongoose';

const ModelSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: '/imgs/modelAvatar.png'
  },
  systemPrompt: {
    type: String,
    default: ''
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['waiting', 'running', 'training', 'closed']
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  trainingTimes: {
    type: Number,
    default: 0
  },
  service: {
    company: {
      type: String,
      required: true,
      enum: ['openai']
    },
    trainId: {
      // 训练时需要的 ID
      type: String,
      required: true
    },
    chatModel: {
      // 聊天时使用的模型
      type: String,
      required: true
    },
    modelName: {
      // 底层模型的名称
      type: String,
      required: true
    }
  },
  security: {
    type: {
      domain: {
        type: [String],
        default: ['*']
      },
      contextMaxLen: {
        type: Number,
        default: 20
      },
      contentMaxLen: {
        type: Number,
        default: 4000
      },
      expiredTime: {
        type: Number,
        default: 1,
        set: (val: number) => val * (60 * 60 * 1000)
      },
      maxLoadAmount: {
        // 负数代表不限制
        type: Number,
        default: -1
      }
    },
    default: {},
    required: true
  }
});

export const Model = models['model'] || model('model', ModelSchema);

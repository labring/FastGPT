import { Schema, model, models, Model as MongoModel } from 'mongoose';
import { ModelSchema as ModelType } from '@/types/mongoSchema';
import { ChatModelMap, OpenAiChatEnum } from '@/constants/model';

const ModelSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: '/icon/logo.png'
  },
  intro: {
    type: String,
    default: ''
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  chat: {
    relatedKbs: {
      type: [Schema.Types.ObjectId],
      ref: 'kb',
      default: []
    },
    searchSimilarity: {
      type: Number,
      default: 0.8
    },
    searchLimit: {
      type: Number,
      default: 5
    },
    searchEmptyText: {
      type: String,
      default: ''
    },
    systemPrompt: {
      // 系统提示词
      type: String,
      default: ''
    },
    maxToken: {
      type: Number,
      default: 4000,
      min: 100
    },
    temperature: {
      type: Number,
      min: 0,
      max: 10,
      default: 0
    },
    chatModel: {
      // 聊天时使用的模型
      type: String,
      enum: Object.keys(ChatModelMap),
      default: OpenAiChatEnum.GPT3516k
    }
  },
  share: {
    topNum: {
      type: Number,
      default: 0
    },
    isShare: {
      type: Boolean,
      default: false
    },
    isShareDetail: {
      // share model detail info. false: just show name and intro
      type: Boolean,
      default: false
    },
    intro: {
      type: String,
      default: '',
      maxlength: 150
    },
    collection: {
      type: Number,
      default: 0
    }
  }
});

try {
  ModelSchema.index({ updateTime: -1 });
  ModelSchema.index({ 'share.collection': -1 });
} catch (error) {
  console.log(error);
}

export const Model: MongoModel<ModelType> = models['model'] || model('model', ModelSchema);

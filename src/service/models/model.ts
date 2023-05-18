import { Schema, model, models, Model as MongoModel } from 'mongoose';
import { ModelSchema as ModelType } from '@/types/mongoSchema';
import {
  ModelVectorSearchModeMap,
  ModelVectorSearchModeEnum,
  ChatModelMap,
  OpenAiChatEnum
} from '@/constants/model';

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
  status: {
    type: String,
    required: true,
    enum: ['waiting', 'running', 'training', 'closed']
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
    searchMode: {
      // knowledge base search mode
      type: String,
      enum: Object.keys(ModelVectorSearchModeMap),
      default: ModelVectorSearchModeEnum.hightSimilarity
    },
    systemPrompt: {
      // 系统提示词
      type: String,
      default: ''
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
      default: OpenAiChatEnum.GPT35
    }
  },
  share: {
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

export const Model: MongoModel<ModelType> = models['model'] || model('model', ModelSchema);

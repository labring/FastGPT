import { Schema, model, models, Model } from 'mongoose';
import { AppSchema as AppType } from '@/types/mongoSchema';

const AppSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'advanced',
    enum: ['basic', 'advanced']
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  intro: {
    type: String,
    default: ''
  },
  updateTime: {
    type: Date,
    default: () => new Date()
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
  },
  modules: {
    type: Array,
    default: []
  },
  // 弃
  chat: {
    relatedKbs: {
      type: [Schema.Types.ObjectId],
      ref: 'kb',
      default: []
    },
    searchSimilarity: {
      type: Number,
      default: 0.4
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
      type: String,
      default: ''
    },
    limitPrompt: {
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
      type: String
    }
  }
});

try {
  AppSchema.index({ updateTime: -1 });
  AppSchema.index({ 'share.collection': -1 });
} catch (error) {
  console.log(error);
}

export const App: Model<AppType> = models['app'] || model('app', AppSchema);

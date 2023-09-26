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
  inited: {
    type: Boolean
  },
  // 弃
  chat: Object
});

try {
  AppSchema.index({ updateTime: -1 });
  AppSchema.index({ 'share.collection': -1 });
} catch (error) {
  console.log(error);
}

export const App: Model<AppType> = models['app'] || model('app', AppSchema);

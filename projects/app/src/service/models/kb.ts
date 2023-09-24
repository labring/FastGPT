import { Schema, model, models, Model } from 'mongoose';
import { kbSchema as SchemaType } from '@/types/mongoSchema';
import { KbTypeMap } from '@/constants/dataset';

const kbSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'kb',
    default: null
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-ada-002'
  },
  type: {
    type: String,
    enum: Object.keys(KbTypeMap),
    required: true,
    default: 'dataset'
  },
  tags: {
    type: [String],
    default: []
  }
});

export const KB: Model<SchemaType> = models['kb'] || model('kb', kbSchema);

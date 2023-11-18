import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { OutLinkSchema as SchemaType } from '@fastgpt/global/support/outLink/type';
import { OutLinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const OutLinkSchema = new Schema({
  shareId: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user'
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  },
  type: {
    type: String,
    default: OutLinkTypeEnum.share
  },
  name: {
    type: String,
    required: true
  },
  total: {
    // total amount
    type: Number,
    default: 0
  },
  lastTime: {
    type: Date
  },
  responseDetail: {
    type: Boolean,
    default: false
  },
  limit: {
    expiredTime: {
      type: Date
    },
    QPM: {
      type: Number,
      default: 1000
    },
    credit: {
      type: Number,
      default: -1
    },
    hookUrl: {
      type: String
    }
  }
});

export const MongoOutLink: Model<SchemaType> =
  models['outlinks'] || model('outlinks', OutLinkSchema);

MongoOutLink.syncIndexes();

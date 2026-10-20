import { defineIndex, connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../core/app/schema';
import { getLogger, LogCategories } from '../../common/logger';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

const OutLinkSchema = new Schema({
  shareId: {
    type: String,
    required: true
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
    ref: AppCollectionName,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  usagePoints: {
    type: Number,
    default: 0
  },
  lastTime: {
    type: Date
  },

  showRunningStatus: {
    type: Boolean,
    default: false
  },
  showSkillReferences: {
    type: Boolean,
    default: false
  },
  showCite: {
    type: Boolean,
    default: false
  },
  showFullText: {
    type: Boolean,
    default: false
  },
  canDownloadSource: {
    type: Boolean,
    default: false
  },
  showWholeResponse: {
    type: Boolean,
    default: true
  },
  allowAnonymous: {
    type: Boolean
  },
  limit: {
    maxUsagePoints: {
      type: Number,
      default: -1
    },
    expiredTime: {
      type: Date
    },
    QPM: {
      type: Number,
      default: 1000
    },
    hookUrl: {
      type: String
    }
  },

  // Third part app config
  app: {
    type: Object // could be FeishuAppType | WecomAppType | ...
  },
  immediateResponse: {
    type: String
  },
  defaultResponse: {
    type: String
  },

  //@deprecated
  responseDetail: Boolean,
  showNodeStatus: Boolean,
  showRawSource: Boolean
});

OutLinkSchema.virtual('associatedApp', {
  ref: AppCollectionName,
  localField: 'appId',
  foreignField: '_id',
  justOne: true
});

const logger = getLogger(LogCategories.INFRA.MONGO);

defineIndex(OutLinkSchema, { key: { shareId: -1 } });
defineIndex(OutLinkSchema, { key: { teamId: 1, tmbId: 1, appId: 1 } });
defineIndex(OutLinkSchema, { key: { teamId: 1, appId: 1, type: 1 } });
// 一个 Bot 只能绑定一个长连接渠道；旧 Webhook 和其他类型不受此约束。
defineIndex(OutLinkSchema, {
  key: { 'app.botId': 1 },
  options: {
    unique: true,
    partialFilterExpression: { type: PublishChannelEnum.wecomWebsocket }
  }
});
// Wechat polling recovery: find online channels on startup
defineIndex(OutLinkSchema, {
  key: { type: 1, 'app.status': 1 },
  options: { partialFilterExpression: { type: 'wechat', 'app.status': 'online' } }
});

export const MongoOutLink = getMongoModel<OutLinkSchemaType>('outlinks', OutLinkSchema);

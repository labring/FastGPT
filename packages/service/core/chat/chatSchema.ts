import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { ChatSchema as ChatType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleMap, ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { appCollectionName } from '../app/schema';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

export const chatCollectionName = 'chat';

const ChatSchema = new Schema({
  chatId: {
    type: String,
    require: true
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
    ref: appCollectionName,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  title: {
    type: String,
    default: '历史记录'
  },
  customTitle: {
    type: String,
    default: ''
  },
  top: {
    type: Boolean
  },
  variables: {
    type: Object,
    default: {}
  },
  source: {
    type: String,
    enum: Object.keys(ChatSourceMap),
    required: true
  },
  shareId: {
    type: String
  },
  isInit: {
    type: Boolean,
    default: false
  },
  content: {
    type: [
      {
        obj: {
          type: String,
          required: true,
          enum: Object.keys(ChatRoleMap)
        },
        value: {
          type: String,
          default: ''
        },
        [ModuleOutputKeyEnum.responseData]: {
          type: Array,
          default: []
        }
      }
    ],
    default: []
  }
});

try {
  ChatSchema.index({ tmbId: 1 });
  ChatSchema.index({ updateTime: -1 });
  ChatSchema.index({ appId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoChat: Model<ChatType> =
  models[chatCollectionName] || model(chatCollectionName, ChatSchema);
MongoChat.syncIndexes();

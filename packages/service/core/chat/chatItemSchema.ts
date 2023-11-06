import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { ChatItemSchema as ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleMap, TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const ChatItemSchema = new Schema({
  dataId: {
    type: String,
    require: true,
    default: () => nanoid()
  },
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
    ref: 'model',
    required: true
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  obj: {
    type: String,
    required: true,
    enum: Object.keys(ChatRoleMap)
  },
  value: {
    type: String,
    default: ''
  },
  userFeedback: {
    type: String
  },
  adminFeedback: {
    type: {
      datasetId: String,
      collectionId: String,
      dataId: String,
      q: String,
      a: String
    }
  },
  [TaskResponseKeyEnum.responseData]: {
    type: Array,
    default: []
  }
});

try {
  ChatItemSchema.index({ time: -1 });
  ChatItemSchema.index({ userId: 1 });
  ChatItemSchema.index({ appId: 1 });
  ChatItemSchema.index({ chatId: 1 });
  ChatItemSchema.index({ userFeedback: 1 });
} catch (error) {
  console.log(error);
}

export const MongoChatItem: Model<ChatItemType> =
  models['chatItem'] || model('chatItem', ChatItemSchema);

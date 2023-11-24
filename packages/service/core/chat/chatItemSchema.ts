import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { ChatItemSchema as ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleMap } from '@fastgpt/global/core/chat/constants';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { appCollectionName } from '../app/schema';
import { userCollectionName } from '../../support/user/schema';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

const ChatItemSchema = new Schema({
  dataId: {
    type: String,
    require: true,
    default: () => nanoid()
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: appCollectionName,
    required: true
  },
  chatId: {
    type: String,
    require: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName
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
  [ModuleOutputKeyEnum.responseData]: {
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

MongoChatItem.syncIndexes();

import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { ChatItemSchema as ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleMap } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { appCollectionName } from '../app/schema';
import { userCollectionName } from '../../support/user/schema';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

const ChatItemSchema = new Schema({
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
  userId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName
  },
  chatId: {
    type: String,
    require: true
  },
  dataId: {
    type: String,
    require: true,
    default: () => getNanoid(22)
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: appCollectionName,
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
  userGoodFeedback: {
    type: String
  },
  userFeedback: String,
  userBadFeedback: {
    type: String
  },
  customFeedbacks: {
    type: [String]
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
  ChatItemSchema.index({ teamId: 1 });
  ChatItemSchema.index({ time: -1 });
  ChatItemSchema.index({ appId: 1 });
  ChatItemSchema.index({ chatId: 1 });
  ChatItemSchema.index({ obj: 1 });
  ChatItemSchema.index({ userGoodFeedback: 1 });
  ChatItemSchema.index({ userBadFeedback: 1 });
  ChatItemSchema.index({ customFeedbacks: 1 });
  ChatItemSchema.index({ adminFeedback: 1 });
} catch (error) {
  console.log(error);
}

export const MongoChatItem: Model<ChatItemType> =
  models['chatItem'] || model('chatItem', ChatItemSchema);

MongoChatItem.syncIndexes();

import { connectionMongo, getMongoModel } from '../../common/mongo';
import { type ChatItemResDataSchema } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../app/schema';
import { ChatItemCollectionName } from './chatItemSchema';
import { userCollectionName } from '../../support/user/schema';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const { Schema } = connectionMongo;

export const CollectionName = 'chat_item_res_data';

const ChatItemResDataSchema = new Schema({
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
    ref: AppCollectionName,
    required: true
  },
  itemId: {
    type: Schema.Types.ObjectId,
    ref: ChatItemCollectionName,
    required: true
  },
  [DispatchNodeResponseKeyEnum.nodeResponse]: {
    type: Object,
    default: {}
  },
  dataSort:{
    type: Number,
    default: 0,
    required: true
  }
});

try {
  ChatItemResDataSchema.index({ dataId: 1 });
  ChatItemResDataSchema.index({ dataId: 1,itemId:1 });
  ChatItemResDataSchema.index({ appId: 1, chatId: 1, dataId: 1 });
  ChatItemResDataSchema.index({ teamId: 1});
} catch (error) {
  console.log(error);
}

export const MongoChatItemResData = getMongoModel<ChatItemResDataSchema>(CollectionName, ChatItemResDataSchema);

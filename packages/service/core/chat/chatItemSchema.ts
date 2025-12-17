import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type ChatItemSchema as ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleMap } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../app/schema';
import { userCollectionName } from '../../support/user/schema';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatItemCollectionName } from './constants';

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
    default: () => getNanoid(24)
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  hideInUI: {
    type: Boolean,
    default: false
  },
  obj: {
    // chat role
    type: String,
    required: true,
    enum: Object.keys(ChatRoleMap)
  },
  value: {
    // chat content
    type: Array,
    default: []
  },

  // Field memory
  memories: Object,
  errorMsg: String,
  durationSeconds: Number,
  citeCollectionIds: [String],

  // Feedback
  userGoodFeedback: String,
  userBadFeedback: String,
  customFeedbacks: [String],
  adminFeedback: {
    type: {
      datasetId: String,
      collectionId: String,
      dataId: String,
      q: String,
      a: String
    }
  },
  isFeedbackRead: Boolean,

  // @deprecated
  [DispatchNodeResponseKeyEnum.nodeResponse]: Array
});

/* 
  delete by app; 
  delete by chat id;
  get chat list; 
  get chat logs; 
  close custom feedback; 
*/
ChatItemSchema.index({ appId: 1, chatId: 1, dataId: 1 });
// Anchor filter
ChatItemSchema.index({ appId: 1, chatId: 1, _id: -1 });
// timer, clear history
ChatItemSchema.index({ teamId: 1, time: -1 });

export const MongoChatItem = getMongoModel<ChatItemType>(ChatItemCollectionName, ChatItemSchema);

import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import type { ChatItemResponseSchemaType } from '@fastgpt/global/core/chat/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../app/schema';
import { ChatItemResponseCollectionName } from './constants';

const ChatItemResponseSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  chatId: {
    type: String,
    require: true
  },
  chatItemDataId: {
    type: String,
    require: true
  },
  data: {
    type: Object,
    default: {}
  },

  time: {
    type: Date,
    default: () => new Date()
  }
});

// Get response/Delete
ChatItemResponseSchema.index({ appId: 1, chatId: 1, chatItemDataId: 1 });

// Clear expired response
ChatItemResponseSchema.index({ teamId: 1, time: -1 });

export const MongoChatItemResponse = getMongoModel<ChatItemResponseSchemaType>(
  ChatItemResponseCollectionName,
  ChatItemResponseSchema
);

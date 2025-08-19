import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatFavouriteAppSchema as ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../app/schema';

const { Schema } = connectionMongo;

export const ChatFavouriteAppCollectionName = 'chat_favourite_apps';

const ChatFavouriteAppSchema = new Schema({
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
  categories: {
    type: Array,
    default: []
  },
  order: Number
});

ChatFavouriteAppSchema.index({ teamId: 1 });

export const MongoChatFavouriteApp = getMongoModel<ChatFavouriteAppType>(
  ChatFavouriteAppCollectionName,
  ChatFavouriteAppSchema
);

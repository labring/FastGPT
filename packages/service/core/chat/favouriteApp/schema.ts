import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
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
  favouriteTags: {
    type: [String],
    default: []
  },
  order: {
    type: Number,
    default: 10000000
  }
});

ChatFavouriteAppSchema.index({ teamId: 1, appId: 1 });

export const MongoChatFavouriteApp = getMongoModel<ChatFavouriteAppType>(
  ChatFavouriteAppCollectionName,
  ChatFavouriteAppSchema
);

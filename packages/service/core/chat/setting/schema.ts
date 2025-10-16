import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatSettingModelType } from '@fastgpt/global/core/chat/setting/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../app/schema';

const { Schema } = connectionMongo;

export const ChatSettingCollectionName = 'chat_settings';

const ChatSettingSchema = new Schema({
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
  enableHome: {
    type: Boolean,
    default: true
  },
  slogan: String,
  dialogTips: String,
  selectedTools: {
    type: Array,
    default: []
  },
  homeTabTitle: String,
  wideLogoUrl: String,
  squareLogoUrl: String,
  quickAppIds: {
    type: [String],
    default: []
  },
  favouriteTags: {
    type: [
      {
        id: String,
        name: String
      }
    ],
    default: [],
    _id: false
  }
});

ChatSettingSchema.virtual('quickAppList', {
  ref: AppCollectionName,
  localField: 'quickAppIds',
  foreignField: '_id'
});

ChatSettingSchema.index({ teamId: 1 });

export const MongoChatSetting = getMongoModel<ChatSettingModelType>(
  ChatSettingCollectionName,
  ChatSettingSchema
);

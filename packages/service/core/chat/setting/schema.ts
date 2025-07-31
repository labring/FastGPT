import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatSettingSchema as ChatSettingType } from '@fastgpt/global/core/chat/type.d';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

const { Schema } = connectionMongo;

export const ChatSettingCollectionName = 'chat_settings';

const ChatSettingSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  slogan: {
    type: String,
    default: ''
  },
  dialogTips: {
    type: String,
    default: ''
  },
  teamApps: {
    type: [String],
    default: []
  },
  wideLogoUrl: {
    type: String
  },
  squareLogoUrl: {
    type: String
  }
});

ChatSettingSchema.index({ teamId: 1 });

export const MongoChatSetting = getMongoModel<ChatSettingType>(
  ChatSettingCollectionName,
  ChatSettingSchema
);

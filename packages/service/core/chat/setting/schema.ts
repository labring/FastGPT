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
  slogan: String,
  dialogTips: String,
  teamApps: [String],
  wideLogoUrl: String,
  squareLogoUrl: String
});

ChatSettingSchema.index({ teamId: 1 });

export const MongoChatSetting = getMongoModel<ChatSettingType>(
  ChatSettingCollectionName,
  ChatSettingSchema
);

import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatSettingSchema as ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
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
  slogan: String,
  dialogTips: String,
  selectedTools: {
    type: Array,
    default: []
  },
  homeTabTitle: String,
  wideLogoUrl: String,
  squareLogoUrl: String
});

ChatSettingSchema.index({ teamId: 1 });

export const MongoChatSetting = getMongoModel<ChatSettingType>(
  ChatSettingCollectionName,
  ChatSettingSchema
);

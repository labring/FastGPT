import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type ChatSettingSchema as ChatSettingType } from '@fastgpt/global/core/chat/type.d';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../app/schema';

const { Schema } = connectionMongo;

export const ChatSettingCollectionName = 'chat_setting';

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
    type: [
      {
        _id: {
          type: Schema.Types.ObjectId,
          ref: AppCollectionName,
          required: true
        }
      }
    ],
    default: []
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  ChatSettingSchema.index({ teamId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoChatSetting = getMongoModel<ChatSettingType>(
  ChatSettingCollectionName,
  ChatSettingSchema
);

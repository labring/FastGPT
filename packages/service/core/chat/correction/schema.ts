import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type ChatCorrectionSchemaType } from '@fastgpt/global/core/chat/correction/type';
import { CorrectionModeEnum } from '@fastgpt/global/core/chat/correction/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../app/schema';
import { userCollectionName } from '../../../support/user/schema';

export const ChatCorrectionCollectionName = 'chat_corrections';

const ChatCorrectionSchema = new Schema({
  dataId: {
    type: String,
    required: true
  },
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
    ref: userCollectionName,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  correctionData: {
    type: {
      correctionMode: {
        type: String,
        enum: Object.values(CorrectionModeEnum),
        required: true
      },
      question: {
        type: String,
        required: true
      },
      rawAnswer: {
        type: String
      },
      correctedAnswer: String,
      correctedQuoteList: [
        {
          datasetDataId: String,
          q: String,
          a: String,
          sourceName: String,
          updateTime: Date
        }
      ],
      indexs: [
        {
          type: { type: String, enum: ['q', 'a', 'c'] },
          dataId: String
        }
      ]
    },
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  ChatCorrectionSchema.index({ appId: 1 });
  ChatCorrectionSchema.index({ appId: 1, chatId: 1, dataId: 1 });
  // List corrections by chat
  ChatCorrectionSchema.index({ chatId: 1, appId: 1, updateTime: -1 });
  // Cleanup by team and time
  ChatCorrectionSchema.index({ teamId: 1, updateTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoChatCorrection = getMongoModel<ChatCorrectionSchemaType>(
  ChatCorrectionCollectionName,
  ChatCorrectionSchema
);

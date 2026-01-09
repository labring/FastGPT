import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type ChatSchemaType } from '@fastgpt/global/core/chat/type.d';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../app/schema';
import { chatCollectionName } from './constants';
import { AppVersionCollectionName } from '../app/version/schema';

const ChatSchema = new Schema({
  chatId: {
    type: String,
    require: true
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
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  appVersionId: {
    type: Schema.Types.ObjectId,
    ref: AppVersionCollectionName
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  title: {
    type: String,
    default: '历史记录'
  },
  customTitle: {
    type: String,
    default: ''
  },
  top: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    required: true,
    enum: Object.values(ChatSourceEnum)
  },
  sourceName: String,
  shareId: {
    type: String
  },
  outLinkUid: {
    type: String
  },

  variableList: {
    type: Array
  },
  welcomeText: {
    type: String
  },
  variables: {
    // variable value
    type: Object,
    default: {}
  },
  pluginInputs: Array,
  metadata: {
    //For special storage
    type: Object,
    default: {}
  },

  // Feedback count statistics (redundant fields for performance)

  // Boolean flags for efficient filtering
  hasGoodFeedback: Boolean,
  hasBadFeedback: Boolean,
  hasUnreadGoodFeedback: Boolean,
  hasUnreadBadFeedback: Boolean,

  searchKey: String,
  deleteTime: {
    type: Date,
    default: null,
    select: false
  },

  // @deprecated
  userId: Schema.Types.ObjectId
});

try {
  ChatSchema.index({ chatId: 1 });
  // Delete by appid; init chat; update chat; auth chat;
  ChatSchema.index({ appId: 1, chatId: 1 });

  // Clear history(share),Init 4121
  ChatSchema.index(
    { appId: 1, outLinkUid: 1, tmbId: 1 },
    {
      partialFilterExpression: {
        outLinkUid: { $exists: true }
      }
    }
  );

  // get user history
  ChatSchema.index({ tmbId: 1, appId: 1, deleteTime: 1, top: -1, updateTime: -1 });
  // get share chat history
  ChatSchema.index(
    { shareId: 1, outLinkUid: 1, updateTime: -1 },
    {
      partialFilterExpression: {
        shareId: { $exists: true }
      }
    }
  );

  /* get chat logs */
  // 1. Common get
  ChatSchema.index({ appId: 1, updateTime: -1 });
  // Get history(tmbId)
  ChatSchema.index({ appId: 1, tmbId: 1, updateTime: -1 });
  // clearHistory(API)
  ChatSchema.index({ appId: 1, source: 1, tmbId: 1, updateTime: -1 });

  /* 反馈过滤的索引 */
  // 2. Has good feedback filter
  ChatSchema.index(
    {
      appId: 1,
      hasGoodFeedback: 1,
      updateTime: -1
    },
    {
      partialFilterExpression: {
        hasGoodFeedback: true
      }
    }
  );
  // Has bad feedback filter
  ChatSchema.index(
    {
      appId: 1,
      hasBadFeedback: 1,
      updateTime: -1
    },
    {
      partialFilterExpression: {
        hasBadFeedback: true
      }
    }
  );
  // 3. Has unread good feedback filter
  ChatSchema.index(
    {
      appId: 1,
      hasUnreadGoodFeedback: 1,
      updateTime: -1
    },
    {
      partialFilterExpression: {
        hasUnreadGoodFeedback: true
      }
    }
  );
  // Has unread bad feedback filter
  ChatSchema.index(
    {
      appId: 1,
      hasUnreadBadFeedback: 1,
      updateTime: -1
    },
    {
      partialFilterExpression: {
        hasUnreadBadFeedback: true
      }
    }
  );

  // timer, clear history
  ChatSchema.index({ updateTime: -1, teamId: 1 });
  ChatSchema.index({ teamId: 1, updateTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoChat = getMongoModel<ChatSchemaType>(chatCollectionName, ChatSchema);

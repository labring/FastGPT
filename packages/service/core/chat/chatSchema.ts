import { connectionMongo, defineIndex, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type ChatSchemaType } from '@fastgpt/global/core/chat/type';
import {
  ChatGenerateStatusEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
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
  sourceType: {
    type: String,
    enum: Object.values(ChatSourceTypeEnum),
    required: true
  },
  // 历史物理字段名，业务语义为 sourceId；App 场景才是真实 appId。
  appId: {
    type: Schema.Types.ObjectId,
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
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    default: ''
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
  // Error count (redundant field for performance)
  errorCount: {
    type: Number,
    default: 0
  },

  searchKey: String,
  deleteTime: {
    type: Date,
    default: null,
    select: false
  },

  chatGenerateStatus: {
    type: Number,
    enum: [
      ChatGenerateStatusEnum.generating,
      ChatGenerateStatusEnum.done,
      ChatGenerateStatusEnum.error
    ],
    default: ChatGenerateStatusEnum.done
  },
  hasBeenRead: {
    type: Boolean,
    default: false
  },

  /** @deprecated */
  userId: Schema.Types.ObjectId
});

defineIndex(ChatSchema, { key: { chatId: 1 } });
// Delete by appid; init chat; update chat; auth chat;
defineIndex(ChatSchema, {
  key: { sourceType: 1, appId: 1, chatId: 1 },
  options: { unique: true }
});

// timer, clear history
defineIndex(ChatSchema, { key: { updateTime: -1, teamId: 1 } });
defineIndex(ChatSchema, { key: { teamId: 1, updateTime: -1 } });

// get user history(Cookie)
defineIndex(ChatSchema, {
  key: { tmbId: 1, appId: 1, deleteTime: 1, top: -1, updateTime: -1 }
});

/* ===== 条件索引 ===== */
// Clear history(share),Init 4121
defineIndex(ChatSchema, {
  key: { appId: 1, outLinkUid: 1, tmbId: 1 },
  options: {
    partialFilterExpression: {
      outLinkUid: { $exists: true }
    }
  }
});

// get share chat history
defineIndex(ChatSchema, {
  key: { shareId: 1, outLinkUid: 1, updateTime: -1 },
  options: {
    partialFilterExpression: {
      shareId: { $exists: true }
    }
  }
});

/* get chat logs */
// 1. Common get
defineIndex(ChatSchema, { key: { appId: 1, updateTime: -1 } });
// Get history(tmbId)
defineIndex(ChatSchema, { key: { appId: 1, tmbId: 1, updateTime: -1 } });
// clearHistory(API)
defineIndex(ChatSchema, {
  key: { appId: 1, source: 1, tmbId: 1, updateTime: -1 }
});
// Periodic cleanup for chats stuck in generating state.
defineIndex(ChatSchema, {
  key: { chatGenerateStatus: 1, updateTime: 1 },
  options: {
    partialFilterExpression: {
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    }
  }
});

/* 反馈过滤的索引 */
// 2. Has good feedback filter
defineIndex(ChatSchema, {
  key: {
    appId: 1,
    hasGoodFeedback: 1,
    updateTime: -1
  },
  options: {
    partialFilterExpression: {
      hasGoodFeedback: true
    }
  }
});
// Has bad feedback filter
defineIndex(ChatSchema, {
  key: {
    appId: 1,
    hasBadFeedback: 1,
    updateTime: -1
  },
  options: {
    partialFilterExpression: {
      hasBadFeedback: true
    }
  }
});
// 3. Has unread good feedback filter
defineIndex(ChatSchema, {
  key: {
    appId: 1,
    hasUnreadGoodFeedback: 1,
    updateTime: -1
  },
  options: {
    partialFilterExpression: {
      hasUnreadGoodFeedback: true
    }
  }
});
// Has unread bad feedback filter
defineIndex(ChatSchema, {
  key: {
    appId: 1,
    hasUnreadBadFeedback: 1,
    updateTime: -1
  },
  options: {
    partialFilterExpression: {
      hasUnreadBadFeedback: true
    }
  }
});
// Has error filter
defineIndex(ChatSchema, {
  key: {
    appId: 1,
    errorCount: 1,
    updateTime: -1
  },
  options: {
    partialFilterExpression: {
      errorCount: { $gt: 0 }
    }
  }
});

defineIndex(ChatSchema, {
  key: { appId: 1, chatId: 1 },
  options: { unique: true },
  deprecated: true
});

export const MongoChat = getMongoModel<ChatSchemaType>(chatCollectionName, ChatSchema);

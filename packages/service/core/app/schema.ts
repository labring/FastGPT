import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { defineIndex, Schema, getMongoModel } from '../../common/mongo';
import type { AppSchemaType as AppType } from '@fastgpt/global/core/app/type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const AppCollectionName = 'apps';

// schema
const AppSchema = new Schema(
  {
    parentId: {
      type: Schema.Types.ObjectId,
      ref: AppCollectionName,
      default: null
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
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: AppTypeEnum.workflow,
      enum: Object.values(AppTypeEnum)
    },
    version: {
      type: String,
      enum: ['v1', 'v2']
    },
    avatar: {
      type: String,
      default: '/icon/logo.svg'
    },
    intro: {
      type: String,
      default: ''
    },
    templateId: String,

    updateTime: {
      type: Date,
      default: () => new Date()
    },

    /** @deprecated 仅供 4.16.3 历史数据迁移读取，正常工作流使用 app_versions.nodes */
    modules: {
      type: Array,
      default: undefined
    },
    /** @deprecated 仅供 4.16.3 历史数据迁移读取，正常工作流使用 app_versions.edges */
    edges: {
      type: Array,
      default: undefined
    },
    /** @deprecated 仅供 4.16.3 历史数据迁移读取，正常工作流使用 app_versions.chatConfig */
    chatConfig: {
      type: Object,
      default: undefined
    },
    /** @deprecated 仅供 4.16.3 资源快照迁移读取 skillIds */
    resourceRefs: {
      type: Object,
      default: undefined
    },

    // Tool config
    pluginData: {
      type: {
        nodeVersion: String,
        pluginUniId: String,
        apiSchemaStr: String, // http plugin
        customHeaders: String // http plugin
      }
    },

    scheduledTriggerConfig: {
      cronString: {
        type: String
      },
      timezone: {
        type: String
      },
      defaultPrompt: {
        type: String
      }
    },
    scheduledTriggerNextTime: {
      type: Date
    },
    publishedVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'app_versions'
    },
    inheritPermission: {
      type: Boolean,
      default: true
    },

    // Chat setting
    favourite: Boolean,
    quick: Boolean,

    /** @deprecated */
    defaultPermission: Number,
    inited: Boolean,

    // 软删除标记字段
    deleteTime: {
      type: Date,
      default: null // null表示未删除，有值表示删除时间
    }
  },
  {
    minimize: false
  }
);

defineIndex(AppSchema, { key: { teamId: 1, updateTime: -1 } });
defineIndex(AppSchema, { key: { teamId: 1, type: 1 } });
defineIndex(AppSchema, { key: { teamId: 1, parentId: 1 } });
defineIndex(AppSchema, {
  key: { teamId: 1, deleteTime: 1, publishedVersionId: 1 }
});
defineIndex(AppSchema, {
  key: { teamId: 1, deleteTime: 1, 'resourceRefs.skillIds': 1 },
  deprecated: true
});

// Schedule
defineIndex(AppSchema, {
  key: { scheduledTriggerConfig: 1, scheduledTriggerNextTime: -1 },
  options: {
    partialFilterExpression: {
      scheduledTriggerConfig: { $exists: true }
    }
  }
});

// Admin count
defineIndex(AppSchema, { key: { type: 1 } });
defineIndex(AppSchema, { key: { deleteTime: 1 } });
// Admin search
defineIndex(AppSchema, { key: { name: 1 } });

export const MongoApp = getMongoModel<AppType>(AppCollectionName, AppSchema);

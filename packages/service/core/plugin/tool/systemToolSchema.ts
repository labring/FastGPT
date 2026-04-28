import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';
import type { PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';

export const collectionName = 'system_plugin_tools';

/** 职责：
 * 1. 管理系统级别安装的插件的相关配置（价格等）
 * 2. 管理系统级别配置的工作流工具
 */
const SystemToolSchema = new Schema({
  /** 有前缀的, systemTool-xxx, commercial-xxx，包含子工具: systemTool-xxx/childId */
  pluginId: {
    type: String,
    required: true
  },
  /** 插件状态，默认为激活状态 */
  status: {
    type: Number,
    set(val: PluginStatusType | number) {
      if (typeof val === 'number') return val;

      switch (val) {
        case 'Normal':
          return 1;
        case 'SoonOffline':
          return 2;
        case 'Offline':
          return 3;
        default:
          return 1;
      }
    },
    get(val: number) {
      switch (val) {
        case 1:
          return 'Normal';
        case 2:
          return 'SoonOffline';
        case 3:
          return 'Offline';
        default:
          return 'Normal';
      }
    }
  },

  /**
   * 插件的原始费用(展示用，现在没用)
   */
  originCost: {
    type: Number,
    default: 0
  },

  /** 当前价格，实际生效 */
  currentCost: {
    type: Number,
    default: 0
  },

  /** 是否收取系统密钥费用 */
  hasTokenFee: {
    type: Boolean,
    default: false
  },

  /** 排序 */
  pluginOrder: {
    type: Number
  },

  /** 系统密钥价格 */
  systemKeyCost: {
    type: Number,
    default: 0
  },

  /**
   * 系统配置的工作流工具的相关配置
   */
  customConfig: Object,

  /**
   * 系统密钥的值
   */
  secretsVal: Object,

  /** @deprecated */
  inputListVal: Object,

  /**
   * 推荐 Tags，有对应 tag 的用户看到是推荐状态
   */
  promoteTags: {
    type: [String],
    enum: UserTagsSchema.enum
  },

  /**
   * 隐藏 Tags，有对应 tag 的用户看不到
   */
  hideTags: {
    type: [String],
    enum: UserTagsSchema.enum
  },

  /** @deprecated */
  inputConfig: Array,

  /** @deprecated */
  isActive: {
    type: Boolean,
    required: false,
    get() {
      return true;
    }
  }
});

SystemToolSchema.index({ pluginId: 1 });

export const MongoSystemTool = getMongoModel<SystemPluginToolCollectionType>(
  collectionName,
  SystemToolSchema
);

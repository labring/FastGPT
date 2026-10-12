import { defineIndex, getMongoModel, Schema } from '../../common/mongo';
import {
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetTypeEnum,
  DatasetTypeMap,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { userCollectionName } from '../../support/user/schema';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

export const DatasetCollectionName = 'datasets';

export const ChunkSettings = {
  trainingType: {
    type: String,
    enum: Object.values(DatasetCollectionDataProcessModeEnum)
  },

  chunkTriggerType: {
    type: String,
    enum: Object.values(ChunkTriggerConfigTypeEnum)
  },
  chunkTriggerMinSize: Number,

  dataEnhanceCollectionName: Boolean,

  imageIndex: Boolean,
  autoIndexes: Boolean,
  indexPrefixTitle: Boolean,

  chunkSettingMode: {
    type: String,
    enum: Object.values(ChunkSettingModeEnum)
  },
  chunkSplitMode: {
    type: String,
    enum: Object.values(DataChunkSplitModeEnum)
  },
  paragraphChunkAIMode: {
    type: String,
    enum: Object.values(ParagraphChunkAIModeEnum)
  },
  paragraphChunkDeep: Number,
  paragraphChunkMinSize: Number,
  chunkSize: Number,
  chunkSplitter: String,

  indexSize: Number,
  qaPrompt: String
};

const DatasetSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    default: null
  },
  userId: {
    //abandon
    type: Schema.Types.ObjectId,
    ref: userCollectionName
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
  type: {
    type: String,
    enum: Object.keys(DatasetTypeMap),
    required: true,
    default: DatasetTypeEnum.dataset
  },
  avatar: String,
  name: {
    type: String,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  vectorModel: {
    type: String
  },
  vectorModelId: {
    type: String
  },
  agentModel: {
    type: String
  },
  agentModelId: {
    type: String
  },
  vlmModel: String,
  vlmModelId: {
    type: String
  },
  intro: {
    type: String,
    default: ''
  },
  websiteConfig: {
    type: {
      url: {
        type: String,
        required: true
      },
      selector: {
        type: String,
        default: 'body'
      }
    }
  },
  chunkSettings: {
    type: ChunkSettings
  },
  // 外部文档解析服务开关,整体存取;缺失字段由读取层用固定默认值补全
  sangforFileParseConfig: {
    type: {
      keep_header_footer: Boolean,
      keep_appendix: Boolean,
      image_analysis: Boolean,
      chart_analysis: Boolean
    }
  },
  inheritPermission: {
    type: Boolean,
    default: true
  },
  // collection 级权限开关（显式、可逆）：关闭态（默认，含存量数据）时 collection 可读性 == dataset 可读，
  // 不依赖任何 collection ACL 行；启用态逐 collection 解析物化快照（由启用接口负责物化）。
  collectionPermissionEnabled: {
    type: Boolean,
    default: false
  },

  apiDatasetServer: Object,

  // 软删除标记字段
  deleteTime: {
    type: Date,
    default: null // null表示未删除，有值表示删除时间
  },

  autoSync: Boolean,
  /** @deprecated */
  externalReadUrl: String,
  /** @deprecated */
  defaultPermission: Number,
  /** @deprecated */
  apiServer: Object,
  /** @deprecated */
  feishuServer: Object,
  /** @deprecated */
  yuqueServer: Object
});

defineIndex(DatasetSchema, { key: { teamId: 1, createTime: 1 } });
defineIndex(DatasetSchema, { key: { teamId: 1, updateTime: -1 } });
defineIndex(DatasetSchema, { key: { teamId: 1, parentId: 1 } });
defineIndex(DatasetSchema, { key: { type: 1 } }); // Admin count
defineIndex(DatasetSchema, { key: { deleteTime: 1 } }); // 添加软删除字段索引

defineIndex(DatasetSchema, { key: { teamId: 1 }, deprecated: true });

export const MongoDataset = getMongoModel<DatasetSchemaType>(DatasetCollectionName, DatasetSchema);

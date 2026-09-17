import {
  SYSTEM_INSTANCE_CONFIG_ID,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  SystemInstanceConfigSchema,
  parseSystemInstanceConfig
} from '@fastgpt/global/common/system/config/schema';
import type { SystemInstanceConfigDocumentType } from '@fastgpt/global/common/system/config/type';
import { connectionMongo, getMongoModel } from '../../mongo';

const { Schema } = connectionMongo;

const systemInstanceConfigCollectionName = 'system_instance_configs';

const systemInstanceConfigUpdatedBySchema = new Schema(
  {
    userId: {
      type: String
    },
    actor: {
      type: String,
      enum: ['admin', 'migration', 'system'],
      required: true
    },
    username: {
      type: String
    }
  },
  { _id: false, strict: 'throw' }
);

/**
 * 实例级运行配置的持久化模型。整个实例只有一份文档，config 保存完整生效值。
 */
const systemInstanceConfigSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      default: SYSTEM_INSTANCE_CONFIG_ID,
      immutable: true,
      enum: [SYSTEM_INSTANCE_CONFIG_ID]
    },
    schemaVersion: {
      type: Number,
      required: true,
      default: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
      min: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
      max: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
      validate: Number.isInteger
    },
    revision: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isInteger
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => parseSystemInstanceConfig({}),
      validate: {
        validator: (value: unknown) => SystemInstanceConfigSchema.safeParse(value).success,
        message: 'Invalid instance config payload'
      }
    },
    updatedBy: {
      type: systemInstanceConfigUpdatedBySchema
    }
  },
  {
    collection: systemInstanceConfigCollectionName,
    timestamps: true,
    minimize: false,
    strict: 'throw',
    versionKey: false
  }
);

export const MongoSystemInstanceConfig = getMongoModel<SystemInstanceConfigDocumentType>(
  systemInstanceConfigCollectionName,
  systemInstanceConfigSchema
);

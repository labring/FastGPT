import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  type SystemInstanceConfigDomainKey,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import type { SystemInstanceDomainDocumentType } from '@fastgpt/global/common/system/config/type';
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
 * 实例级运行配置持久化模型：按 Domain 存储为独立文档，_id 为 domainKey。
 * overrides 字段仅存储相对于代码内置默认值的稀疏增量。
 */
const systemInstanceConfigSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
      enum: SYSTEM_INSTANCE_CONFIG_DOMAINS
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
    overrides: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
      validate: {
        validator: function (this: any, value: unknown) {
          const domain: SystemInstanceConfigDomainKey | undefined =
            this?._id ??
            (typeof this?.get === 'function' ? this.get('_id') : undefined) ??
            this?.getFilter?.()?._id;

          if (!domain || !SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(domain)) {
            return false;
          }

          try {
            resolveDomainEffectiveConfig(domain, value);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid overrides payload for domain'
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

export const MongoSystemInstanceConfig = getMongoModel<SystemInstanceDomainDocumentType>(
  systemInstanceConfigCollectionName,
  systemInstanceConfigSchema
);

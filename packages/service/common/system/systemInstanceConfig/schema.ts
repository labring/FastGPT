import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  SYSTEM_INSTANCE_CONFIG_SCOPES,
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  type SystemInstanceConfigDomainKey,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import { systemInstanceConfigScopeSchemaMap } from '@fastgpt/global/common/system/config/scopes';
import type { SystemInstanceDomainDocumentType } from '@fastgpt/global/common/system/config/type';
import { connectionMongo, getMongoModel, defineIndex } from '../../mongo';

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
 * 实例级运行配置持久化模型：按 Domain 存储为独立文档，通过 domain 唯一索引定位。
 * _id 由 MongoDB 自动生成 ObjectId，业务域 overrides 保存稀疏增量。
 * Pro ENV 是同集合内的独占 scope，保存 ENV 派生快照，不向表单或配置文件开放。
 */
const systemInstanceConfigSchema = new Schema(
  {
    domain: {
      type: String,
      required: true,
      immutable: true,
      enum: SYSTEM_INSTANCE_CONFIG_SCOPES
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
          const domain: string | undefined =
            (typeof this?.domain === 'string' ? this.domain : undefined) ??
            (typeof this?.getFilter === 'function' && typeof this.getFilter()?.domain === 'string'
              ? this.getFilter()?.domain
              : undefined) ??
            (typeof this?.get === 'function' && typeof this.get('domain') === 'string'
              ? this.get('domain')
              : undefined) ??
            // 兼容可能存在的旧文档
            (typeof this?._id === 'string' &&
            SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(this._id as any)
              ? this._id
              : undefined);

          if (domain && Object.hasOwn(systemInstanceConfigScopeSchemaMap, domain)) {
            return systemInstanceConfigScopeSchemaMap[
              domain as keyof typeof systemInstanceConfigScopeSchemaMap
            ].safeParse(value).success;
          }
          if (
            !domain ||
            !SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(domain as SystemInstanceConfigDomainKey)
          ) {
            return false;
          }

          try {
            resolveDomainEffectiveConfig({
              domain: domain as SystemInstanceConfigDomainKey,
              overrides: value
            });
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid overrides payload for domain'
      }
    },
    // 使用方明确保存为「内置默认值」而被剪枝的叶子路径（dotted）：
    // overrides 里缺失既可能是"从未配置"，也可能是"明确清空"，回填只能补前者
    explicitDefaultPaths: {
      type: [String],
      required: true,
      default: () => []
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
    versionKey: false,
    // 覆盖连接串的副本读取偏好，让运行时、管理端及迁移读到同一主库配置。
    read: 'primary',
    writeConcern: { w: 'majority' }
  }
);

defineIndex(systemInstanceConfigSchema, {
  key: { domain: 1 },
  options: { unique: true }
});

export const MongoSystemInstanceConfig = getMongoModel<SystemInstanceDomainDocumentType>(
  systemInstanceConfigCollectionName,
  systemInstanceConfigSchema
);

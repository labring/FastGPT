import { type SystemConfigsType } from '@fastgpt/global/common/system/config/type';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import {
  SystemConfigsTypeEnum,
  SystemConfigsTypeMap
} from '@fastgpt/global/common/system/config/constants';

const { Schema } = connectionMongo;

const collectionName = 'systemConfigs';
const systemConfigSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: Object.keys(SystemConfigsTypeMap)
    },
    value: {
      type: Object,
      required: true
    },
    createTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    // 此模型仅供迁移读取历史配置；从主库读取，避免迁入滞后副本中的旧快照。
    read: 'primary',
    writeConcern: { w: 'majority' }
  }
);

defineIndex(systemConfigSchema, { key: { type: 1 } });
// 开发期新增的运行时唯一约束已随 scope 迁出而废弃；保留旧来源快照及普通 type 索引。
defineIndex(systemConfigSchema, {
  key: { type: 1 },
  deprecated: true,
  options: {
    name: 'runtime_scope_type_unique',
    unique: true,
    partialFilterExpression: {
      type: {
        $in: [
          SystemConfigsTypeEnum.proEnv,
          SystemConfigsTypeEnum.subPlans,
          SystemConfigsTypeEnum.langfuse
        ]
      }
    }
  }
});

export const MongoSystemConfigs = getMongoModel<SystemConfigsType>(
  collectionName,
  systemConfigSchema
);

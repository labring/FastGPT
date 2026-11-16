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
    // 配置按变更事件刷新内存，不能将滞后副本的旧值当作一次成功刷新长期缓存。
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

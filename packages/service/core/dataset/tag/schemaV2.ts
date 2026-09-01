import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import { DatasetCollectionName } from '../schema';
import { type DatasetCollectionTagsSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';
const { Schema } = connectionMongo;

export const DatasetCollectionTagsV2Name = 'dataset_collection_tags_v2';

const DatasetCollectionTagsV2Schema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  tag: {
    type: String,
    required: true
    // COMMENT: 标签名称。default_tag 承载记录由 fromMigration 标识，名称可改
  },
  tagType: {
    type: String,
    default: 'string',
    enum: Object.values(DatasetCollectionTagTypeEnum)
    // COMMENT: 标签类型。string=字符串比较, number=数值比较, datetime=时间戳比较, array=字符串数组集合比较(V2.0)
  },
  options: {
    type: [String]
    // COMMENT: array 类型标签的预设选项。集合写入选项值时合并新增项，标签管理可覆盖删除
  },
  fromMigration: {
    type: Boolean,
    default: false
    // COMMENT: 迁移/旧格式输入创建的 default_tag 承载记录；过滤按该字段定位而非标签名
  }
});

// unique 索引保证并发写入下同一作用域标签名不重复
defineIndex(DatasetCollectionTagsV2Schema, {
  key: { teamId: 1, datasetId: 1, tag: 1 },
  options: { unique: true }
});

export const MongoDatasetCollectionTagsV2 = getMongoModel<DatasetCollectionTagsSchemaType>(
  DatasetCollectionTagsV2Name,
  DatasetCollectionTagsV2Schema
);

import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { getMongoModel, Schema } from '../../../common/mongo';

export const TagCollectionName = 'app_tags';

export type TagSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  color: string;
  createTime: Date;
};

const TagSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#3370ff'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// 创建复合索引：按团队和名称确保唯一性
TagSchema.index({ teamId: 1, name: 1 }, { unique: true });

export const MongoTag = getMongoModel<TagSchemaType>(TagCollectionName, TagSchema);

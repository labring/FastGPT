import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { AppCollectionName } from '../../app/schema';
import type { AiSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';

const AppAISkillSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: TeamCollectionName
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: TeamMemberCollectionName
  },
  appId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: AppCollectionName
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },

  name: {
    type: String,
    required: true
  },
  description: String,
  steps: {
    type: String,
    default: ''
  },
  tools: {
    type: [Object],
    default: []
  },
  datasets: {
    type: [Object],
    default: []
  }
});

// 复合索引
AppAISkillSchema.index({ teamId: 1, appId: 1, updateTime: -1 });

export const MongoAiSkill = getMongoModel<AiSkillSchemaType>('app_ai_skills', AppAISkillSchema);

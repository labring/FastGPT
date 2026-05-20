import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import {
  agentSkillsCollectionName,
  agentSkillsVersionCollectionName
} from '@fastgpt/global/core/ai/skill/constants';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/ai/skill/type';

const { Schema } = connectionMongo;

/**
 * Skill 版本表。
 *
 * 版本记录只保留真实存在的版本，不维护删除状态。删除某个非当前版本时，
 * 直接删除版本记录；删除整个 skill 时由 skill 删除队列最终硬删关联版本。
 */
const AgentSkillsVersionSchema = new Schema({
  skillId: {
    type: Schema.Types.ObjectId,
    ref: agentSkillsCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  versionName: {
    type: String,
    default: ''
  },
  // 对应版本包的私有对象存储 key。
  storageKey: {
    type: String,
    required: true
  },
  // 导入来源信息，仅导入场景存在。
  importSource: {
    originalFilename: String,
    importedAt: Date
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

try {
  // 版本列表按 skillId 查询并按创建时间倒序展示。
  AgentSkillsVersionSchema.index({ skillId: 1, createdAt: -1, _id: -1 });
} catch (error) {
  console.log('SkillVersion index error:', error);
}

export const MongoAgentSkillsVersion = getMongoModel<AgentSkillsVersionSchemaType>(
  agentSkillsVersionCollectionName,
  AgentSkillsVersionSchema
);

import { connectionMongo, getMongoModel } from '../../common/mongo';
import {
  agentSkillsCollectionName as agentSkillsCollectionName,
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';

const { Schema } = connectionMongo;

const AgentSkillsSchema = new Schema({
  // Folder hierarchy
  parentId: {
    type: Schema.Types.ObjectId,
    ref: agentSkillsCollectionName,
    default: null
  },
  type: {
    type: String,
    enum: Object.values(AgentSkillTypeEnum),
    default: AgentSkillTypeEnum.skill
  },
  // Permission inheritance
  inheritPermission: {
    type: Boolean,
    default: true
  },
  source: {
    type: String,
    enum: Object.values(AgentSkillSourceEnum),
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  author: {
    type: String,
    default: ''
  },
  category: {
    type: [String],
    enum: Object.values(AgentSkillCategoryEnum),
    default: []
  },
  config: {
    type: Object,
    default: {}
  },
  avatar: {
    type: String
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'team'
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  deleteTime: {
    type: Date,
    default: null
  },
  // === Version Control ===
  currentVersion: {
    type: Number,
    default: 0
  },
  versionCount: {
    type: Number,
    default: 0
  },
  currentStorage: {
    bucket: String,
    key: String,
    size: Number
  }
});

// Create indexes
try {
  // Text index for search
  AgentSkillsSchema.index({ name: 'text', description: 'text' });
  // Compound index for list queries
  AgentSkillsSchema.index({ source: 1, teamId: 1, deleteTime: 1, createTime: -1 });
  // Category index
  AgentSkillsSchema.index({ category: 1 });
  // Folder hierarchy index
  AgentSkillsSchema.index({ parentId: 1, teamId: 1, deleteTime: 1 });
  // Unique constraint: same parent folder cannot have two live skills/folders with the same name (personal only)
  AgentSkillsSchema.index(
    { parentId: 1, name: 1, teamId: 1, deleteTime: 1 },
    {
      unique: true,
      partialFilterExpression: { deleteTime: null, source: AgentSkillSourceEnum.personal }
    }
  );
} catch (error) {
  console.log('AgentSkill index error:', error);
}

export const MongoAgentSkills = getMongoModel<AgentSkillSchemaType>(
  agentSkillsCollectionName,
  AgentSkillsSchema
);

import { connectionMongo, getMongoModel } from '../../common/mongo';
import {
  agentSkillsCollectionName as agentSkillsCollectionName,
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum
} from '@fastgpt/global/core/agentSkill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkill/type';

const { Schema } = connectionMongo;

const AgentSkillsSchema = new Schema({
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
  markdown: {
    type: String,
    required: true
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
  // Removed unique index on name to allow duplicate skill names
  // AgentSkillSchema.index(
  //   { name: 1, teamId: 1, deleteTime: 1 },
  //   { unique: true, partialFilterExpression: { deleteTime: null } }
  // );
} catch (error) {
  console.log('AgentSkill index error:', error);
}

export const MongoAgentSkills = getMongoModel<AgentSkillSchemaType>(
  agentSkillsCollectionName,
  AgentSkillsSchema
);

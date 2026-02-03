import { connectionMongo, getMongoModel } from '../../common/mongo';
import {
  skillCollectionName,
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum
} from '@fastgpt/global/core/agentSkill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkill/type';

const { Schema } = connectionMongo;

const AgentSkillSchema = new Schema({
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
  }
});

// Create indexes
try {
  // Text index for search
  AgentSkillSchema.index({ name: 'text', description: 'text' });
  // Compound index for list queries
  AgentSkillSchema.index({ source: 1, teamId: 1, deleteTime: 1, createTime: -1 });
  // Category index
  AgentSkillSchema.index({ category: 1 });
  // Name unique index for personal skills (per team)
  AgentSkillSchema.index(
    { name: 1, teamId: 1, deleteTime: 1 },
    { unique: true, partialFilterExpression: { deleteTime: null } }
  );
} catch (error) {
  console.log('AgentSkill index error:', error);
}

export const MongoAgentSkill = getMongoModel<AgentSkillSchemaType>(
  skillCollectionName,
  AgentSkillSchema
);

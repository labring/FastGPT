/**
 * Skill Version Schema
 *
 * Defines the database schema for skill versions.
 */

import { connectionMongo, getMongoModel } from '../../common/mongo';
import { skillVersionCollectionName } from '@fastgpt/global/core/agentSkill/constants';
import type { SkillVersionSchemaType } from '@fastgpt/global/core/agentSkill/type';

const { Schema } = connectionMongo;

const SkillVersionSchema = new Schema({
  skillId: {
    type: Schema.Types.ObjectId,
    ref: 'skill',
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members',
    required: true
  },
  version: {
    type: Number,
    required: true
  },
  versionName: {
    type: String,
    default: ''
  },
  // Snapshot of skill data
  markdown: {
    type: String,
    required: true
  },
  config: {
    type: Object,
    default: {}
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: [String],
    default: []
  },
  // Storage information
  storage: {
    bucket: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    checksum: {
      type: String
    }
  },
  // Import source (optional)
  importSource: {
    originalFilename: String,
    importedAt: Date
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

// Create indexes
try {
  // Index for listing versions of a skill
  SkillVersionSchema.index({ skillId: 1, isDeleted: 1, version: -1 });

  // Index for finding active version
  SkillVersionSchema.index({ skillId: 1, isActive: 1 });

  // Unique index to prevent duplicate versions
  SkillVersionSchema.index({ skillId: 1, version: 1 }, { unique: true });
} catch (error) {
  console.log('SkillVersion index error:', error);
}

export const MongoSkillVersion = getMongoModel<SkillVersionSchemaType>(
  skillVersionCollectionName,
  SkillVersionSchema
);

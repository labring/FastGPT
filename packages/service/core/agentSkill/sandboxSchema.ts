/**
 * Skill Sandbox Schema
 *
 * Defines the database schema for skill sandbox instances.
 * Supports both edit-debug and session-runtime sandbox types.
 */

import { connectionMongo, getMongoModel } from '../../common/mongo';
import { skillSandboxCollectionName } from '@fastgpt/global/core/agentSkill/constants';
import type { SkillSandboxSchemaType } from '@fastgpt/global/core/agentSkill/type';

const { Schema } = connectionMongo;

const SkillSandboxSchema = new Schema({
  skillId: {
    type: Schema.Types.ObjectId,
    ref: 'agent_skills',
    required: true
  },
  sandboxType: {
    type: String,
    enum: ['edit-debug', 'session-runtime'],
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members',
    required: true
  },

  // Sandbox provider information
  sandbox: {
    provider: {
      type: String,
      required: true,
      default: 'opensandbox'
    },
    sandboxId: {
      type: String,
      required: true
    },
    image: {
      repository: {
        type: String,
        required: true
      },
      tag: {
        type: String,
        default: 'latest'
      }
    },
    status: {
      state: {
        type: String,
        required: true
      },
      message: String,
      reason: String
    },
    createdAt: {
      type: Date,
      required: true
    },
    expiresAt: Date
  },

  // Endpoint information
  endpoint: {
    host: String,
    port: Number,
    protocol: {
      type: String,
      enum: ['http', 'https'],
      default: 'http'
    },
    url: String
  },

  // Storage information
  storage: {
    bucket: String,
    key: String,
    size: Number,
    uploadedAt: Date
  },

  // Metadata
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: new Map()
  },

  // Timestamps
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
  lastActivityTime: {
    type: Date,
    default: () => new Date()
  }
});

// Create indexes
try {
  // Index for team-based queries
  SkillSandboxSchema.index({ teamId: 1, deleteTime: 1, createTime: -1 });

  // Index for cleanup operations (find inactive sandboxes)
  SkillSandboxSchema.index({ lastActivityTime: 1, deleteTime: 1 });

  // Unique index: only one active edit-debug sandbox per skill
  // Also serves as index for querying active sandboxes by skillId and type
  SkillSandboxSchema.index(
    { skillId: 1, sandboxType: 1, deleteTime: 1 },
    {
      unique: true,
      partialFilterExpression: {
        sandboxType: 'edit-debug',
        deleteTime: null
      }
    }
  );

  // Index for provider sandbox lookup
  SkillSandboxSchema.index({ 'sandbox.provider': 1, 'sandbox.sandboxId': 1 });
} catch (error) {
  console.log('SkillSandbox index error:', error);
}

export const MongoSkillSandbox = getMongoModel<SkillSandboxSchemaType>(
  skillSandboxCollectionName,
  SkillSandboxSchema
);

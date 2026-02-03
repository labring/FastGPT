import type { AgentSkillSourceEnum, AgentSkillCategoryEnum } from './constants';

export type AgentSkillSchemaType = {
  _id: string;

  // Source
  source: `${AgentSkillSourceEnum}`;

  // Metadata
  name: string;
  description: string;
  markdown: string; // SKILL.md content
  author: string; // userId or 'system'
  category: `${AgentSkillCategoryEnum}`[];

  // Config
  config: Record<string, any>;

  // Optional fields
  avatar?: string;

  // Team/Auth
  teamId?: string;
  tmbId?: string;

  // Timestamps
  createTime: Date;
  updateTime: Date;
  deleteTime?: Date | null;

  // === Version Control ===
  currentVersion: number; // Current active version number
  versionCount: number; // Total version count
  currentStorage?: {
    bucket: string;
    key: string; // e.g.g. skills/{teamId}/{skillId}/v{n}/package.zip
    size: number;
  };
};

// List view (lightweight)
export type AgentSkillListItemType = {
  _id: string;
  source: `${AgentSkillSourceEnum}`;
  name: string;
  description: string;
  author: string;
  category: `${AgentSkillCategoryEnum}`[];
  avatar?: string;
  createTime: Date;
  updateTime: Date;
};

// Detail view (full)
export type AgentSkillDetailType = AgentSkillSchemaType;

// Skill Version Schema
export type SkillVersionSchemaType = {
  _id: string;
  skillId: string;
  tmbId: string;
  version: number;
  versionName?: string;
  // Snapshot of skill data
  markdown: string;
  config: Record<string, any>;
  description: string;
  category: string[];
  // Storage information
  storage: {
    bucket: string;
    key: string;
    size: number;
    checksum?: string;
  };
  // Import source (optional)
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
};

// Skill config type
export type AgentSkillConfigType = {
  // Tool parameters
  parameters?: {
    name: string;
    type: string;
    description: string;
    required?: boolean;
    default?: any;
  }[];

  // API config for external tools
  api?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    timeout?: number;
  };

  // Custom fields
  [key: string]: any;
};

// Skill package structure for import/export
export type SkillPackageType = {
  skill: {
    name: string;
    description: string;
    category: `${AgentSkillCategoryEnum}`[];
    config: Record<string, any>;
    avatar?: string;
  };
  markdown: string;
};

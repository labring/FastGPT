import type { AgentSkillCategoryEnum, AgentSkillSourceEnum } from './constants';
import type {
  AgentSkillConfigType,
  ExtractedSkillPackage,
  SkillPackageType,
  ZipEntryInfo
} from './type';

// ==================== List Skills ====================
export type ListSkillsQuery = {
  source?: 'store' | 'mine'; // store = system skills, mine = personal skills
  searchKey?: string;
  category?: `${AgentSkillCategoryEnum}`;
  page?: number;
  pageSize?: number;
};

export type ListSkillsResponse = {
  list: {
    _id: string;
    source: `${AgentSkillSourceEnum}`;
    name: string;
    description: string;
    author: string;
    category: `${AgentSkillCategoryEnum}`[];
    avatar?: string;
    createTime: string;
    updateTime: string;
  }[];
  total: number;
};

// ==================== Create Skill ====================
export type CreateSkillBody = {
  name: string;
  description: string;
  category?: `${AgentSkillCategoryEnum}`[];
  config?: AgentSkillConfigType;
  avatar?: string;
};

export type CreateSkillResponse = string; // skillId

// ==================== Update Skill ====================
export type UpdateSkillBody = {
  skillId: string;
  name?: string;
  description?: string;
  category?: `${AgentSkillCategoryEnum}`[];
  config?: AgentSkillConfigType;
  avatar?: string;
};

export type UpdateSkillResponse = void;

// ==================== Delete Skill ====================
export type DeleteSkillQuery = {
  skillId: string;
};

export type DeleteSkillResponse = void;

// ==================== Get Skill Detail ====================
export type GetSkillDetailQuery = {
  skillId: string;
};

export type GetSkillDetailResponse = {
  _id: string;
  source: `${AgentSkillSourceEnum}`;
  name: string;
  description: string;
  author: string;
  category: `${AgentSkillCategoryEnum}`[];
  config: AgentSkillConfigType;
  avatar?: string;
  teamId?: string;
  tmbId?: string;
  createTime: string;
  updateTime: string;
};

// ==================== Import Skill ====================
export type ImportSkillBody = {
  name?: string; // required for multi-skill packages; optional for single-skill (falls back to SKILL.md)
  description?: string; // optional, fallback to SKILL.md or ''
};

export type ImportSkillResponse = string; // single skillId

// ==================== Skill Sandbox API ====================

// Create Edit-Debug Sandbox
export type CreateEditDebugSandboxBody = {
  skillId: string;
  image?: {
    repository: string;
    tag?: string;
  };
  timeout?: number; // in seconds, default 3600
};

export type CreateEditDebugSandboxResponse = {
  sandboxId: string; // MongoDB _id
  providerSandboxId: string; // Provider's sandbox ID
  endpoint: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    url: string;
  };
  status: {
    state: string;
    message?: string;
  };
  expiresAt?: string; // ISO date string
};

// Get Sandbox Info
export type GetSandboxInfoQuery = {
  sandboxId: string;
};

export type GetSandboxInfoResponse = {
  sandboxId: string;
  skillId: string;
  sandboxType: string;
  providerSandboxId: string;
  endpoint?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    url: string;
  };
  status: {
    state: string;
    message?: string;
  };
  createTime: string;
  lastActivityTime: string;
  expiresAt?: string;
};

// Delete Sandbox
export type DeleteSandboxBody = {
  sandboxId: string;
};

export type DeleteSandboxResponse = void;

// Renew Sandbox Expiration
export type RenewSandboxBody = {
  sandboxId: string;
  additionalSeconds?: number; // default 3600
};

export type RenewSandboxResponse = {
  expiresAt?: string;
};

// ==================== Save/Deploy Skill ====================
export type SaveDeploySkillBody = {
  skillId: string;
  versionName?: string;
  description?: string;
};

export type SaveDeploySkillResponse = {
  skillId: string;
  version: number;
  versionName: string;
  storage: {
    bucket: string;
    key: string;
    size: number;
  };
  createdAt: string;
};

// ==================== Export Types from type.d.ts ====================
export type { ExtractedSkillPackage, SkillPackageType, ZipEntryInfo };

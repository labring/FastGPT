import type { AgentSkillCategoryEnum, AgentSkillSourceEnum, AgentSkillTypeEnum } from './constants';
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
  parentId?: string | null; // Filter by parent folder
  page?: number;
  pageSize?: number;
};

export type ListSkillsResponse = {
  list: {
    _id: string;
    source: `${AgentSkillSourceEnum}`;
    type: `${AgentSkillTypeEnum}`;
    parentId?: string | null;
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
  parentId?: string | null; // Parent folder ID
  name: string;
  description?: string; // Optional: manual description
  requirements?: string; // Optional: skill requirements text for AI generation (max 8000 chars)
  model?: string; // Optional: LLM model for generation (required if requirements is provided)
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
/**
 * ImportSkillBody — optional metadata fields for multipart/form-data upload.
 * The actual archive file (ZIP / TAR / TAR.GZ) must be sent as the `file` field
 * in a multipart/form-data request; it is not represented in this type.
 */
export type ImportSkillBody = {
  name?: string; // required for multi-skill packages; optional for single-skill (falls back to SKILL.md)
  description?: string; // optional, fallback to SKILL.md or ''
  avatar?: string; // optional skill icon/avatar URL or base64
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
};

// Delete Sandbox
export type DeleteSandboxBody = {
  sandboxId: string;
};

export type DeleteSandboxResponse = void;

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

// ==================== Skill Debug Chat ====================
export type SkillDebugChatBody = {
  skillId: string;
  chatId: string;
  responseChatItemId?: string; // optional: server auto-generates if not provided
  messages: import('../ai/type').ChatCompletionMessageParam[];
  model?: string;
  systemPrompt?: string;
};

// ==================== Skill Debug Session List ====================
export type SkillDebugSessionListQuery = {
  skillId: string;
  pageNum?: number;
  pageSize?: number;
};

export type SkillDebugSessionListResponse = {
  list: {
    chatId: string;
    title: string;
    updateTime: string;
  }[];
  total: number;
};

// ==================== Skill Debug Session Delete ====================
export type SkillDebugSessionDeleteBody = {
  skillId: string;
  chatId: string;
};

// ==================== Create Skill Folder ====================
export type CreateSkillFolderBody = {
  parentId?: string | null;
  name: string;
  description?: string;
};

export type CreateSkillFolderResponse = {
  folderId: string;
};

// ==================== Get Skill Folder Path ====================
export type GetSkillFolderPathQuery = {
  sourceId?: string;
  type: 'current' | 'parent';
};

export type GetSkillFolderPathResponse = {
  parentId: string | null;
  parentName: string;
}[];

// ==================== Export Skill ====================
export type ExportSkillQuery = {
  skillId: string;
};

import type {
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum,
  SandboxTypeEnum,
  SandboxStatusEnum
} from './constants';

export type AgentSkillSchemaType = {
  _id: string;

  // Source
  source: `${AgentSkillSourceEnum}`;

  // Metadata
  name: string;
  description: string;
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
    key: string; // e.g.g. agent-skills/{teamId}/{skillId}/v{n}/package.zip
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

// Agent Skills Version Schema
export type AgentSkillsVersionSchemaType = {
  _id: string;
  skillId: string;
  tmbId: string;
  version: number;
  versionName?: string;
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
    /** Request timeout in seconds */
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
};

// ZIP entry information
export type ZipEntryInfo = {
  name: string; // Path relative to ZIP root (e.g. 'SKILL.md', 'resources/image.png')
  size: number; // File size in bytes
  isDirectory: boolean; // Whether it's a directory
  uncompressedSize?: number; // Uncompressed size (for compressed files)
  compressionMethod?: number; // Compression method used
};

// Extended skill package result from extraction
export type ExtractedSkillPackage = {
  skillPackage: SkillPackageType; // Parsed skill package
  zipBuffer: Buffer; // Complete ZIP file buffer for storage
  zipEntries: ZipEntryInfo[]; // All entries metadata
  totalSize: number; // Total ZIP size in bytes
};

// ==================== Skill Sandbox Types ====================

export type SkillSandboxEndpointType = {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
};

export type SandboxImageConfigType = {
  repository: string;
  tag?: string;
};

// ==================== Sandbox Instance Types ====================

export type SandboxInstanceSchemaType = {
  _id: string;

  // Provider sandbox ID (unique, used for connect/resumeSandbox)
  sandboxId: string;
  // edit-debug: skillId; session-runtime: appId (ObjectId string)
  appId: string;
  // tmbId (creator)
  userId: string;
  // edit-debug: constant 'edit-debug'; session-runtime: chatId
  chatId: string;

  status: `${SandboxStatusEnum}`;
  lastActiveAt: Date;
  createdAt: Date;

  // Embedded provider details
  detail: {
    sandboxType: `${SandboxTypeEnum}`;
    teamId: string;
    tmbId: string;
    skillId?: string; // edit-debug associated skillId
    sessionId?: string; // session-runtime session identifier
    skillIds?: string[]; // session-runtime deployed skill list
    provider: string;
    image: { repository: string; tag?: string };
    providerStatus: { state: string; message?: string; reason?: string };
    providerCreatedAt: Date;
    endpoint?: SkillSandboxEndpointType;
    storage?: { bucket: string; key: string; size: number; uploadedAt: Date };
    metadata?: Map<string, any>;
  };
};

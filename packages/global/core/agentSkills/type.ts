import { z } from 'zod';
import {
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum,
  SandboxProtocolEnum,
  SandboxTypeEnum
} from './constants';
import { SandboxStatusEnum } from '../ai/sandbox/constants';

const BufferSchema = z.custom<Buffer>(
  (value) => typeof Buffer !== 'undefined' && Buffer.isBuffer(value),
  'Expected Buffer'
);

export const AgentSkillSourceSchema = z.enum(AgentSkillSourceEnum);
export const AgentSkillCategorySchema = z.enum(AgentSkillCategoryEnum);
export const AgentSkillTypeSchema = z.enum(AgentSkillTypeEnum);
export const SandboxProtocolSchema = z.enum(SandboxProtocolEnum);
export const SandboxTypeSchema = z.enum(SandboxTypeEnum);
export const SandboxStatusSchema = z.enum([
  SandboxStatusEnum.running,
  SandboxStatusEnum.stopped
] as const);

export const AgentSkillConfigParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  default: z.any().optional()
});

export const AgentSkillApiConfigSchema = z.object({
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().optional()
});

export const AgentSkillConfigSchema = z
  .object({
    parameters: z.array(AgentSkillConfigParameterSchema).optional(),
    api: AgentSkillApiConfigSchema.optional()
  })
  .catchall(z.any());
export type AgentSkillConfigType = z.infer<typeof AgentSkillConfigSchema>;

export const AgentSkillStorageSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  size: z.number()
});

export const SkillVersionStorageSchema = AgentSkillStorageSchema.extend({
  checksum: z.string().optional()
});

export const AgentSkillSchema = z.object({
  _id: z.string(),
  parentId: z.string().nullable().optional(),
  type: AgentSkillTypeSchema,
  inheritPermission: z.boolean().optional(),
  source: AgentSkillSourceSchema,
  name: z.string(),
  description: z.string(),
  author: z.string(),
  category: z.array(AgentSkillCategorySchema),
  config: AgentSkillConfigSchema,
  avatar: z.string().optional(),
  teamId: z.string(),
  tmbId: z.string(),
  createTime: z.date(),
  updateTime: z.date(),
  deleteTime: z.date().nullable().optional(),
  currentVersion: z.number(),
  versionCount: z.number(),
  currentStorage: AgentSkillStorageSchema.optional()
});
export type AgentSkillSchemaType = z.infer<typeof AgentSkillSchema>;

export const AgentSkillListItemSchema = z.object({
  _id: z.string(),
  source: AgentSkillSourceSchema,
  type: AgentSkillTypeSchema,
  parentId: z.string().nullable().optional(),
  inheritPermission: z.boolean().optional(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  category: z.array(AgentSkillCategorySchema),
  avatar: z.string().optional(),
  createTime: z.date(),
  updateTime: z.date(),
  appCount: z.number().optional(),
  sourceMember: z
    .object({
      name: z.string(),
      avatar: z.string().nullable().optional(),
      status: z.string()
    })
    .optional()
});
export type AgentSkillListItemType = z.infer<typeof AgentSkillListItemSchema>;

export const AgentSkillDetailSchema = AgentSkillSchema.extend({
  appCount: z.number().optional(),
  permission: z.any().optional()
});
export type AgentSkillDetailType = z.infer<typeof AgentSkillDetailSchema>;

export const AgentSkillsVersionImportSourceSchema = z.object({
  originalFilename: z.string(),
  importedAt: z.date()
});

export const AgentSkillsVersionSchema = z.object({
  _id: z.string(),
  skillId: z.string(),
  tmbId: z.string(),
  version: z.number(),
  versionName: z.string().optional(),
  storage: SkillVersionStorageSchema,
  importSource: AgentSkillsVersionImportSourceSchema.optional(),
  isActive: z.boolean(),
  isDeleted: z.boolean(),
  createdAt: z.date()
});
export type AgentSkillsVersionSchemaType = z.infer<typeof AgentSkillsVersionSchema>;

export const SkillPackageSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.array(AgentSkillCategorySchema),
  config: AgentSkillConfigSchema,
  avatar: z.string().optional()
});

export const SkillPackageSchema = z.object({
  skill: SkillPackageSkillSchema
});
export type SkillPackageType = z.infer<typeof SkillPackageSchema>;

export const ZipEntryInfoSchema = z.object({
  name: z.string(),
  size: z.number(),
  isDirectory: z.boolean(),
  uncompressedSize: z.number().optional(),
  compressionMethod: z.number().optional()
});
export type ZipEntryInfo = z.infer<typeof ZipEntryInfoSchema>;

export const ExtractedSkillPackageSchema = z.object({
  skillPackage: SkillPackageSchema,
  zipBuffer: BufferSchema,
  zipEntries: z.array(ZipEntryInfoSchema),
  totalSize: z.number()
});
export type ExtractedSkillPackage = z.infer<typeof ExtractedSkillPackageSchema>;

export const SkillSandboxEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  protocol: SandboxProtocolSchema,
  url: z.string()
});
export type SkillSandboxEndpointType = z.infer<typeof SkillSandboxEndpointSchema>;

export const SandboxImageConfigSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});
export type SandboxImageConfigType = z.infer<typeof SandboxImageConfigSchema>;

export const SandboxProviderStatusSchema = z.object({
  state: z.string(),
  message: z.string().optional(),
  reason: z.string().optional()
});

export const SandboxStorageSchema = AgentSkillStorageSchema.extend({
  uploadedAt: z.date()
});

export const SandboxInstanceMetadataSchema = z.object({
  sandboxType: SandboxTypeSchema.optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),
  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  provider: z.string().optional(),
  image: SandboxImageConfigSchema.optional(),
  providerStatus: SandboxProviderStatusSchema.optional(),
  providerCreatedAt: z.date().optional(),
  endpoint: SkillSandboxEndpointSchema.optional(),
  storage: SandboxStorageSchema.optional(),
  skillName: z.string().optional(),
  skillVersion: z.string().optional(),
  volumeEnabled: z.boolean().optional()
});

export const SandboxInstanceSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  appId: z.string(),
  userId: z.string(),
  chatId: z.string(),
  status: SandboxStatusSchema,
  lastActiveAt: z.date(),
  createdAt: z.date(),
  metadata: SandboxInstanceMetadataSchema.optional()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceSchema>;

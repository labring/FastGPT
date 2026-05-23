import z from 'zod';
import {
  AgentSkillSourceEnum,
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum,
  AgentSkillCreationStatusEnum,
  SandboxTypeEnum
} from './constants';
import { SandboxStatusEnum } from '../sandbox/constants';

const LooseObjectSchema = z.object({}).catchall(z.any());
const BufferSchema = z.custom<Buffer>(
  (value) => typeof Buffer !== 'undefined' && Buffer.isBuffer(value),
  'Expected Buffer'
);

export const AgentSkillSourceSchema = z.enum(AgentSkillSourceEnum);
export const AgentSkillCategorySchema = z.enum(AgentSkillCategoryEnum);
export const AgentSkillTypeSchema = z.enum(AgentSkillTypeEnum);
export const AgentSkillCreationStatusSchema = z.enum(AgentSkillCreationStatusEnum);
export const SandboxTypeSchema = z.enum(SandboxTypeEnum);
export const SandboxStatusSchema = z.enum([
  SandboxStatusEnum.running,
  SandboxStatusEnum.stopped
] as const);

export const AgentSkillSchema = z.object({
  _id: z.string(),
  parentId: z.string().nullable().optional(),
  type: AgentSkillTypeSchema,
  inheritPermission: z.boolean().optional(),
  source: AgentSkillSourceSchema,
  name: z.string(),
  description: z.string(),
  category: z.array(AgentSkillCategorySchema),
  avatar: z.string().optional(),
  teamId: z.string(),
  tmbId: z.string(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),
  deleteTime: z.coerce.date().nullable().optional(),
  currentVersionId: z.string().optional(),
  creationStatus: AgentSkillCreationStatusSchema.optional(),
  creationError: z.string().optional()
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
  category: z.array(AgentSkillCategorySchema),
  avatar: z.string().optional(),
  currentVersionId: z.string().optional(),
  creationStatus: AgentSkillCreationStatusSchema.optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),
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
  importedAt: z.coerce.date()
});

export const AgentSkillsVersionSchema = z.object({
  _id: z.string(),
  skillId: z.string(),
  tmbId: z.string(),
  versionName: z.string().optional(),
  storageKey: z.string(),
  importSource: AgentSkillsVersionImportSourceSchema.optional(),
  createdAt: z.coerce.date()
});
export type AgentSkillsVersionSchemaType = z.infer<typeof AgentSkillsVersionSchema>;

export const SkillPackageSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.array(AgentSkillCategorySchema),
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

export const SandboxStorageSchema = z.object({
  key: z.string(),
  uploadedAt: z.coerce.date()
});

export const SandboxInstanceDetailSchema = z.object({
  type: SandboxTypeSchema,
  teamId: z.string(),
  tmbId: z.string(),
  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  provider: z.string(),
  image: SandboxImageConfigSchema,
  providerCreatedAt: z.coerce.date(),
  storage: SandboxStorageSchema.optional(),
  metadata: z.union([z.map(z.string(), z.any()), LooseObjectSchema]).optional()
});

export const SandboxInstanceSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  appId: z.string(),
  userId: z.string(),
  chatId: z.string(),
  status: SandboxStatusSchema,
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  detail: SandboxInstanceDetailSchema
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceSchema>;

export const SkillToolSchema = z.object({
  id: z.string(),
  config: z.record(z.string(), z.any())
});
export type SkillToolType = z.infer<typeof SkillToolSchema>;

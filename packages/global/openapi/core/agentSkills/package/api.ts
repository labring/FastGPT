import { z } from 'zod';

/**
 * AgentSkill package editor — zod schemas for the /api/core/agentSkills/package/* surface.
 * Operations: list, read, write, batchWrite, delete, rename, mkdir, upload.
 */

const SkillIdSchema = z.string().min(1).meta({ description: 'Skill ID' });
const RelativePathSchema = z
  .string()
  .min(1)
  .meta({ description: 'Path relative to zip root; no absolute, `..`, or backslash' });

export const SkillPackageBaseSchema = z.object({
  skillId: SkillIdSchema
});

export const PackageFileItemSchema = z.object({
  name: z.string().describe('File or directory name'),
  path: z.string().describe('Full path (relative to zip root)'),
  type: z.enum(['file', 'directory']).describe('Entry type'),
  size: z.number().optional().describe('File size in bytes')
});
export type PackageFileItem = z.infer<typeof PackageFileItemSchema>;

// ============ list ============

export const ListPackageFilesBodySchema = SkillPackageBaseSchema.extend({
  path: z.string().default('.').describe('Directory path, defaults to root')
});
export type ListPackageFilesBody = z.infer<typeof ListPackageFilesBodySchema>;

export const ListPackageFilesResponseSchema = z.object({
  files: z.array(PackageFileItemSchema)
});
export type ListPackageFilesResponse = z.infer<typeof ListPackageFilesResponseSchema>;

// ============ read ============

export const ReadPackageFileBodySchema = SkillPackageBaseSchema.extend({
  path: RelativePathSchema
});
export type ReadPackageFileBody = z.infer<typeof ReadPackageFileBodySchema>;

export const ReadPackageFileResponseSchema = z
  .string()
  .meta({ format: 'binary', description: 'File content stream' });

// ============ write (text) ============

export const WritePackageFileBodySchema = SkillPackageBaseSchema.extend({
  path: RelativePathSchema,
  content: z.string().describe('UTF-8 text content')
});
export type WritePackageFileBody = z.infer<typeof WritePackageFileBodySchema>;

// ============ batch write ============

export const BatchWritePackageFilesBodySchema = SkillPackageBaseSchema.extend({
  files: z
    .array(
      z.object({
        path: RelativePathSchema,
        content: z.string().describe('UTF-8 text content')
      })
    )
    .min(1)
});
export type BatchWritePackageFilesBody = z.infer<typeof BatchWritePackageFilesBodySchema>;

// ============ delete ============

export const DeletePackageEntryBodySchema = SkillPackageBaseSchema.extend({
  path: RelativePathSchema,
  recursive: z.boolean().default(false).describe('Must be true to delete a directory')
});
export type DeletePackageEntryBody = z.infer<typeof DeletePackageEntryBodySchema>;

// ============ rename ============

export const RenamePackageEntryBodySchema = SkillPackageBaseSchema.extend({
  fromPath: RelativePathSchema,
  toPath: RelativePathSchema
});
export type RenamePackageEntryBody = z.infer<typeof RenamePackageEntryBodySchema>;

// ============ mkdir ============

export const MkdirPackageBodySchema = SkillPackageBaseSchema.extend({
  path: RelativePathSchema
});
export type MkdirPackageBody = z.infer<typeof MkdirPackageBodySchema>;

// ============ upload (multipart) ============

export const UploadPackageFileMultipartRequestSchema = {
  type: 'object' as const,
  properties: {
    skillId: {
      type: 'string' as const,
      description: 'Skill ID'
    },
    path: {
      type: 'string' as const,
      description: 'Target path (full zip-internal file path)'
    },
    file: {
      type: 'string' as const,
      format: 'binary' as const,
      description: 'Uploaded file content'
    }
  },
  required: ['skillId', 'path', 'file'] as string[]
};

// ============ common mutate response ============

export const MutatePackageResponseSchema = z.object({
  success: z.literal(true),
  size: z.number().describe('New zip byte count after mutation')
});
export type MutatePackageResponse = z.infer<typeof MutatePackageResponseSchema>;

// ============ sandbox sync ============

export const SyncSkillSandboxBodySchema = SkillPackageBaseSchema;
export type SyncSkillSandboxBody = z.infer<typeof SyncSkillSandboxBodySchema>;

export const SyncSkillSandboxResponseSchema = z.object({
  synced: z.boolean().describe('Whether files were actually pushed to the sandbox'),
  reason: z
    .enum(['noSandbox', 'pushed'])
    .describe(
      'noSandbox = no editDebug sandbox instance yet (lifecycle creates with latest zip); pushed = synced'
    )
});
export type SyncSkillSandboxResponse = z.infer<typeof SyncSkillSandboxResponseSchema>;

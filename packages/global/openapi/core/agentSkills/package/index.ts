import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  ListPackageFilesBodySchema,
  ListPackageFilesResponseSchema,
  ReadPackageFileBodySchema,
  ReadPackageFileResponseSchema,
  WritePackageFileBodySchema,
  BatchWritePackageFilesBodySchema,
  DeletePackageEntryBodySchema,
  RenamePackageEntryBodySchema,
  MkdirPackageBodySchema,
  UploadPackageFileMultipartRequestSchema,
  MutatePackageResponseSchema,
  SyncSkillSandboxBodySchema,
  SyncSkillSandboxResponseSchema
} from './api';

export const AgentSkillsPackagePath: OpenAPIPath = {
  '/core/agentSkills/package/list': {
    post: {
      summary: 'List skill package directory contents',
      description: 'List direct children at the given path inside the current version package.zip',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: ListPackageFilesBodySchema } }
      },
      responses: {
        200: {
          description: 'Directory listing',
          content: { 'application/json': { schema: ListPackageFilesResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/read': {
    post: {
      summary: 'Read a file from the skill package',
      description: 'Read the raw content of a file inside package.zip',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: ReadPackageFileBodySchema } }
      },
      responses: {
        200: { content: { '*/*': { schema: ReadPackageFileResponseSchema } } }
      }
    }
  },
  '/core/agentSkills/package/write': {
    post: {
      summary: 'Write (upsert) a text file in the skill package',
      description: 'Write UTF-8 text content to a path inside package.zip; creates if absent',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: WritePackageFileBodySchema } }
      },
      responses: {
        200: {
          description: 'Write succeeded',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/batchWrite': {
    post: {
      summary: 'Batch write text files in the skill package',
      description: 'Apply multiple text writes in a single zip rewrite',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: BatchWritePackageFilesBodySchema } }
      },
      responses: {
        200: {
          description: 'Batch write succeeded',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/delete': {
    post: {
      summary: 'Delete a file or directory from the skill package',
      description: 'Delete a file, or recursively delete a directory (recursive=true)',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: DeletePackageEntryBodySchema } }
      },
      responses: {
        200: {
          description: 'Delete succeeded',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/rename': {
    post: {
      summary: 'Rename a file or directory in the skill package',
      description: 'Rename / move from fromPath to toPath',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: RenamePackageEntryBodySchema } }
      },
      responses: {
        200: {
          description: 'Rename succeeded',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/mkdir': {
    post: {
      summary: 'Create a directory in the skill package',
      description: 'Create an explicit empty directory entry',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: MkdirPackageBodySchema } }
      },
      responses: {
        200: {
          description: 'Directory created',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/upload': {
    post: {
      summary: 'Upload a binary file to the skill package',
      description: 'Upload via multipart and write binary content to a path in the zip',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'multipart/form-data': { schema: UploadPackageFileMultipartRequestSchema } }
      },
      responses: {
        200: {
          description: 'Upload succeeded',
          content: { 'application/json': { schema: MutatePackageResponseSchema } }
        }
      }
    }
  },
  '/core/agentSkills/package/sandbox/sync': {
    post: {
      summary: 'Sync skill package to the sandbox',
      description:
        'Push the current version package.zip to the running sandbox and unzip in-place. Called before Run Preview so recent editor changes take effect.',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: { 'application/json': { schema: SyncSkillSandboxBodySchema } }
      },
      responses: {
        200: {
          description: 'Sync result',
          content: { 'application/json': { schema: SyncSkillSandboxResponseSchema } }
        }
      }
    }
  }
};

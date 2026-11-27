import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  CreateSkillBodySchema,
  CreateSkillFolderBodySchema,
  DeleteSkillQuerySchema,
  GetSkillDetailQuerySchema,
  ImportSkillQuerySchema,
  ListSkillsV2QuerySchema,
  UpdateSkillBodySchema,
  type CreateSkillFolderResponse,
  type CreateSkillResponse,
  type GetSkillDetailResponse,
  type ImportSkillResponse,
  type ListSkillsResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import type { LoadedBinaryFile } from '../../infra/fs/file-io';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

const MAX_SKILL_NAME_LENGTH = 50;
const MAX_SKILL_DESCRIPTION_LENGTH = 500;

export type SkillListParams = {
  source?: string;
  searchKey?: string;
  category?: string;
  type?: string;
  parentId?: string | null;
  skillIds?: string[];
  page?: number;
  pageSize?: number;
};

export type PlatformSkillService = {
  list: (params: {
    client: FastGptHttpClient;
    input: SkillListParams;
  }) => Promise<CliResult<ListSkillsResponse>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    skillId: string;
  }) => Promise<CliResult<GetSkillDetailResponse>>;
  create: (params: {
    client: FastGptHttpClient;
    input: unknown;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  importPackage: (params: {
    client: FastGptHttpClient;
    file: LoadedBinaryFile;
    input: {
      parentId?: string | null;
      name?: string;
      description?: string;
      avatar?: string;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    input: unknown;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    skillId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  listFolders: (params: {
    client: FastGptHttpClient;
    input: {
      source?: string;
      searchKey?: string;
      parentId?: string | null;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListSkillsResponse>>;
  createFolder: (params: {
    client: FastGptHttpClient;
    input: {
      name: string;
      description?: string;
      parentId?: string | null;
      inheritPermission?: boolean;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateFolder: (params: {
    client: FastGptHttpClient;
    input: {
      folderId: string;
      name?: string;
      description?: string;
      parentId?: string | null;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  deleteFolder: (params: {
    client: FastGptHttpClient;
    folderId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * FastGPT 平台 AI Skill 领域服务：封装技能列表、详情、创建、ZIP 导入及删除能力。
 */
export function createPlatformSkillService(): PlatformSkillService {
  return {
    list: async ({ client, input }) => {
      const { page, skillIds, parentId, source, ...rest } = input;
      const rawBody =
        skillIds !== undefined
          ? {
              ...rest,
              ...(source !== undefined ? { source } : {}),
              skillIds
            }
          : {
              ...rest,
              source: source ?? 'mine',
              // 不传 parentId 时允许服务端搜索全部可读技能；显式传 null 时才限定根目录。
              ...(parentId !== undefined ? { parentId } : {}),
              ...(page !== undefined ? { page } : {})
            };

      const validatedBody = ListSkillsV2QuerySchema.parse(rawBody);
      const data = await client.request<ListSkillsResponse>({
        method: 'POST',
        path: '/core/ai/skill/listV2',
        body: validatedBody
      });

      return createSuccessResult({
        data,
        meta: buildPaginationMeta({
          validatedBody: validatedBody as Record<string, unknown>,
          total: data.total,
          count: data.list.length,
          nonPaginated: skillIds !== undefined
        })
      });
    },

    getDetail: async ({ client, skillId }) => {
      const validatedQuery = GetSkillDetailQuerySchema.parse({
        skillId: trimIfString(skillId)
      });

      const data = await client.request<GetSkillDetailResponse>({
        method: 'GET',
        path: '/core/ai/skill/detail',
        query: validatedQuery
      });

      return createSuccessResult({ data });
    },

    create: async ({ client, input, dryRun }) => {
      const validatedBody = CreateSkillBodySchema.parse(input);
      if (validatedBody.name.length > MAX_SKILL_NAME_LENGTH) {
        throw new CliArgumentError(
          `Skill name cannot exceed ${MAX_SKILL_NAME_LENGTH} characters (got ${validatedBody.name.length}).`,
          undefined,
          `Shorten --name to ${MAX_SKILL_NAME_LENGTH} characters or fewer.`
        );
      }
      const trimmedDescription = validatedBody.description?.trim() ?? '';
      if (trimmedDescription.length > MAX_SKILL_DESCRIPTION_LENGTH) {
        throw new CliArgumentError(
          `Skill description cannot exceed ${MAX_SKILL_DESCRIPTION_LENGTH} characters (got ${trimmedDescription.length}).`,
          undefined,
          `Shorten --description to ${MAX_SKILL_DESCRIPTION_LENGTH} characters or fewer.`
        );
      }

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/ai/skill/create',
            payload: validatedBody
          }
        });
      }

      const skillId = await client.request<CreateSkillResponse>({
        method: 'POST',
        path: '/core/ai/skill/create',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          skillId,
          name: validatedBody.name
        },
        message: `Skill "${validatedBody.name}" created (${skillId}).`
      });
    },

    importPackage: async ({ client, file, input, dryRun }) => {
      if (!file.filename.toLowerCase().endsWith('.zip')) {
        throw new CliArgumentError(
          `Skill package "${file.filename}" must be a .zip archive.`,
          undefined,
          'Package your skill directory into a .zip file containing SKILL.md and try again.'
        );
      }

      const validatedQuery = ImportSkillQuerySchema.parse({
        filename: file.filename,
        parentId: input.parentId ?? undefined,
        ...(input.name !== undefined ? { name: trimIfString(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {})
      });

      // URL 查询参数不传 null，避免 Express/Next 将其序列化为字符串 "null" 后触发 ObjectId 正则失败。
      const queryParams: Record<string, string> = {
        filename: validatedQuery.filename,
        ...(validatedQuery.parentId ? { parentId: validatedQuery.parentId } : {}),
        ...(validatedQuery.name !== undefined ? { name: validatedQuery.name } : {}),
        ...(validatedQuery.description !== undefined
          ? { description: validatedQuery.description }
          : {}),
        ...(validatedQuery.avatar !== undefined ? { avatar: validatedQuery.avatar } : {})
      };

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill import',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/ai/skill/import',
            query: queryParams,
            filename: file.filename,
            sizeBytes: file.size
          }
        });
      }

      const skillId = await client.uploadBinary<ImportSkillResponse>({
        path: '/core/ai/skill/import',
        query: queryParams,
        body: file.data,
        contentType: 'application/zip'
      });

      return createChangedResult({
        data: {
          skillId,
          filename: file.filename,
          name: validatedQuery.name ?? file.filename.replace(/\.zip$/i, ''),
          sizeBytes: file.size
        },
        message: `Skill "${validatedQuery.name ?? file.filename}" imported (${skillId}).`
      });
    },

    update: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateSkillBodySchema.parse(input);
      const hasUpdateFields =
        validatedBody.name !== undefined ||
        validatedBody.description !== undefined ||
        validatedBody.category !== undefined ||
        validatedBody.avatar !== undefined ||
        validatedBody.parentId !== undefined;

      if (!hasUpdateFields) {
        throw new CliArgumentError(
          'At least one field to update is required.',
          undefined,
          'Provide --name, --description, --category, --avatar, --parent-id, or fields via --file / --stdin.'
        );
      }

      if (validatedBody.name !== undefined) {
        const trimmedName = validatedBody.name.trim();
        if (trimmedName.length === 0) {
          throw new CliArgumentError('Skill name cannot be empty.');
        }
        if (trimmedName.length > MAX_SKILL_NAME_LENGTH) {
          throw new CliArgumentError(
            `Skill name cannot exceed ${MAX_SKILL_NAME_LENGTH} characters (got ${trimmedName.length}).`,
            undefined,
            `Shorten --name to ${MAX_SKILL_NAME_LENGTH} characters or fewer.`
          );
        }
      }

      if (
        validatedBody.description !== undefined &&
        validatedBody.description.trim().length > MAX_SKILL_DESCRIPTION_LENGTH
      ) {
        throw new CliArgumentError(
          `Skill description cannot exceed ${MAX_SKILL_DESCRIPTION_LENGTH} characters (got ${validatedBody.description.trim().length}).`,
          undefined,
          `Shorten --description to ${MAX_SKILL_DESCRIPTION_LENGTH} characters or fewer.`
        );
      }

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/ai/skill/update',
            payload: validatedBody
          }
        });
      }

      await client.request<void>({
        method: 'POST',
        path: '/core/ai/skill/update',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          updated: true,
          ...validatedBody
        },
        message: `Skill "${validatedBody.skillId}" updated.`
      });
    },

    delete: async ({ client, skillId, dryRun }) => {
      const validatedQuery = DeleteSkillQuerySchema.parse({
        skillId: trimIfString(skillId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/ai/skill/delete',
            query: validatedQuery
          }
        });
      }

      await client.request<void>({
        method: 'DELETE',
        path: '/core/ai/skill/delete',
        query: validatedQuery
      });

      return createChangedResult({
        data: {
          deleted: true,
          skillId: validatedQuery.skillId
        },
        message: `Skill "${validatedQuery.skillId}" deleted.`
      });
    },

    listFolders: async ({ client, input }) => {
      const { page, parentId, ...rest } = input;
      const validatedBody = ListSkillsV2QuerySchema.parse({
        ...rest,
        source: input.source ?? 'mine',
        type: AgentSkillTypeEnum.folder,
        ...(parentId !== undefined ? { parentId } : {}),
        ...(page !== undefined ? { page } : {})
      });

      const data = await client.request<ListSkillsResponse>({
        method: 'POST',
        path: '/core/ai/skill/listV2',
        body: validatedBody
      });

      return createSuccessResult({
        data,
        meta: buildPaginationMeta({
          validatedBody: validatedBody as Record<string, unknown>,
          total: data.total,
          count: data.list.length
        })
      });
    },

    createFolder: async ({ client, input, dryRun }) => {
      const trimmedName = trimIfString(input.name);
      if (!trimmedName) {
        throw new CliArgumentError(
          'Skill folder name is required.',
          undefined,
          'Pass --name "<folderName>".'
        );
      }
      if (trimmedName.length > MAX_SKILL_NAME_LENGTH) {
        throw new CliArgumentError(
          `Skill folder name cannot exceed ${MAX_SKILL_NAME_LENGTH} characters (got ${trimmedName.length}).`
        );
      }
      const trimmedDescription = input.description?.trim() ?? '';
      if (trimmedDescription.length > MAX_SKILL_DESCRIPTION_LENGTH) {
        throw new CliArgumentError(
          `Skill folder description cannot exceed ${MAX_SKILL_DESCRIPTION_LENGTH} characters (got ${trimmedDescription.length}).`
        );
      }

      const validatedBody = CreateSkillFolderBodySchema.parse({
        parentId: input.parentId ?? null,
        name: trimmedName,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.inheritPermission !== undefined
          ? { inheritPermission: input.inheritPermission }
          : {})
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill folder create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/ai/skill/folder/create',
            payload: validatedBody
          }
        });
      }

      const res = await client.request<CreateSkillFolderResponse>({
        method: 'POST',
        path: '/core/ai/skill/folder/create',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          folderId: res.folderId,
          name: validatedBody.name,
          parentId: validatedBody.parentId ?? null
        },
        message: `Skill folder "${validatedBody.name}" created (${res.folderId}).`
      });
    },

    updateFolder: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateSkillBodySchema.parse({
        skillId: trimIfString(input.folderId),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
      });

      const hasUpdateFields =
        validatedBody.name !== undefined ||
        validatedBody.description !== undefined ||
        validatedBody.parentId !== undefined;
      if (!hasUpdateFields) {
        throw new CliArgumentError(
          'At least one field to update is required.',
          undefined,
          'Provide --name, --description, or --parent-id.'
        );
      }
      if (validatedBody.name !== undefined) {
        const trimmedName = validatedBody.name.trim();
        if (trimmedName.length === 0) {
          throw new CliArgumentError('Skill folder name cannot be empty.');
        }
        if (trimmedName.length > MAX_SKILL_NAME_LENGTH) {
          throw new CliArgumentError(
            `Skill folder name cannot exceed ${MAX_SKILL_NAME_LENGTH} characters (got ${trimmedName.length}).`
          );
        }
      }
      if (
        validatedBody.description !== undefined &&
        validatedBody.description.trim().length > MAX_SKILL_DESCRIPTION_LENGTH
      ) {
        throw new CliArgumentError(
          `Skill folder description cannot exceed ${MAX_SKILL_DESCRIPTION_LENGTH} characters (got ${validatedBody.description.trim().length}).`
        );
      }

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill folder update',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/ai/skill/update',
            payload: validatedBody
          }
        });
      }

      const detail = await client.request<GetSkillDetailResponse>({
        method: 'GET',
        path: '/core/ai/skill/detail',
        query: GetSkillDetailQuerySchema.parse({ skillId: validatedBody.skillId })
      });
      if (detail.type !== AgentSkillTypeEnum.folder) {
        throw new CliArgumentError(
          `Resource "${validatedBody.skillId}" has type "${detail.type ?? 'skill'}", expected skill folder.`
        );
      }

      await client.request<void>({
        method: 'POST',
        path: '/core/ai/skill/update',
        body: validatedBody
      });

      const { skillId, ...restFields } = validatedBody;
      return createChangedResult({
        data: {
          updated: true,
          folderId: skillId,
          ...restFields
        },
        message: `Skill folder "${skillId}" updated.`
      });
    },

    deleteFolder: async ({ client, folderId, dryRun }) => {
      const validatedQuery = DeleteSkillQuerySchema.parse({
        skillId: trimIfString(folderId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'skill folder delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/ai/skill/delete',
            query: validatedQuery
          }
        });
      }

      const detail = await client.request<GetSkillDetailResponse>({
        method: 'GET',
        path: '/core/ai/skill/detail',
        query: GetSkillDetailQuerySchema.parse({ skillId: validatedQuery.skillId })
      });
      if (detail.type !== AgentSkillTypeEnum.folder) {
        throw new CliArgumentError(
          `Resource "${validatedQuery.skillId}" has type "${detail.type ?? 'skill'}", expected skill folder.`
        );
      }

      await client.request<void>({
        method: 'DELETE',
        path: '/core/ai/skill/delete',
        query: validatedQuery
      });

      return createChangedResult({
        data: {
          deleted: true,
          folderId: validatedQuery.skillId
        },
        message: `Skill folder "${validatedQuery.skillId}" deleted.`
      });
    }
  };
}

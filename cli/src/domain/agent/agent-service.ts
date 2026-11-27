import { AppTypeEnum, AppTypeList } from '@fastgpt/global/core/app/constants';
import {
  CreateAppRequestBodySchema,
  type CreateAppResponseType,
  type GetAppDetailResponseType,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { isPlainObject, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import { createAppFolderService } from '../shared/app-folder-service';
import {
  deleteAppResource,
  fetchAndAssertAppType,
  listAppResources,
  parseCreatedAppId,
  updateAppMetadataResource
} from '../shared/app-resource';

const AGENT_TREE_TYPES = [
  AppTypeEnum.chatAgent,
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.folder
] as const;

const AGENT_TREE_TYPE_SET = new Set<string>(AGENT_TREE_TYPES);
const AGENT_RESOURCE_TYPE_SET = new Set<string>(AppTypeList);
const TOOL_RESOURCE_TYPE_SET = new Set<string>([
  AppTypeEnum.mcpToolSet,
  AppTypeEnum.httpToolSet,
  AppTypeEnum.workflowTool,
  AppTypeEnum.toolFolder
]);

function validateAgentListTypes(types?: readonly string[]): AppTypeEnum[] {
  if (!types || types.length === 0) {
    return [...AGENT_TREE_TYPES];
  }

  const validated: AppTypeEnum[] = [];
  for (const rawType of types) {
    const trimmed = rawType.trim();
    if (trimmed === 'workflow') {
      throw new CliArgumentError(
        'Invalid agent type "workflow".',
        undefined,
        'Use "--type advanced" for workflow agents.'
      );
    }
    if (TOOL_RESOURCE_TYPE_SET.has(trimmed)) {
      throw new CliArgumentError(
        `Resource type "${trimmed}" belongs to the tool tree, not the agent tree.`,
        undefined,
        'Use "fastgpt tool mcp list", "fastgpt tool http list", or "fastgpt tool folder list".'
      );
    }
    if (!AGENT_TREE_TYPE_SET.has(trimmed)) {
      throw new CliArgumentError(
        `Invalid agent list type "${trimmed}". Allowed types: ${AGENT_TREE_TYPES.join(', ')}.`
      );
    }
    validated.push(trimmed as AppTypeEnum);
  }
  return validated;
}

function assertAgentCreateType(rawType: unknown, nodes?: unknown): AppTypeEnum {
  const type = typeof rawType === 'string' ? rawType.trim() : '';
  if (!type) {
    // 未显式指定类型时自动推导：带节点编排的默认 advanced，否则默认 chatAgent。
    return Array.isArray(nodes) && nodes.length > 0 ? AppTypeEnum.workflow : AppTypeEnum.chatAgent;
  }
  if (type === 'workflow') {
    throw new CliArgumentError(
      'Invalid agent type "workflow".',
      undefined,
      'Use "--type advanced" for workflow agents.'
    );
  }
  if (type === AppTypeEnum.folder) {
    throw new CliArgumentError(
      'Cannot create a folder with "agent create".',
      undefined,
      'Use "fastgpt agent folder create --name <name>" instead.'
    );
  }
  if (TOOL_RESOURCE_TYPE_SET.has(type)) {
    throw new CliArgumentError(
      `Resource type "${type}" belongs to the tool tree, not agents.`,
      undefined,
      'Use "fastgpt tool mcp create", "fastgpt tool http create", or "fastgpt tool folder create".'
    );
  }
  if (!AGENT_RESOURCE_TYPE_SET.has(type)) {
    throw new CliArgumentError(
      `Invalid agent type "${type}". Allowed types: ${AppTypeList.join(', ')}.`
    );
  }
  return type as AppTypeEnum;
}

export type AgentService = {
  list: (params: {
    client: FastGptHttpClient;
    input: {
      searchKey?: string;
      type?: string[];
      parentId?: string | null;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListAppV2ResponseType>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    agentId: string;
  }) => Promise<CliResult<GetAppDetailResponseType>>;
  create: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    agentId: string;
    input: {
      name?: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    agentId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  listFolders: (params: {
    client: FastGptHttpClient;
    input: {
      searchKey?: string;
      parentId?: string | null;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListAppV2ResponseType>>;
  createFolder: (params: {
    client: FastGptHttpClient;
    input: {
      name: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
      inheritPermission?: boolean;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  updateFolder: (params: {
    client: FastGptHttpClient;
    folderId: string;
    input: {
      name?: string;
      intro?: string;
      avatar?: string;
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
 * FastGPT Agent 与 Agent 目录领域服务：
 * 严格限定在 Agent 资源树（`chatAgent` / `simple` / `advanced` / `folder`），与工具树物理隔离。
 */
export function createAgentService(): AgentService {
  const folderService = createAppFolderService({
    folderType: AppTypeEnum.folder,
    commandPrefix: 'agent folder',
    label: 'agent folder',
    capitalizedLabel: 'Agent folder'
  });

  return {
    list: async ({ client, input }) =>
      listAppResources({
        client,
        types: validateAgentListTypes(input.type),
        input
      }),

    getDetail: async ({ client, agentId }) => {
      const detail = await fetchAndAssertAppType({
        client,
        appId: agentId,
        allowedTypes: AppTypeList,
        resourceLabel: 'agent'
      });
      return createSuccessResult({ data: detail });
    },

    create: async ({ client, input, dryRun }) => {
      if (!isPlainObject(input)) {
        throw new CliArgumentError('Agent create payload must be a JSON object.');
      }

      // 防止将未编译的本地 workflow.json 直接提交给 /core/app/create。
      if ('schemaVersion' in input) {
        throw new CliArgumentError(
          'Raw workflow.json (containing "schemaVersion") cannot be passed directly to "agent create".',
          undefined,
          'Compile it first with "fastgpt workflow-build build --output store-workflow.json", then pass --file store-workflow.json.'
        );
      }

      const name = trimIfString(input.name);
      if (!name) {
        throw new CliArgumentError(
          'Agent name is required.',
          undefined,
          'Pass --name "<agentName>" or provide "name" in --file / --stdin JSON.'
        );
      }

      const type = assertAgentCreateType(input.type, input.nodes);
      const validatedBody = CreateAppRequestBodySchema.parse({
        ...input,
        name,
        type
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'agent create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/create',
            payload: validatedBody
          }
        });
      }

      const rawAgentId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/create',
        body: validatedBody
      });
      const agentId = parseCreatedAppId(rawAgentId, 'agent');

      return createChangedResult({
        data: {
          agentId,
          name: validatedBody.name,
          type: validatedBody.type,
          ...(validatedBody.parentId !== undefined ? { parentId: validatedBody.parentId } : {})
        },
        message: `Agent "${validatedBody.name}" (${validatedBody.type}) created (${agentId}).`
      });
    },

    update: ({ client, agentId, input, dryRun }) =>
      updateAppMetadataResource({
        client,
        appId: agentId,
        input,
        allowedTypes: AppTypeList,
        resourceLabel: 'agent',
        capitalizedLabel: 'Agent',
        idField: 'agentId',
        operation: 'agent update',
        dryRun
      }),

    delete: ({ client, agentId, dryRun }) =>
      deleteAppResource({
        client,
        appId: agentId,
        allowedTypes: AppTypeList,
        resourceLabel: 'agent',
        capitalizedLabel: 'Agent',
        idField: 'agentId',
        operation: 'agent delete',
        dryRun
      }),

    listFolders: folderService.list,
    createFolder: folderService.create,
    updateFolder: folderService.update,
    deleteFolder: folderService.delete
  };
}

import { getAgentToolRuntimeStatus } from '../../core/app/formEdit/utils';
import { isToolNotExistError } from '../../core/app/utils';
import { AppErrEnum } from '../error/code/app';
import { PluginErrEnum } from '../error/code/plugin';
import { ERROR_RESPONSE } from '../error/errorCode';
import { NodeInputKeyEnum } from '../../core/workflow/constants';
import {
  HttpToolSetNodeConfigSchema,
  McpToolSetNodeConfigSchema
} from '../../core/workflow/type/node';
import type { SelectedToolItemType } from '../../core/app/formEdit/type';

/** 共享检查的事实分类；调用方负责映射到各自已有的 Issue 与表单文案契约。 */
export type WorkflowSandboxIssue = 'skills_unavailable' | 'not_configured' | 'plan_not_supported';
export type WorkflowResourceIssue = 'no_permission' | 'missing';
export type WorkflowPluginDataIssue = 'no_permission' | 'missing' | 'load_failed';

/** 将插件错误状态和翻译后的消息统一分类；调用方负责映射到各自的公开错误码。 */
export const getWorkflowPluginDataIssue = (error: string): WorkflowPluginDataIssue => {
  if (
    error === 'resource_no_permission' ||
    error === AppErrEnum.unAuthApp ||
    error === PluginErrEnum.unAuth ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return 'no_permission';
  }
  if (
    error === 'tool_missing' ||
    error === 'resource_missing' ||
    error === AppErrEnum.unExist ||
    error === PluginErrEnum.unExist ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message ||
    isToolNotExistError(error)
  ) {
    return 'missing';
  }
  return 'load_failed';
};

/** Agent 有技能时，沙盒缺省、关闭、未配置或套餐不支持都映射为技能不可用。 */
export const getWorkflowSandboxIssue = ({
  useSandbox,
  hasSkills,
  configured,
  planSupported
}: {
  useSandbox: boolean;
  hasSkills: boolean;
  configured: boolean;
  planSupported: boolean;
}): WorkflowSandboxIssue | undefined => {
  if (hasSkills && (!useSandbox || !configured || !planSupported)) return 'skills_unavailable';
  if (!useSandbox) return undefined;
  if (!configured) return 'not_configured';
  if (!planSupported) return 'plan_not_supported';
  return undefined;
};

/** 资源快照可能同时包含无权限和缺失标记；同类事实在调用方聚合前只返回一次。 */
export const getWorkflowResourceIssues = (resources: unknown): WorkflowResourceIssue[] => {
  if (!Array.isArray(resources)) return [];
  const items = resources.filter(
    (item): item is { error?: unknown } => !!item && typeof item === 'object'
  );
  const issues: WorkflowResourceIssue[] = [];
  if (items.some((item) => item.error === 'resource_no_permission')) issues.push('no_permission');
  if (items.some((item) => !!item.error && item.error !== 'resource_no_permission')) {
    issues.push('missing');
  }
  return issues;
};

/** Agent 存在 datasetParams 时只检查其中的资源，与运行参数选择保持一致。 */
export const getAgentDatasetResourceSource = ({
  datasetParams,
  datasetSelectList
}: {
  datasetParams: unknown;
  datasetSelectList: unknown;
}): {
  value: unknown;
  inputKey: NodeInputKeyEnum.datasetParams | NodeInputKeyEnum.datasetSelectList;
} => {
  if (datasetParams) {
    return {
      value:
        typeof datasetParams === 'object' &&
        datasetParams !== null &&
        !Array.isArray(datasetParams) &&
        'datasets' in datasetParams
          ? datasetParams.datasets
          : undefined,
      inputKey: NodeInputKeyEnum.datasetParams
    };
  }
  return { value: datasetSelectList, inputKey: NodeInputKeyEnum.datasetSelectList };
};

/** 画布与发布共用 MCP、HTTP ToolSet 的未配置判定。 */
export const isWorkflowToolSetUnconfigured = (toolConfig: unknown): boolean => {
  const config =
    typeof toolConfig === 'object' && toolConfig !== null
      ? (toolConfig as Record<string, unknown>)
      : undefined;
  const mcp = McpToolSetNodeConfigSchema.safeParse(config?.mcpToolSet).data;
  const http = HttpToolSetNodeConfigSchema.safeParse(config?.httpToolSet).data;
  return Boolean(
    (mcp && (!mcp.url.trim() || !mcp.toolList.length)) ||
    (http && (!http.apiSchemaUrl?.trim() || !http.toolList.length))
  );
};

/** 返回无效、离线或缺少必要配置的工具，供画布和发布映射各自的问题契约。 */
export const getAbnormalWorkflowAgentTools = (
  tools: readonly SelectedToolItemType[] = []
): SelectedToolItemType[] =>
  tools.filter((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const status = getAgentToolRuntimeStatus(tool);
    return status === 'invalid' || status === 'offline' || status === 'waitingForConfig';
  });

import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { TFunction } from 'next-i18next';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { isToolNotExistError } from '@fastgpt/global/core/app/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { getWorkflowModelDetails } from '@/web/core/workflow/modelData';
import {
  checkWorkflowBeforeRunOrPublish,
  getWorkflowCheckIssueMessage
} from '@/web/core/workflow/workflowCheck';
import { checkAgentSkillSandboxUnavailable } from '../ChatAgent/utils';
import type { Form2WorkflowFnType } from './type';

const PLUGIN_DATA_PERMISSION_ERROR_CODES = new Set<string>([
  AppErrEnum.unAuthApp,
  PluginErrEnum.unAuth
]);

const PLUGIN_DATA_MISSING_ERROR_CODES = new Set<string>([
  AppErrEnum.unExist,
  PluginErrEnum.unExist
]);

/**
 * 校验表单中的沙箱配置与系统可用性约束。
 */
export const checkAppFormSandboxIssues = ({
  appForm,
  showSandbox,
  enableSandbox,
  t
}: {
  appForm: AppFormEditFormType;
  showSandbox?: boolean;
  enableSandbox?: boolean;
  t: TFunction;
}): string | undefined => {
  if (
    checkAgentSkillSandboxUnavailable({
      appForm,
      showSandbox,
      enableSandbox
    })
  ) {
    return t('skill:sandbox_skill_unavailable_toast');
  }

  if (appForm.aiSettings.useAgentSandbox) {
    if (!showSandbox) {
      return t('skill:sandbox_system_not_configured_toast');
    }
    if (!enableSandbox) {
      return t('app:sandbox_free_not_support');
    }
  }

  return undefined;
};

/**
 * 校验表单应用（对话 Agent 与对话 Agent V2）在发布前的表单级资源状态。
 *
 * 职责：
 * 1. 在点击「保存并发布」时，主动扫描表单中引用的工具（selectedTools）、技能（selectedAgentSkills）、知识库（dataset.datasets）；
 * 2. 对无权限、已下线、已删除/不存在、配置无效等异常状态进行前端拦截；
 * 3. 返回与界面卡片标签对齐的精准错误文案，防止非法请求穿透至后端 `/api/core/app/version/publish` 抛出全局 `unAuthApp`。
 *
 * 设计原因：
 * - Agent 将工具展开为独立的 Tool Node，能被 `workflowCheck` 扫描；而 AgentV2 将工具收敛在 Agent 节点的输入参数中；
 * - 现阶段工作流校验器未开放 Agent 节点的内部工具校验，为保证两类表单应用在发布拦截体验上的完全一致，在表单层统一执行资源校验。
 *
 * @param appForm 当前编辑表单数据
 * @param t 国际化翻译函数
 * @returns 若存在异常，返回已翻译的具体错误提示文案；全部可用时返回 undefined。
 */
export const checkAppFormResourceIssues = ({
  appForm,
  t
}: {
  appForm: AppFormEditFormType;
  t: TFunction;
}): string | undefined => {
  // 1. 检查选中的工具（Agent & AgentV2 均使用）
  for (const tool of appForm.selectedTools || []) {
    const isOffline = (tool.status ?? tool.pluginData?.status) === PluginStatusEnum.Offline;
    const error = tool.pluginData?.error;

    if (error) {
      if (
        error === 'resource_no_permission' ||
        PLUGIN_DATA_PERMISSION_ERROR_CODES.has(error) ||
        error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
        error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
      ) {
        return getWorkflowCheckIssueMessage('resource_no_permission', t);
      }

      if (
        error === 'resource_missing' ||
        PLUGIN_DATA_MISSING_ERROR_CODES.has(error) ||
        error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
        error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message ||
        isToolNotExistError(error)
      ) {
        return getWorkflowCheckIssueMessage('tool_missing', t);
      }

      return getWorkflowCheckIssueMessage('tool_load_failed', t);
    }

    if (isOffline) {
      return getWorkflowCheckIssueMessage('tool_offline', t);
    }

    if (tool.configStatus === 'invalid') {
      return t('app:app.error.publish_unExist_app');
    }
  }

  // 2. 检查选中的技能（AgentV2 专有）
  for (const skill of appForm.selectedAgentSkills || []) {
    if (skill.error === 'resource_no_permission') {
      return getWorkflowCheckIssueMessage('resource_no_permission', t);
    }
    if (skill.error) {
      return getWorkflowCheckIssueMessage('resource_missing', t);
    }
  }

  // 3. 检查知识库
  for (const dataset of appForm.dataset?.datasets || []) {
    if (dataset.error === 'resource_no_permission') {
      return getWorkflowCheckIssueMessage('resource_no_permission', t);
    }
    if (dataset.error) {
      return getWorkflowCheckIssueMessage('resource_missing', t);
    }
  }

  return undefined;
};

/**
 * 表单应用（Agent & AgentV2）发布前的统一校验主入口。
 *
 * 职责：
 * 1. 依次执行沙箱约束、表单引用资源（工具/技能/知识库）有效性与权限检查；
 * 2. 转换为渲染用工作流节点并调用全图校验（模型可用性、节点输入完整性等）；
 * 3. 统一提取最先命中的具体错误文案，在前端提前阻断无效发布请求。
 *
 * @returns 若校验失败返回具体的错误文案；全部校验通过返回 undefined。
 */
export const checkAppFormBeforePublish = async ({
  appForm,
  form2WorkflowFn,
  showSandbox,
  enableSandbox,
  t
}: {
  appForm: AppFormEditFormType;
  form2WorkflowFn: Form2WorkflowFnType;
  showSandbox?: boolean;
  enableSandbox?: boolean;
  t: TFunction;
}): Promise<string | undefined> => {
  // 1. 沙箱环境检查
  const sandboxError = checkAppFormSandboxIssues({
    appForm,
    showSandbox,
    enableSandbox,
    t
  });
  if (sandboxError) return sandboxError;

  // 2. 表单级资源状态与权限检查（工具、技能、知识库）
  const resourceError = checkAppFormResourceIssues({ appForm, t });
  if (resourceError) return resourceError;

  // 3. 工作流图级校验（模型可用性、节点输入完整性等）
  const { nodes: storeNodes, edges: storeEdges } = form2WorkflowFn(appForm, t);

  const toolNodeIds = new Set(
    storeEdges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const nodes = storeNodes.map((item) =>
    storeNode2FlowNode({
      item,
      t,
      isTool: toolNodeIds.has(item.nodeId)
    })
  );
  const edges = storeEdges.map((item) => storeEdge2RenderEdge({ edge: item }));

  const checkResults = checkWorkflowBeforeRunOrPublish({
    nodes,
    edges,
    models: await getWorkflowModelDetails(nodes),
    t
  });

  if (checkResults.hasError) {
    const firstIssue = checkResults.firstErrorNodeId
      ? checkResults.issueMap[checkResults.firstErrorNodeId]?.find((item) => item.level === 'error')
      : undefined;

    return (
      firstIssue?.message ||
      t('app:app.error.publish_unExist_app') ||
      t('common:core.workflow.Check Failed')
    );
  }

  return undefined;
};

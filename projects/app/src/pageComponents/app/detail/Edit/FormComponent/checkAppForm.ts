import { checkStoreWorkflowBeforeRunOrPublish } from '@/web/core/workflow/service';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { TFunction } from 'next-i18next';
import {
  getToolErrorMessage,
  getWorkflowCheckIssueMessage
} from '@/web/core/workflow/check/message';
import {
  checkAgentResourceIssues,
  checkAgentSandboxIssues
} from '@/web/core/workflow/check/resource';
import type { Form2WorkflowFnType } from './type';

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
  const issue = checkAgentSandboxIssues({
    useAgentSandbox: Boolean(appForm.aiSettings.useAgentSandbox),
    hasSkills: Boolean(appForm.selectedAgentSkills?.length),
    showSandbox,
    enableSandbox
  })[0];
  return issue ? getWorkflowCheckIssueMessage({ issueCode: issue.code, t }) : undefined;
};

/** 表单只适配数据与精确文案，工具、技能和知识库的有效性规则统一由工作流资源检查提供。 */
export const checkAppFormResourceIssues = ({
  appForm,
  t
}: {
  appForm: AppFormEditFormType;
  t: TFunction;
}): string | undefined => {
  const issue = checkAgentResourceIssues({
    selectedTools: appForm.selectedTools,
    skills: appForm.selectedAgentSkills,
    datasets: appForm.dataset.datasets
  })[0];
  if (!issue) return;
  if (issue.tool) {
    return (
      getToolErrorMessage({
        status: issue.tool.status ?? issue.tool.pluginData?.status,
        error: issue.tool.pluginData?.error,
        t
      }) ?? t('app:app.error.publish_unExist_app')
    );
  }
  return getWorkflowCheckIssueMessage({ issueCode: issue.code, t });
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
  appId,
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
  appId?: string;
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
  const workflow = form2WorkflowFn(appForm, t);
  const checkResults = await checkStoreWorkflowBeforeRunOrPublish({
    appId,
    // 原始表单已检查资源与沙箱，序列化后的图只补模型、输入和连线检查。
    checkAgentResources: false,
    sandbox: { showSandbox, enableSandbox },
    nodes: workflow.nodes,
    edges: workflow.edges,
    chatConfig: appForm.chatConfig,
    t
  });

  if (checkResults.hasError) {
    return (
      checkResults.firstErrorIssue?.message ||
      t('app:app.error.publish_unExist_app') ||
      t('common:core.workflow.Check Failed')
    );
  }

  return undefined;
};

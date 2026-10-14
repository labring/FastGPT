import type { UseToastOptions } from '@chakra-ui/react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'next-i18next';
import type { StoreWorkflow } from '@fastgpt/global/core/workflow/editor/protocol';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { serializeRuntime } from '../codec';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import {
  collectWorkflowErrorIssues,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';

type WorkflowRuntimeRef = MutableRefObject<WorkflowRuntimePort | null>;
type PendingSaveRevisionRef = MutableRefObject<number | undefined>;

export type WorkflowSaveRequest = {
  runtime: WorkflowRuntimePort;
  sessionId: string;
  appId: string;
  contentRevision: number;
  requestToken: number;
  data: StoreWorkflow;
};

type WorkflowSaveRequestInput = Omit<WorkflowSaveRequest, 'requestToken'>;
type WorkflowSaveRequestScope = {
  runtime: WorkflowRuntimePort | null;
  sessionId: string;
  appId: string;
};

type WorkflowPersistenceArgs = {
  runtimeRef: WorkflowRuntimeRef;
  pendingSaveRevisionRef: PendingSaveRevisionRef;
};

/** 只接受当前 Session、Runtime、应用与请求 token 的保存响应。 */
export const createWorkflowSaveCoordinator = () => {
  let requestToken = 0;
  let activeRequest: WorkflowSaveRequest | undefined;

  return {
    begin: (input: WorkflowSaveRequestInput): WorkflowSaveRequest => {
      const request = {
        ...input,
        requestToken: ++requestToken
      };
      activeRequest = request;
      return request;
    },
    invalidate: () => {
      requestToken += 1;
      activeRequest = undefined;
    },
    isCurrent: (request: WorkflowSaveRequest, scope: WorkflowSaveRequestScope) =>
      activeRequest === request &&
      request.requestToken === requestToken &&
      scope.runtime === request.runtime &&
      scope.sessionId === request.sessionId &&
      scope.appId === request.appId &&
      !request.runtime.isDisposed()
  };
};

/** 序列化当前 Runtime，并记住本次请求对应的内容版本供保存成功后回填。 */
export const serializeWorkflowData = ({
  runtimeRef,
  pendingSaveRevisionRef
}: WorkflowPersistenceArgs): StoreWorkflow | undefined => {
  const current = runtimeRef.current;
  if (!current || current.isDisposed()) return undefined;
  pendingSaveRevisionRef.current = current.getSavepoint().contentRevision;
  return serializeRuntime(current);
};

/**
 * 发布校验 gate：等待模型目录、按环境事实刷新 Issue View，再决定是否出站序列化。
 * 普通保存和调试直接使用 serializeWorkflowData；校验失败只写焦点与提示，不返回不完整文档。
 * hideTip 只抑制提示和焦点定位。
 */
export const serializeWorkflowAndCheckData = async ({
  runtimeRef,
  pendingSaveRevisionRef,
  hideTip = false,
  toast,
  t,
  focusIssueNode
}: WorkflowPersistenceArgs & {
  hideTip?: boolean;
  toast: (options?: UseToastOptions) => void;
  t: TFunction;
  focusIssueNode: (nodeId?: string) => void;
}): Promise<StoreWorkflow | undefined> => {
  const current = runtimeRef.current;
  if (!current || current.isDisposed()) return undefined;

  const catalog = await ensureModelCatalog().catch(() => undefined);
  if (!catalog) {
    if (!hideTip) toast({ status: 'error', title: 'common:model_catalog_load_failed' });
    return undefined;
  }
  if (current.isDisposed()) return undefined;

  const errors = collectWorkflowErrorIssues(current);
  if (errors.length === 0) {
    focusIssueNode(undefined);
    return serializeWorkflowData({ runtimeRef, pendingSaveRevisionRef });
  }

  if (!hideTip) {
    const firstErrorNodeId = current
      .getWorkflow()
      .nodes.find((node) => node.issues.some((issue) => issue.level === 'error'))?.nodeId;
    if (firstErrorNodeId) focusIssueNode(firstErrorNodeId);
    toast({
      status: 'warning',
      title: 'common:core.workflow.Check Failed',
      description: errors.map((issue) => renderWorkflowIssueMessage(issue, t)).join('\n')
    });
  }
  return undefined;
};
